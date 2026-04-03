import type { Ingredient } from '~/types/ingredient'

/** Macros pour une portion d’ingrédient (variation ou masse totale). */
export interface IngredientMacros {
  calories: number
  protein: number
  carbohydrates: number
  fat: number
}

/**
 * Macros pour une variation (`ing.variations[id]`) ou la base nutritionnelle.
 * `valuesBy100` correspond à une quantité de référence **100** (g ou ml) ; facteur = q / 100.
 * Si `variationId` est `null`, la quantité vaut **100** : on retourne `valuesBy100` (facteur 1).
 */
export function macrosForVariation(ing: Ingredient, variationId: string | null): IngredientMacros | null {
  const base = ing.valuesBy100
  if (!base) return null

  const q = variationId == null ? 100 : ing.variations?.[variationId]?.value
  if (q == null || q <= 0) return null

  const factor = q / 100
  const v = (n: number) => (factor === 1 ? n : Math.round(n * factor))
  return {
    calories: v(base.calories),
    protein: v(base.protein),
    carbohydrates: v(base.carbohydrates),
    fat: v(base.fat),
  }
}
