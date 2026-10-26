import type { Ingredient } from '~/types/ingredient'
import type { RecipeIngredientLine } from '~/types/recipe'
import { gramsForUnit, ingredientUnitEntries } from './ingredientNutrition'

/**
 * Remplacement ponctuel d'un ingrédient sur la fiche recette : le remplaçant est pesé pour apporter les mêmes kcal que
 * la ligne d'origine. Rien n'est enregistré ; la fiche s'en sert seulement pour recalculer ce qu'elle affiche.
 */

type SwapLine = Pick<RecipeIngredientLine, 'ingredientRef' | 'unit' | 'quantity'>

/** Écart de macros (g) du remplaçant par rapport à la ligne d'origine, non arrondi. */
export interface MacroDelta {
  carbohydrates: number
  protein: number
  fat: number
}

/** Poids du remplaçant (g, non arrondi) et écart de macros, pour les quantités de la recette (facteur 1). */
export interface IngredientSwapResult {
  grams: number
  delta: MacroDelta
}

/** Masse en grammes d'une ligne de recette, unité convertie ; `null` si l'unité est introuvable ou non convertible. */
export function gramsForRecipeLine(line: SwapLine, ingredient: Ingredient): number | null {
  if (!(line.quantity > 0)) return null
  if (!line.unit) return line.quantity
  const unitGrams = gramsForUnit(ingredient, line.unit)
  return unitGrams == null ? null : unitGrams * line.quantity
}

/** Raison pour laquelle une ligne ne peut pas servir de base à une équivalence ; `null` si elle le peut. */
export function swapSourceIssue(line: SwapLine, ingredient: Ingredient | undefined): string | null {
  if (!ingredient) return 'Ingrédient introuvable dans le catalogue.'
  if (!ingredient.valuesBy100) return `${ingredient.label} n'a pas de valeurs nutritionnelles renseignées.`
  if (!(ingredient.valuesBy100.calories > 0)) return `${ingredient.label} n'apporte pas de kcal : il n'y a pas d'équivalence à calculer.`
  if (gramsForRecipeLine(line, ingredient) == null) return `La quantité de ${ingredient.label} ne se convertit pas en grammes (densité manquante).`
  return null
}

/** Le remplaçant peut-il être pesé à kcal égales ? */
export const canReplaceWith = (replacement: Ingredient) => (replacement.valuesBy100?.calories ?? 0) > 0

/**
 * Poids de `replacement` apportant les mêmes kcal que `line`, et écart de macros qui en résulte.
 * `null` si la ligne ou le remplaçant n'ont pas de kcal exploitables.
 */
export function swapForLine(
  line: SwapLine,
  original: Ingredient | undefined,
  replacement: Ingredient
): IngredientSwapResult | null {
  if (swapSourceIssue(line, original) || !canReplaceWith(replacement)) return null
  const from = original!.valuesBy100!
  const to = replacement.valuesBy100!
  const originalGrams = gramsForRecipeLine(line, original!)!

  const grams = (from.calories * originalGrams) / to.calories
  const delta = (key: keyof MacroDelta) => (to[key] * grams - from[key] * originalGrams) / 100
  return { grams, delta: { carbohydrates: delta('carbohydrates'), protein: delta('protein'), fat: delta('fat') } }
}

/** Poids de cuisine : au gramme sous 50 g, à 5 g au-dessus (on ne pèse pas 64,7 g de riz). */
export function roundKitchenGrams(grams: number): number {
  if (grams < 50) return Math.max(1, Math.round(grams))
  return Math.round(grams / 5) * 5
}

/** Libellé d'un poids de cuisine arrondi, ex. « 65 g ». */
export const formatKitchenGrams = (grams: number) => `${roundKitchenGrams(grams).toLocaleString('fr-FR')} g`

/**
 * Équivalent du poids dans l'une des unités du remplaçant (pièce, tranche…), à la demi-unité près, quand il tombe entre
 * une demi et dix unités : ex. « ≈ 1,5 × Œuf ». `null` sans unité parlante.
 */
export function nearestUnitLabel(ingredient: Ingredient, grams: number): string | null {
  for (const unit of ingredientUnitEntries(ingredient)) {
    if (['g', 'ml'].includes(unit.label.trim().toLowerCase())) continue
    const unitGrams = gramsForUnit(ingredient, unit.id)
    if (!unitGrams) continue
    const count = Math.round((grams / unitGrams) * 2) / 2
    if (count >= 0.5 && count <= 10) return `≈ ${count.toLocaleString('fr-FR')} × ${unit.label}`
  }
  return null
}
