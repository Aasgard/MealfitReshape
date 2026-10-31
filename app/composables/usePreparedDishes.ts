import { collection, deleteDoc, deleteField, doc, increment, query, setDoc, Timestamp, updateDoc, where, writeBatch, type WriteBatch } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Meal, MealSource, RecipeMealSource } from '~/types/meal'
import type { DishBatchSurplus, DishStorage, PreparedDish } from '~/types/preparedDish'
import type { IngredientMacros } from '~/utils/ingredientNutrition'
import { findBatchSurplus, formatParts, PARTS_EPSILON, stockDemand, stockDemandError } from '~/utils/preparedDishes'
import { dayKeyOf } from '~/utils/menuWeek'

/** Ce qu'on saisit d'un plat du stock (ajout à la main ou modification). */
export type PreparedDishInput = {
  label: string
  recipeId?: string
  perPart: IngredientMacros
  parts: number
  storage: DishStorage
  preparedOn: string
  comment?: string
}

/** Surplus prévu d'une fournée, tel que déclaré depuis « Cuisiner ». */
export type BatchSurplusInput = DishBatchSurplus & {
  recipeId: string
  label: string
  perPart: IngredientMacros
  storage: DishStorage
  comment?: string
}

/** Repas ajouté ou retiré, avec son jour (`yyyy-MM-dd`), pour le décompte du stock. */
export type StockMealChange = { source: MealSource, day: string }

/**
 * Stock de plats préparés du foyer (collection Firestore `preparedDishes`) et écritures associées. Chaque membre prend
 * et range dans les plats de tous ; un plat suit son créateur (`owner`), qui l'emporte en quittant le foyer. Les parts
 * placées dans un repas sont retirées du plat dans la même écriture que le repas (voir `useMeals`) ; supprimer ou
 * réduire le repas les rend.
 */
