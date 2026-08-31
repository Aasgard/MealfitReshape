import type { Ingredient } from '~/types/ingredient'

/** Macros pour une portion d’ingrédient (unité ou masse totale). */
export interface IngredientMacros {
  calories: number
  protein: number
  carbohydrates: number
  fat: number
}

/** Multiplie chaque macro par `factor` et arrondit (sauf facteur 1, retourné tel quel). */
export function scaleMacros(macros: IngredientMacros, factor: number): IngredientMacros {
  const v = (n: number) => (factor === 1 ? n : Math.round(n * factor))
  return {
    calories: v(macros.calories),
    protein: v(macros.protein),
    carbohydrates: v(macros.carbohydrates),
    fat: v(macros.fat),
  }
}

/**
 * Résout la masse en grammes d'une unité de l'ingrédient (`ing.units[unitId]`),
 * convertie depuis le `ml` via `ing.density` si besoin. `null` si l'unité est
 * introuvable ou si la conversion ml → g est impossible faute de densité.
 */
export function gramsForUnit(ing: Ingredient, unitId: string): number | null {
  const unit = ing.units?.[unitId]
  if (!unit || unit.value <= 0) return null

  if (unit.unit === 'ml') {
    if (!ing.density || ing.density <= 0) return null
    return unit.value * ing.density
  }
  return unit.value
}

/**
 * Macros pour une unité (`ing.units[id]`) ou la base nutritionnelle.
 * `valuesBy100` est toujours exprimé pour **100 grammes** ; facteur = grammes / 100.
 * Si `unitId` est `null`, on retourne `valuesBy100` (facteur 1, 100 g).
 */
export function macrosForUnit(ing: Ingredient, unitId: string | null): IngredientMacros | null {
  const base = ing.valuesBy100
  if (!base) return null

  if (unitId == null) {
    return { ...base }
  }

  const grams = gramsForUnit(ing, unitId)
  if (grams == null) return null

  return scaleMacros(base, grams / 100)
}
