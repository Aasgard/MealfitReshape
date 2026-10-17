import { addDays, addWeeks, startOfDay, subWeeks } from 'date-fns'
import { collection, doc, query, Timestamp, where, writeBatch } from 'firebase/firestore'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Meal, MealSource, MealType } from '~/types/meal'
import { mealSourceOf } from '~/utils/menuEntries'
import { dayKeyOf } from '~/utils/menuWeek'
import { formatDishDay, isDishPlanned } from '~/utils/preparedDishes'

/** Repas à créer : le jour (minuit, heure locale), la ligne du calendrier et ce qui a été mangé. */
export type NewMeal = {
  date: Date
  mealType: MealType
  source: MealSource
}

/**
 * Repas de l'utilisateur connecté (collection Firestore `meals`) pour la semaine commençant à `weekStart`, la précédente
 * (pour "Copier la semaine précédente") et, avec `weeksAhead`, les suivantes (préchargées pour passer de l'une à
 * l'autre sans attente), et écritures associées. Au changement de semaine, les repas affichés restent jusqu'à
 * l'arrivée des nouveaux (`reset: false`, défaut de VueFire).
 * La requête (`user` + plage de `date`) demande un index composite `user` ↑, `date` ↑.
 */
export const useMeals = (weekStart: Ref<Date>, { weeksAhead = 0 } = {}) => {
  const db = useFirestore()
  const user = useCurrentUser()
  const { dishesById, stageStockChanges, stageStockMove } = usePreparedDishes()

  const meals = useCollection<Meal>(() => {
    const uid = user.value?.uid
    if (!uid) return null

    return query(
      collection(db, 'meals'),
      // where('user', '==', uid),
      where('date', '>=', Timestamp.fromDate(subWeeks(weekStart.value, 1))),
      where('date', '<', Timestamp.fromDate(addWeeks(weekStart.value, 1 + weeksAhead)))
    )
  })

  /**
   * Supprime `toDelete` et crée `toCreate` en une seule écriture atomique, parts du stock comprises : prises aux plats
   * pour les repas créés, rendues pour les repas supprimés. Lève une erreur si le stock ne peut pas servir un repas créé.
   */
  const replaceMeals = async (toDelete: Meal[], toCreate: NewMeal[]) => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')

    const batch = writeBatch(db)
    await stageStockChanges(
      batch,
      toDelete.map(meal => ({ source: mealSourceOf(meal), day: dayKeyOf(meal.date.toDate()) })),
      toCreate.map(meal => ({ source: meal.source, day: dayKeyOf(meal.date) })),
    )
    for (const meal of toDelete) batch.delete(doc(db, 'meals', meal.id))

    const now = Date.now()
    toCreate.forEach(({ date, mealType, source }, index) => {
      batch.set(doc(collection(db, 'meals')), {
        ...source,
        user: uid,
        date: Timestamp.fromDate(date),
        mealType,
        // Un décalage d'1 ms par repas conserve leur ordre d'ajout à l'intérieur d'une case.
        createdAt: Timestamp.fromMillis(now + index),
      })
    })
    await batch.commit()
  }

  const addMeal = (meal: NewMeal) => replaceMeals([], [meal])

  /**
   * Déplace un repas vers un autre jour et/ou une autre ligne du calendrier ; ce qu'il contient (recette, quantité...) ne
   * change pas. Un plat du stock ne se mange pas avant d'être prêt.
   */
  const moveMeal = async (meal: Meal, target: Pick<NewMeal, 'date' | 'mealType'>) => {
    const source = mealSourceOf(meal)
    const day = dayKeyOf(target.date)
    const dish = source.category === 'STOCK' ? dishesById.value.get(source.dishId) : undefined
    if (dish && isDishPlanned(dish, day)) throw new Error(`« ${dish.label} » ne sera prêt qu'à partir du ${formatDishDay(dish.preparedOn)}`)

    const batch = writeBatch(db)
    batch.update(doc(db, 'meals', meal.id), { date: Timestamp.fromDate(target.date), mealType: target.mealType })
    stageStockMove(batch, source, day)
    await batch.commit()
  }

  /**
   * Remplace ce qu'un repas contient (recette, aliment, macros ou plat du stock), sans changer son jour, sa ligne ni son
   * ordre dans la case. Le document est réécrit en entier : passer d'une recette à un aliment ne doit pas laisser traîner
   * `recipeId` / `value`. Les parts du stock suivent : celles de l'ancien contenu sont rendues, celles du nouveau prises.
   */
  const updateMealSource = async (meal: Meal, source: MealSource) => {
    const day = dayKeyOf(meal.date.toDate())
    const batch = writeBatch(db)
    await stageStockChanges(batch, [{ source: mealSourceOf(meal), day }], [{ source, day }])
    batch.set(doc(db, 'meals', meal.id), {
      ...source,
      user: meal.user,
      date: meal.date,
      mealType: meal.mealType,
      ...(meal.createdAt ? { createdAt: meal.createdAt } : {}),
    })
    await batch.commit()
  }

  return { meals, addMeal, moveMeal, updateMealSource, replaceMeals }
}

/** Plage de jours, bornes incluses. */
export type DayRange = { start: Date, end: Date }

/**
 * Repas de l'utilisateur connecté (lecture seule) du jour `start` au jour `end` inclus.
 * `range` à `null` : aucune requête (ex. panneau fermé). Même index composite que `useMeals`.
 */
export const useMealsBetween = (range: MaybeRefOrGetter<DayRange | null>) => {
  const db = useFirestore()
  const user = useCurrentUser()

  return useCollection<Meal>(() => {
    const uid = user.value?.uid
    const { start, end } = toValue(range) ?? {}
    if (!uid || !start || !end) return null

    return query(
      collection(db, 'meals'),
      // where('user', '==', uid),
      where('date', '>=', Timestamp.fromDate(startOfDay(start))),
      where('date', '<', Timestamp.fromDate(addDays(startOfDay(end), 1)))
    )
  })
}

/**
 * Repas de tous les membres du foyer (lecture seule) du jour `start` au jour `end` inclus : la liste de courses du foyer
 * les cumule. Comme pour le stock, ceux des autres attendent que les règles puissent les ouvrir (`shared`) ; sans foyer,
 * ceux du compte seul. `isLoading` couvre aussi l'attente du foyer. Même index composite que `useMeals`.
 */
export const useHouseholdMealsBetween = (range: MaybeRefOrGetter<DayRange | null>) => {
  const db = useFirestore()
  const user = useCurrentUser()
  const { memberIds, shared, loading: householdLoading } = useHousehold()

  const meals = useCollection<Meal>(() => {
    const uid = user.value?.uid
    const { start, end } = toValue(range) ?? {}
    if (!uid || householdLoading.value || !start || !end) return null

    return query(
      collection(db, 'meals'),
      where('user', 'in', shared.value ? memberIds.value : [uid]),
      where('date', '>=', Timestamp.fromDate(startOfDay(start))),
      where('date', '<', Timestamp.fromDate(addDays(startOfDay(end), 1)))
    )
  })

  const isLoading = computed(() => meals.pending.value || (!!toValue(range) && householdLoading.value))
  return { meals, isLoading }
}
