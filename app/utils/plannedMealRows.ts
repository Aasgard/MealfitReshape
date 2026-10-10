import type { Ingredient } from '~/types/ingredient'
import type { Meal } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import { entryFromMeal } from './menuEntries'

/** Une ligne de repas planifiés : les repas d'une même recette, d'un même aliment (dans une même unité) ou d'un même libellé de macros. */
export interface PlannedMealRow {
  key: string
  label: string
  quantityLabel?: string
  /** Parts cumulées, pour une recette. */
  parts?: number
  /** Les macros saisies à la main n'ont pas d'ingrédients : affichées, mais pas sélectionnables. */
  isSelectable: boolean
}

/** Les macros saisies à la main n'ont pas d'ingrédients à acheter. */
export const mealHasIngredients = (meal: Meal) => meal.category !== 'RAW'

/** Clé de regroupement : une ligne par recette, par aliment dans une même unité, par libellé de macros saisies. */
export const plannedMealKey = (meal: Meal) => {
  switch (meal.category) {
    case 'RECIPE': return `recipe:${meal.recipeId}`
    case 'INGREDIENT': return `ingredient:${meal.ingredientId}:${meal.unitId ?? 'g'}`
    case 'RAW': return `raw:${meal.label}`
  }
}

const CATEGORY_RANK = { RECIPE: 0, INGREDIENT: 1, RAW: 2 } as const

/** Repas regroupés (parts ou quantités cumulées), recettes puis aliments puis macros, par ordre alphabétique. */
export function groupPlannedMeals(
  meals: Meal[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>
): PlannedMealRow[] {
  const totals = new Map<string, Meal>()
  for (const meal of meals) {
    const key = plannedMealKey(meal)
    const total = totals.get(key)
    if (!total) totals.set(key, { ...meal })
    else if (total.category === 'RECIPE' && meal.category === 'RECIPE') total.value += meal.value
    else if (total.category === 'INGREDIENT' && meal.category === 'INGREDIENT') total.quantity += meal.quantity
  }

  return [...totals]
    .map(([key, total]) => {
      const entry = entryFromMeal(total, recipesById, ingredientsById)
      return {
        key,
        label: total.category === 'RAW' ? total.label : entry.label,
        quantityLabel: total.category === 'RAW' ? 'Macros seules' : entry.quantityLabel,
        ...(total.category === 'RECIPE' ? { parts: total.value } : {}),
        isSelectable: mealHasIngredients(total),
        rank: CATEGORY_RANK[total.category],
      }
    })
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'fr'))
    .map(({ rank: _rank, ...row }) => row)
}
