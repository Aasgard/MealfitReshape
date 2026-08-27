import type { Ingredient } from '~/types/ingredient'

/** Macros pour une portion d’ingrédient (unité ou masse totale). */
export interface IngredientMacros {
  calories: number
  protein: number
  carbohydrates: number
  fat: number
}

/**
 * Macros pour une unité (`ing.units[id]`) ou la base nutritionnelle.
 * `valuesBy100` est toujours exprimé pour **100 grammes** ; facteur = grammes / 100.
 * Si `unitId` est `null`, on retourne `valuesBy100` (facteur 1, 100 g).
 * Si l’unité est exprimée en `ml`, elle est convertie en grammes via `ing.density`
 * (g/ml) ; sans densité renseignée, la conversion — et donc le calcul — est impossible.
 */
export function macrosForUnit(ing: Ingredient, unitId: string | null): IngredientMacros | null {
  const base = ing.valuesBy100
  if (!base) return null

  if (unitId == null) {
    return { ...base }
  }

  const unit = ing.units?.[unitId]
  if (!unit || unit.value <= 0) return null

  let grams: number
  if (unit.unit === 'ml') {
    if (!ing.density || ing.density <= 0) return null
    grams = unit.value * ing.density
  } else {
    grams = unit.value
  }

  const factor = grams / 100
  const v = (n: number) => (factor === 1 ? n : Math.round(n * factor))
  return {
    calories: v(base.calories),
    protein: v(base.protein),
    carbohydrates: v(base.carbohydrates),
    fat: v(base.fat),
  }
}
