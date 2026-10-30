import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Timestamp } from 'firebase/firestore'
import type { Meal, MealSource } from '~/types/meal'
import type { DishStorage, PreparedDish } from '~/types/preparedDish'

/** En dessous, deux nombres de parts sont égaux (demi-parts additionnées en flottants). */
export const PARTS_EPSILON = 1e-6

/** Pas de saisie des parts d'un plat du stock, comme pour une recette : la demi-part. */
export const STOCK_PARTS_STEP = 0.5

export interface DishStorageOption {
  key: DishStorage
  label: string
  icon: string
  /** Au-delà de ce nombre de jours depuis la préparation, le plat est signalé « à consommer vite » ; `null` : jamais. */
  staleAfterDays: number | null
}

/** Rangements, dans l'ordre d'affichage du stock. */
export const DISH_STORAGES: DishStorageOption[] = [
  { key: 'FREEZER', label: 'Congélateur', icon: 'i-lucide-snowflake', staleAfterDays: 90 },
  { key: 'FRIDGE', label: 'Frigo', icon: 'i-lucide-refrigerator', staleAfterDays: 3 },
  { key: 'PANTRY', label: 'Ambiant', icon: 'i-lucide-package', staleAfterDays: null },
]

export const dishStorageOf = (key: DishStorage) => DISH_STORAGES.find(s => s.key === key) ?? DISH_STORAGES[0]!

const formatNumber = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

/** "1 part", "2,5 parts". */
export const formatParts = (parts: number) => `${formatNumber(parts)} part${parts > 1 ? 's' : ''}`

/** "ven. 17 oct." */
export const formatDishDay = (day: string) => format(parseISO(day), 'EEE d MMM', { locale: fr })

/** Prévu : son jour de préparation (la fournée) n'est pas encore arrivé au jour `dayKey`. */
export const isDishPlanned = (dish: Pick<PreparedDish, 'preparedOn'>, dayKey: string) => dish.preparedOn > dayKey

export const isDishDepleted = (dish: Pick<PreparedDish, 'parts'>) => dish.parts < PARTS_EPSILON

/** Épuisé, un plat reste affiché jusqu'au jour de son dernier repas inclus, puis disparaît (le document reste). */
export const isDishShown = (dish: PreparedDish, todayKey: string) =>
  !isDishDepleted(dish) || (dish.lastMealOn ?? dish.preparedOn) >= todayKey

/** Au-delà de ce nombre de jours depuis sa sortie du congélateur, un plat décongelé est « à consommer vite ». */
export const THAWED_STALE_AFTER_DAYS = 1

/**
 * Rangé depuis plus longtemps que ce que son rangement conseille (frigo : 3 jours, congélateur : 3 mois) ; décongelé,
 * sorti du congélateur depuis plus d'un jour.
 */
export function isDishStale(dish: PreparedDish, todayKey: string) {
  if (dish.thawedOn) return differenceInCalendarDays(parseISO(todayKey), parseISO(dish.thawedOn)) > THAWED_STALE_AFTER_DAYS
  const limit = dishStorageOf(dish.storage).staleAfterDays
  if (limit == null || isDishPlanned(dish, todayKey)) return false
  return differenceInCalendarDays(parseISO(todayKey), parseISO(dish.preparedOn)) > limit
}

/** Plats du stock : les plus anciens d'abord (à finir en premier), les épuisés à la fin. */
export const compareDishes = (a: PreparedDish, b: PreparedDish) =>
  Number(isDishDepleted(a)) - Number(isDishDepleted(b))
  || a.preparedOn.localeCompare(b.preparedOn)
  || a.label.localeCompare(b.label, 'fr')

/**
 * Parts que des écritures de repas prennent à chaque plat du stock : positives pour les repas ajoutés, négatives pour
 * ceux retirés (rendues au plat). Un repas modifié compte comme retiré puis ajouté.
 */
export function stockDemand(removed: MealSource[], added: MealSource[]): Map<string, number> {
  const demand = new Map<string, number>()
  const add = (source: MealSource, sign: 1 | -1) => {
    if (source.category !== 'STOCK') return
    demand.set(source.dishId, (demand.get(source.dishId) ?? 0) + sign * source.value)
  }
  removed.forEach(source => add(source, -1))
  added.forEach(source => add(source, 1))
  return demand
}

/**
 * Raison de refuser des repas ajoutés au stock, `null` s'ils passent : plat retiré du stock entre-temps, pas assez de
 * parts (une fois rendues celles des repas retirés), ou repas placé avant que le plat soit prêt.
 */