export const usePreparedDishes = () => {
  const db = useFirestore()
  const user = useCurrentUser()
  const { memberIds, shared, loading: householdLoading } = useHousehold()

  /** Plats des membres du foyer ; ceux des autres attendent que les règles puissent les ouvrir (`shared`). */
  const dishes = useCollection<PreparedDish>(() => {
    const uid = user.value?.uid
    if (!uid || householdLoading.value) return null
    return query(collection(db, 'preparedDishes'), where('owner', 'in', shared.value ? memberIds.value : [uid]))
  })

  const dishesById = computed(() => new Map(dishes.value.map(dish => [dish.id, dish])))

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  /**
   * Ajoute à `batch` le décompte des repas retirés (`removed`) et ajoutés (`added`) : parts prises ou rendues à chaque
   * plat, et jour du dernier repas. Lève une erreur si un repas ajouté ne peut pas être servi par le stock.
   * Un plat retiré du stock depuis est ignoré pour les parts rendues (il n'y a plus où les rendre).
   */
  const stageStockChanges = async (batch: WriteBatch, removed: StockMealChange[], added: StockMealChange[]) => {
    const isStock = (change: StockMealChange) => change.source.category === 'STOCK'
    if (!removed.some(isStock) && !added.some(isStock)) return

    await dishes.promise.value
    const byId = dishesById.value
    const demand = stockDemand(removed.map(c => c.source), added.map(c => c.source))
    const error = stockDemandError(demand, added, byId)
    if (error) throw new Error(error)

    const now = Timestamp.now()
    for (const [dishId, parts] of demand) {
      const dish = byId.get(dishId)
      if (!dish) continue
      const lastDay = added
        .filter(c => c.source.category === 'STOCK' && c.source.dishId === dishId)
        .reduce<string | undefined>((latest, c) => (!latest || c.day > latest ? c.day : latest), dish.lastMealOn)
      const update: Record<string, unknown> = { updatedAt: now }
      if (Math.abs(parts) > PARTS_EPSILON) update.parts = increment(-parts)
      if (lastDay && lastDay !== dish.lastMealOn) update.lastMealOn = lastDay
      if (Object.keys(update).length > 1) batch.update(doc(db, 'preparedDishes', dishId), update)
    }
  }

  /** Repas du stock déplacé à un autre jour : un plat épuisé reste affiché jusqu'à son repas le plus tardif. */
  const stageStockMove = (batch: WriteBatch, source: MealSource, day: string) => {
    if (source.category !== 'STOCK') return
    const dish = dishesById.value.get(source.dishId)
    if (!dish || (dish.lastMealOn && dish.lastMealOn >= day)) return
    batch.update(doc(db, 'preparedDishes', dish.id), { lastMealOn: day, updatedAt: Timestamp.now() })
  }

  const optional = (value: string | undefined) => value?.trim() || undefined

  /** Crée un plat (`existing` absent) ou le remplace par la saisie, en gardant son surplus de fournée et son historique. */
  const saveDish = async (input: PreparedDishInput, existing?: PreparedDish | null) => {
    const uid = requireUid()
    const now = Timestamp.now()
    const comment = optional(input.comment)
    const fields = {
      label: input.label.trim(),
      perPart: input.perPart,
      parts: input.parts,
      storage: input.storage,
      preparedOn: input.preparedOn,
      updatedAt: now,
    }
    /**
     * Une recette à cuisiner plus tard pour le stock est une fournée sans repas : son surplus (parts restantes, plus
     * celles déjà placées dans des repas) compte dans « Cuisiner » et dans la liste de courses le jour de cuisine.
     */
    const isFutureBatch = !!input.recipeId && input.preparedOn > dayKeyOf(new Date())
    const taken = existing?.batch ? Math.max(0, existing.batch.surplusParts - existing.parts) : 0
    const batch: DishBatchSurplus | null = input.recipeId && (existing?.batch || isFutureBatch)
      ? { cookDay: input.preparedOn, surplusParts: taken + input.parts }
      : null
    if (existing) {
      await updateDoc(doc(db, 'preparedDishes', existing.id), {
        ...fields,
        recipeId: input.recipeId ?? deleteField(),
        comment: comment ?? deleteField(),
        batch: batch ?? deleteField(),
        // Remis à 0 à la main : il reste affiché jusqu'à ce soir.
        ...(input.parts < PARTS_EPSILON && existing.parts >= PARTS_EPSILON ? { lastMealOn: dayKeyOf(new Date()) } : {}),
      })
      return
    }
    await setDoc(doc(collection(db, 'preparedDishes')), {
      ...fields,
      ...(input.recipeId ? { recipeId: input.recipeId } : {}),
      ...(comment ? { comment } : {}),
      ...(batch ? { batch } : {}),
      owner: uid,
      createdAt: now,
    })
  }

  /**
   * Corrige les parts restantes (part oubliée, jetée...). Pas encore cuisiné, un surplus de fournée suit : c'est ce qu'il
   * reste à cuisiner (« Cuisiner », liste de courses) qui change.
   */
  const setDishParts = (dish: PreparedDish, parts: number) => {
    const next = Math.max(0, parts)
    const isUncooked = !!dish.batch && dish.preparedOn > dayKeyOf(new Date())
    return updateDoc(doc(db, 'preparedDishes', dish.id), {
      parts: next,
      updatedAt: Timestamp.now(),
      ...(isUncooked ? { batch: { ...dish.batch, surplusParts: Math.max(0, dish.batch!.surplusParts + next - dish.parts) } } : {}),
      ...(next < PARTS_EPSILON ? { lastMealOn: dayKeyOf(new Date()) } : {}),
    })
  }

  const setDishStorage = (dish: PreparedDish, storage: DishStorage) =>
    updateDoc(doc(db, 'preparedDishes', dish.id), { storage, updatedAt: Timestamp.now() })

  /** Les repas qui y ont pioché gardent leur copie du plat (libellé, macros) : ils restent affichés. */
  const deleteDish = (dish: PreparedDish) => deleteDoc(doc(db, 'preparedDishes', dish.id))

  /**
   * Déclare, modifie ou annule (0 part) le surplus prévu d'une fournée. Les parts déjà placées dans des repas restent
   * prises : le surplus ne descend pas en dessous, et le plat n'est supprimé que s'il n'en a servi aucune.
   * Renvoie l'id du plat, `null` quand il n'y a plus de surplus.
   */
  const saveBatchSurplus = async (input: BatchSurplusInput, existing?: PreparedDish | null): Promise<string | null> => {
    const uid = requireUid()
    const now = Timestamp.now()
    const comment = optional(input.comment)
    const batchFields: DishBatchSurplus = { cookDay: input.cookDay, surplusParts: input.surplusParts }

    if (!existing) {
      if (input.surplusParts < PARTS_EPSILON) return null
      const ref = doc(collection(db, 'preparedDishes'))
      await setDoc(ref, {
        owner: uid,
        label: input.label,
        recipeId: input.recipeId,
        perPart: input.perPart,
        parts: input.surplusParts,
        storage: input.storage,
        preparedOn: input.cookDay,
        batch: batchFields,
        ...(comment ? { comment } : {}),
        createdAt: now,
        updatedAt: now,
      })
      return ref.id
    }

    const previous = existing.batch?.surplusParts ?? existing.parts
    const taken = Math.max(0, previous - existing.parts)
    if (input.surplusParts < taken - PARTS_EPSILON) {
      throw new Error(`${formatParts(taken)} de ce surplus ${taken > 1 ? 'sont déjà prévues' : 'est déjà prévue'} dans des repas`)
    }
    if (input.surplusParts < PARTS_EPSILON) {
      await deleteDoc(doc(db, 'preparedDishes', existing.id))
      return null
    }
    await updateDoc(doc(db, 'preparedDishes', existing.id), {
      parts: input.surplusParts - taken,
      storage: input.storage,
      batch: batchFields,
      comment: comment ?? deleteField(),
      updatedAt: now,
    })
    return existing.id
  }

  /**
   * Retire un repas d'une recette des menus et envoie ses parts au stock : elles rejoignent le surplus de sa fournée
   * (cuisinée le `cookDay`), créé au besoin. La fournée garde ainsi le même nombre de parts à cuisiner et à acheter ;
   * cuisinée, elle les range aussitôt. Repas et stock changent en une seule écriture. Renvoie l'id du plat.
   */
  const sendMealToStock = async (
    meal: Meal & RecipeMealSource,
    input: { label: string, perPart: IngredientMacros, cookDay: string, storage: DishStorage },
  ) => {
    const uid = requireUid()
    await dishes.promise.value
    const now = Timestamp.now()
    const existing = findBatchSurplus(dishes.value, meal.recipeId, input.cookDay)
    const batch = writeBatch(db)
    batch.delete(doc(db, 'meals', meal.id))

    if (existing) {
      batch.update(doc(db, 'preparedDishes', existing.id), {
        parts: increment(meal.value),
        batch: { cookDay: input.cookDay, surplusParts: (existing.batch?.surplusParts ?? existing.parts) + meal.value },
        updatedAt: now,
      })
      await batch.commit()
      return existing.id
    }

    const ref = doc(collection(db, 'preparedDishes'))
    batch.set(ref, {
      owner: uid,
      label: input.label,
      recipeId: meal.recipeId,
      perPart: input.perPart,
      parts: meal.value,
      storage: input.storage,
      preparedOn: input.cookDay,
      batch: { cookDay: input.cookDay, surplusParts: meal.value },
      createdAt: now,
      updatedAt: now,
    })
    await batch.commit()
    return ref.id
  }

  /**
   * Sort un plat du congélateur (« Décongeler » de l'accueil) : les repas `meals`, de n'importe quel membre du foyer,
   * passent au frigo ; `extraParts` parts encore au congélateur sortent avec eux et forment un nouveau plat au frigo,
   * décongelé aujourd'hui (même libellé, mêmes macros, même jour de préparation). Une seule écriture.
   */
  const thawMeals = async (meals: Meal[], extraParts: number, dishId: string) => {
    const uid = requireUid()
    const todayKey = dayKeyOf(new Date())
    const now = Timestamp.now()
    const batch = writeBatch(db)
    for (const meal of meals) batch.update(doc(db, 'meals', meal.id), { storage: 'FRIDGE', thawedOn: todayKey })

    if (extraParts > PARTS_EPSILON) {
      await dishes.promise.value
      const dish = dishesById.value.get(dishId)
      if (!dish) throw new Error('Ce plat n\'est plus dans le stock')
      if (extraParts > dish.parts + PARTS_EPSILON) throw new Error(`Il ne reste que ${formatParts(dish.parts)} de « ${dish.label} » au congélateur`)
      const remaining = Math.max(0, dish.parts - extraParts)
      batch.update(doc(db, 'preparedDishes', dish.id), {
        parts: increment(-extraParts),
        updatedAt: now,
        // Vidé : il reste affiché jusqu'à ce soir, comme un plat remis à 0 à la main.
        ...(remaining < PARTS_EPSILON && (!dish.lastMealOn || dish.lastMealOn < todayKey) ? { lastMealOn: todayKey } : {}),
      })
      batch.set(doc(collection(db, 'preparedDishes')), {
        owner: uid,
        label: dish.label,
        perPart: dish.perPart,
        parts: extraParts,
        storage: 'FRIDGE',
        preparedOn: dish.preparedOn,
        thawedOn: todayKey,
        ...(dish.recipeId ? { recipeId: dish.recipeId } : {}),
        ...(dish.comment ? { comment: dish.comment } : {}),
        createdAt: now,
        updatedAt: now,
      })
    }
    await batch.commit()
  }

  return { dishes, dishesById, sendMealToStock, thawMeals, stageStockChanges, stageStockMove, saveDish, setDishParts, setDishStorage, deleteDish, saveBatchSurplus }
}
