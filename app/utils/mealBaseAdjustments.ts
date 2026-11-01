import type { DocumentReference } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import type { MealBaseAdjustment } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import { gramsForUnit, type IngredientMacros } from './ingredientNutrition'
import { macrosForRecipeLine } from './recipeNutrition'
import { baseKey, lineBaseId } from './recipeLineSource'

const ZERO: IngredientMacros = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }

/** Ce que `parts` parts d'une recette prévoient d'une base : ses lignes (souvent une seule), à l'échelle des parts. */
export interface PlannedBase {
  recipeId: string
  lines: { unit?: string; quantity: number }[]
}

/** Bases directement présentes dans la recette, dans l'ordre des lignes, avec leur quantité pour `parts` parts. */
export function plannedBases(recipe: Recipe, parts: number): PlannedBase[] {
  const persons = recipe.persons && recipe.persons > 0 ? recipe.persons : 1
  const factor = parts / persons
  const byId = new Map<string, PlannedBase>()
  for (const line of recipe.ingredients ?? []) {
    const id = lineBaseId(line)
    if (!id) continue
    const planned = byId.get(id) ?? { recipeId: id, lines: [] }
    planned.lines.push({ ...(line.unit ? { unit: line.unit } : {}), quantity: line.quantity * factor })
    byId.set(id, planned)
  }
  return [...byId.values()]
}

/** Grammes d'une quantité de base (`unit` absent = déjà en grammes) ; `null` si la portion n'existe plus. */
export function baseGrams(baseId: string, unit: string | undefined, quantity: number, ingredientsById: Map<string, Ingredient>): number | null {
  if (!unit) return quantity
  const base = ingredientsById.get(baseKey(baseId))
  const unitGrams = base ? gramsForUnit(base, unit) : null
  return unitGrams == null ? null : unitGrams * quantity
}

const baseMacros = (baseId: string, unit: string | undefined, quantity: number, ingredientsById: Map<string, Ingredient>) =>
  quantity > 0
    ? macrosForRecipeLine({ recipeRef: { id: baseId } as DocumentReference, quantity, ...(unit ? { unit } : {}) }, ingredientsById) ?? ZERO
    : ZERO

const add = (a: IngredientMacros, b: IngredientMacros, sign = 1): IngredientMacros => ({
  calories: a.calories + sign * b.calories,
  protein: a.protein + sign * b.protein,
  carbohydrates: a.carbohydrates + sign * b.carbohydrates,
  fat: a.fat + sign * b.fat,
})

/**
 * Macros à ajouter (ou retirer) à celles de la recette : pour chaque base ajustée, ce qui a été mangé moins ce que la
 * recette prévoyait pour ces parts (rien pour une base ajoutée au repas).
 */
export function baseAdjustmentDelta(
  recipe: Recipe,
  parts: number,
  adjustments: MealBaseAdjustment[] | undefined,
  ingredientsById: Map<string, Ingredient>
): IngredientMacros {
  if (!adjustments?.length) return ZERO
  const planned = new Map(plannedBases(recipe, parts).map(p => [p.recipeId, p]))
  let delta = ZERO
  for (const adjustment of adjustments) {
    delta = add(delta, baseMacros(adjustment.recipeId, adjustment.unit, adjustment.quantity, ingredientsById))
    for (const line of planned.get(adjustment.recipeId)?.lines ?? []) {
      delta = add(delta, baseMacros(adjustment.recipeId, line.unit, line.quantity, ingredientsById), -1)
    }
  }
  return delta
}

const formatGrams = (grams: number) => `${Math.round(grams).toLocaleString('fr-FR')} g`

/** Écart d'une base, lisible sur la carte du repas : « Mayonnaise +20 g », « Pickles −10 g », « Pesto 15 g » (ajoutée). */
export function baseAdjustmentLabel(
  recipe: Recipe,
  parts: number,
  adjustments: MealBaseAdjustment[] | undefined,
  ingredientsById: Map<string, Ingredient>
): string | undefined {
  if (!adjustments?.length) return undefined
  const planned = new Map(plannedBases(recipe, parts).map(p => [p.recipeId, p]))
  const labels: string[] = []
  for (const adjustment of adjustments) {
    const title = ingredientsById.get(baseKey(adjustment.recipeId))?.label ?? 'Base introuvable'
    const eaten = baseGrams(adjustment.recipeId, adjustment.unit, adjustment.quantity, ingredientsById)
    const lines = planned.get(adjustment.recipeId)?.lines ?? []
    const plannedGrams = lines.reduce<number | null>((total, line) => {
      const grams = baseGrams(adjustment.recipeId, line.unit, line.quantity, ingredientsById)
      return total == null || grams == null ? null : total + grams
    }, 0)
    if (eaten == null || plannedGrams == null) {
      labels.push(`${title} ajustée`)
      continue
    }
    if (!lines.length) {
      labels.push(`${title} ${formatGrams(eaten)}`)
      continue
    }
    const diff = eaten - plannedGrams
    if (Math.abs(diff) < 0.5) continue
    labels.push(`${title} ${diff > 0 ? '+' : '−'}${formatGrams(Math.abs(diff))}`)
  }
  return labels.length ? labels.join(' · ') : undefined
}