export function stockDemandError(
  demand: Map<string, number>,
  added: { source: MealSource, day: string }[],
  dishesById: Map<string, PreparedDish>,
): string | null {
  for (const { source, day } of added) {
    if (source.category !== 'STOCK') continue
    const dish = dishesById.get(source.dishId)
    if (!dish) return `« ${source.label} » n'est plus dans le stock`
    if (isDishPlanned(dish, day)) return `« ${dish.label} » ne sera prêt qu'à partir du ${formatDishDay(dish.preparedOn)}`
  }
  for (const [dishId, parts] of demand) {
    const dish = dishesById.get(dishId)
    if (!dish || parts <= dish.parts + PARTS_EPSILON) continue
    return isDishDepleted(dish)
      ? `« ${dish.label} » est épuisé`
      : `Il ne reste que ${formatParts(dish.parts)} de « ${dish.label} » en stock`
  }
  return null
}

/** Écart à des recettes entières : `total` parts cuisinées d'une recette qui en fait `persons`. */
export interface WholeRecipeGap {
  /** Nombre de recettes que ça représente. Ex : 3,75. */
  recipes: number
  /** Multiple de `persons` juste en dessous (0 s'il n'y en a pas). */
  lower: number
  /** Multiple de `persons` juste au-dessus. */
  upper: number
}

/** `null` quand `total` fait un nombre entier de recettes (ou sans nombre de parts renseigné dans la recette). */
export function wholeRecipeGap(total: number, persons: number | undefined): WholeRecipeGap | null {
  if (!persons || persons <= 0 || total < PARTS_EPSILON) return null
  const recipes = total / persons
  if (Math.abs(recipes - Math.round(recipes)) < PARTS_EPSILON) return null
  return { recipes, lower: Math.floor(recipes) * persons, upper: Math.ceil(recipes) * persons }
}

/** Préfixe de l'id des repas fictifs qui portent le surplus prévu d'une fournée (voir `surplusMeals`). */
export const SURPLUS_MEAL_PREFIX = 'surplus-'

/**
 * Surplus prévus des fournées, en repas fictifs de leur recette au jour de cuisine : la liste de courses les compte avec
 * les repas des menus (mêmes regroupements, mêmes fournées). `range` limite aux jours de cuisine compris (bornes incluses).
 */
export function surplusMeals(dishes: PreparedDish[], range?: { start: string, end: string } | null): Meal[] {
  return dishes.flatMap((dish) => {
    const batch = dish.batch
    if (!batch || !dish.recipeId || batch.surplusParts < PARTS_EPSILON) return []
    if (range && (batch.cookDay < range.start || batch.cookDay > range.end)) return []
    return [{
      id: `${SURPLUS_MEAL_PREFIX}${dish.id}`,
      user: dish.owner,
      category: 'RECIPE',
      recipeId: dish.recipeId,
      value: batch.surplusParts,
      date: Timestamp.fromDate(parseISO(batch.cookDay)),
      mealType: 'NOTCOUNT',
    }]
  })
}

/**
 * Comme `surplusMeals`, mais chaque surplus ne compte que ses parts encore utilisées : celles qui restent au stock et celles
 * prises par des repas (`meals`) ; les parts retirées du stock (jetées, corrigées, plat supprimé) n'en font plus partie.
 */
export function usedSurplusMeals(dishes: PreparedDish[], meals: Meal[]): Meal[] {
  const takenByDish = new Map<string, number>()
  for (const meal of meals) {
    if (meal.category === 'STOCK') takenByDish.set(meal.dishId, (takenByDish.get(meal.dishId) ?? 0) + meal.value)
  }
  const dishesById = new Map(dishes.map(dish => [dish.id, dish]))
  return surplusMeals(dishes).flatMap((meal) => {
    const dish = dishesById.get(meal.id.slice(SURPLUS_MEAL_PREFIX.length))
    if (!dish || meal.category !== 'RECIPE') return []
    const used = Math.min(meal.value, dish.parts + (takenByDish.get(dish.id) ?? 0))
    return used > PARTS_EPSILON ? [{ ...meal, value: used }] : []
  })
}

/** Plat du surplus prévu d'une fournée (recette `recipeId` cuisinée le `cookDay`), s'il y en a un. */
export const findBatchSurplus = (dishes: PreparedDish[], recipeId: string, cookDay: string) =>
  dishes.find(dish => dish.recipeId === recipeId && dish.batch?.cookDay === cookDay)
