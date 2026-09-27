import { differenceInCalendarDays, isSameWeek } from 'date-fns'
import type { Meal, RecipeMealSource } from '~/types/meal'
import { MENU_MEAL_TYPES } from './menuEntries'
import { WEEK_STARTS_ON } from './menuWeek'

/** Une recette à cuisiner en une fois pour tous ses repas de la période. */
export type RecipeToCook = {
  recipeId: string
  /** Jours où elle est mangée (minuit, heure locale), dans l'ordre, sans doublon. */
  days: Date[]
  /** Somme des parts de ces repas. */
  parts: number
}

type RecipeMeal = Meal & RecipeMealSource

const mealTypeRank = (meal: Meal) => MENU_MEAL_TYPES.findIndex(row => row.key === meal.mealType)

/** Ordre chronologique : jour, puis ligne du calendrier, puis ordre d'ajout. */
const chronological = (a: RecipeMeal, b: RecipeMeal) =>
  a.date.toMillis() - b.date.toMillis()
  || mealTypeRank(a) - mealTypeRank(b)
  || (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)

/**
 * Recettes à cuisiner du jour `from` au jour `to` inclus, parts cumulées par recette, dans l'ordre de leur premier repas.
 * Une recette déjà mangée plus tôt dans la semaine de `from` est déjà cuisinée : ses repas de cette semaine sont des restes.
 * `meals` doit donc couvrir depuis le début de la semaine de `from`.
 */
export function recipesToCook(meals: Meal[], from: Date, to: Date): RecipeToCook[] {
  const recipeMeals = meals.filter((meal): meal is RecipeMeal => meal.category === 'RECIPE').sort(chronological)
  const isThisWeek = (date: Date) => isSameWeek(date, from, { weekStartsOn: WEEK_STARTS_ON })

  const alreadyCooked = new Set<string>()
  const byRecipe = new Map<string, RecipeToCook>()

  for (const meal of recipeMeals) {
    const date = meal.date.toDate()
    if (differenceInCalendarDays(date, from) < 0) {
      if (isThisWeek(date)) alreadyCooked.add(meal.recipeId)
      continue
    }
    if (differenceInCalendarDays(date, to) > 0) continue
    if (isThisWeek(date) && alreadyCooked.has(meal.recipeId)) continue

    const item = byRecipe.get(meal.recipeId) ?? { recipeId: meal.recipeId, days: [], parts: 0 }
    byRecipe.set(meal.recipeId, item)
    item.parts += meal.value
    const lastDay = item.days.at(-1)
    if (!lastDay || differenceInCalendarDays(date, lastDay) !== 0) item.days.push(date)
  }

  return [...byRecipe.values()]
}
