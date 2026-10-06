import { differenceInCalendarDays } from 'date-fns'
import type { Meal, MealType, RecipeMealSource } from '~/types/meal'
import { MENU_MEAL_TYPES } from './menuEntries'

/** Un récipient d'une fournée : les parts d'un repas (jour + ligne du calendrier). */
export type RecipeToCookPortion = {
  /** Jour du repas (minuit, heure locale). */
  day: Date
  mealType: MealType
  /** Parts de ce repas, cumulées si la recette y est saisie plusieurs fois. */
  parts: number
}

/** Une fournée : une recette cuisinée en une fois pour tous ses repas des jours suivants. */
export type RecipeToCook = {
  recipeId: string
  /** Jours où elle est mangée (minuit, heure locale), dans l'ordre, sans doublon ; le premier est le jour où la cuisiner. */
  days: Date[]
  /** Somme des parts de ces repas. */
  parts: number
  /** Parts de chaque repas, dans l'ordre : un récipient chacun. */
  portions: RecipeToCookPortion[]
}

type RecipeMeal = Meal & RecipeMealSource

const mealTypeRank = (meal: Meal) => MENU_MEAL_TYPES.findIndex(row => row.key === meal.mealType)

/** Ordre chronologique : jour, puis ligne du calendrier, puis ordre d'ajout. */
const chronological = (a: RecipeMeal, b: RecipeMeal) =>
  a.date.toMillis() - b.date.toMillis()
  || mealTypeRank(a) - mealTypeRank(b)
  || (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)

/**
 * Fournées des recettes de `meals`, dans l'ordre de leur jour de cuisine. Une recette est cuisinée à son premier repas,
 * pour tous ses repas des `batchDays` jours à partir de celui-ci (les restes) ; un repas plus tardif lance une nouvelle fournée.
 * Les fournées dépendent de celles qui précèdent : `meals` doit remonter assez loin avant la période qui intéresse.
 */
export function recipesToCook(meals: Meal[], batchDays: number): RecipeToCook[] {
  const recipeMeals = meals.filter((meal): meal is RecipeMeal => meal.category === 'RECIPE').sort(chronological)
  const batches: RecipeToCook[] = []
  const currentBatch = new Map<string, RecipeToCook>()

  for (const meal of recipeMeals) {
    const date = meal.date.toDate()
    let batch = currentBatch.get(meal.recipeId)
    if (!batch || differenceInCalendarDays(date, batch.days[0]!) >= batchDays) {
      batch = { recipeId: meal.recipeId, days: [], parts: 0, portions: [] }
      batches.push(batch)
      currentBatch.set(meal.recipeId, batch)
    }

    batch.parts += meal.value
    const lastDay = batch.days.at(-1)
    if (!lastDay || differenceInCalendarDays(date, lastDay) !== 0) batch.days.push(date)

    // Repas triés : une même recette saisie deux fois au même repas tombe juste après la précédente.
    const lastPortion = batch.portions.at(-1)
    if (lastPortion?.mealType === meal.mealType && differenceInCalendarDays(date, lastPortion.day) === 0) {
      lastPortion.parts += meal.value
    } else {
      batch.portions.push({ day: date, mealType: meal.mealType, parts: meal.value })
    }
  }

  return batches
}
