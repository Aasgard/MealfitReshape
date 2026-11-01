import { addDays, parseISO } from 'date-fns'
import { collection, deleteDoc, deleteField, doc, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { BaseStock } from '~/types/baseStock'
import type { DishStorage } from '~/types/preparedDish'
import { baseStockLedger } from '~/utils/baseStock'
import { dayKeyOf } from '~/utils/menuWeek'

/** Jours de menus après aujourd'hui dont les bases sont réservées sur le stock (au-delà, rien n'est compté). */
export const BASE_STOCK_HORIZON_DAYS = 35

/** Ce qu'on saisit d'un bocal (mise au stock ou modification). */
export type BaseStockInput = {
  recipeId: string
  label: string
  grams: number
  storage: DishStorage
  preparedOn: string
  comment?: string
}

/**
 * Stock de bases du foyer (collection Firestore `baseStocks`), en grammes, et sa répartition entre les repas : chaque
 * plat des menus qui contient une base y puise sa part, du plus ancien bocal au plus récent (voir `baseStockLedger`).
 * Rien n'est écrit quand un repas change : la part de chacun se recalcule depuis les menus. Comme les plats préparés,
 * un bocal suit son créateur (`owner`) et se partage avec son foyer.
 */
export const useBaseStocks = () => {
  const db = useFirestore()
  const user = useCurrentUser()
  const { memberIds, shared, loading: householdLoading } = useHousehold()

  const stocks = useCollection<BaseStock>(() => {
    const uid = user.value?.uid
    if (!uid || householdLoading.value) return null
    return query(collection(db, 'baseStocks'), where('owner', 'in', shared.value ? memberIds.value : [uid]))
  })

  /** Recalculé à chaque lecture : la page peut rester ouverte d'un jour à l'autre. */
  const todayKey = computed(() => dayKeyOf(new Date()))

  /** Repas du foyer depuis le plus ancien comptage jusqu'à l'horizon ; aucune requête sans bocal. */
  const earliestCount = computed(() => stocks.value.map(stock => stock.countedOn).sort()[0])
  const { meals } = useHouseholdMealsBetween(() => (earliestCount.value
    ? { start: parseISO(earliestCount.value), end: addDays(parseISO(todayKey.value), BASE_STOCK_HORIZON_DAYS) }
    : null))

  const { recipesById, ingredientsById } = useFoodCatalog()
  const ledger = computed(() => baseStockLedger(stocks.value, meals.value, recipesById.value, ingredientsById.value, todayKey.value))

  return { stocks, meals, ledger, todayKey, ...useBaseStockWrites() }
}

/**
 * Écritures du stock de bases seules, sans le lire ni charger les repas : pour ranger une base depuis sa fiche.
 */
export const useBaseStockWrites = () => {
  const db = useFirestore()
  const user = useCurrentUser()
  const todayKey = () => dayKeyOf(new Date())

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  /** Range une base préparée : comptée le jour de sa préparation. */
  const addStock = async (input: BaseStockInput) => {
    const uid = requireUid()
    const now = Timestamp.now()
    await setDoc(doc(collection(db, 'baseStocks')), {
      owner: uid,
      recipeId: input.recipeId,
      label: input.label,
      grams: input.grams,
      countedOn: input.preparedOn,
      preparedOn: input.preparedOn,
      storage: input.storage,
      ...(input.comment ? { comment: input.comment } : {}),
      createdAt: now,
      updatedAt: now,
    })
  }

  /**
   * Corrige ce qui reste dans le bocal, avant les repas d'aujourd'hui : le comptage repart de ce jour, les repas passés
   * n'y puisent plus.
   */
  const correctStock = (stock: BaseStock, grams: number) => updateDoc(doc(db, 'baseStocks', stock.id), {
    grams: Math.max(0, grams),
    countedOn: todayKey(),
    updatedAt: Timestamp.now(),
  })

  const updateStock = (stock: BaseStock, patch: { storage?: DishStorage, comment?: string }) => updateDoc(doc(db, 'baseStocks', stock.id), {
    ...(patch.storage ? { storage: patch.storage } : {}),
    ...(patch.comment !== undefined ? { comment: patch.comment.trim() || deleteField() } : {}),
    updatedAt: Timestamp.now(),
  })

  const deleteStock = (stock: BaseStock) => deleteDoc(doc(db, 'baseStocks', stock.id))

  return { addStock, correctStock, updateStock, deleteStock }
}
