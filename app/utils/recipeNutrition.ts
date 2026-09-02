import type { Ingredient } from '~/types/ingredient'
import type { RecipeIngredientLine } from '~/types/recipe'
import { gramsForUnit, scaleMacros, type IngredientMacros } from './ingredientNutrition'

const EMPTY_MACROS: IngredientMacros = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }

/**
 * Macros d'une ligne d'ingrédient de recette. `line.ingredientRef` désigne
 * toujours le document ingrédient (trouvé dans `ingredientsById`) :
 * - si `line.unit` est absent, `quantity` est en grammes ;
 * - si `line.unit` est renseigné, c'est l'id d'une unité de cet ingrédient
 *   (`ingredient.units[unit]`) et `quantity` en est un multiplicateur (ex. 5 pièces).
 * `null` si l'ingrédient est introuvable, si l'unité référencée est manquante,
 * ou si les valeurs nutritionnelles nécessaires sont absentes.
 */
export function macrosForRecipeLine(
  line: Pick<RecipeIngredientLine, 'ingredientRef' | 'unit' | 'quantity'>,
  ingredientsById: Map<string, Ingredient>
): IngredientMacros | null {
  if (line.quantity <= 0) return null
  if (!line.ingredientRef) return null

  const ingredient = ingredientsById.get(line.ingredientRef.id)
  if (!ingredient?.valuesBy100) return null

  if (!line.unit) {
    return scaleMacros(ingredient.valuesBy100, line.quantity / 100)
  }

  const unitGrams = gramsForUnit(ingredient, line.unit)
  if (unitGrams == null) return null

  return scaleMacros(ingredient.valuesBy100, (unitGrams * line.quantity) / 100)
}

/**
 * Intitulé lisible (nom de l'ingrédient parent, quelle que soit l'unité) et
 * quantité affichée d'une ligne de recette, résolus via `ingredientsById`.
 * `null` si l'ingrédient ou l'unité référencée est introuvable.
 */
export function describeRecipeLine(
  line: Pick<RecipeIngredientLine, 'ingredientRef' | 'unit' | 'quantity'>,
  ingredientsById: Map<string, Ingredient>
): { label: string; quantityLabel: string } | null {
  if (!line.ingredientRef) return null

  const ingredient = ingredientsById.get(line.ingredientRef.id)
  if (!ingredient) return null

  if (!line.unit) {
    return { label: ingredient.label, quantityLabel: `${line.quantity} g` }
  }

  const unit = ingredient.units?.[line.unit]
  if (!unit) return null

  return { label: ingredient.label, quantityLabel: `${line.quantity} × ${unit.label}` }
}

/**
 * Macros totales d'une recette : somme des lignes résolues via `ingredientsById`
 * (voir `macrosForRecipeLine`). Une ligne dont la référence est introuvable, ou
 * sans valeurs nutritionnelles, est ignorée plutôt que de rendre le total indisponible.
 */
export function macrosForRecipe(
  lines: RecipeIngredientLine[] | undefined,
  ingredientsById: Map<string, Ingredient>
): IngredientMacros {
  const total = { ...EMPTY_MACROS }
  for (const line of lines ?? []) {
    const lineMacros = macrosForRecipeLine(line, ingredientsById)
    if (!lineMacros) continue

    total.calories += lineMacros.calories
    total.protein += lineMacros.protein
    total.carbohydrates += lineMacros.carbohydrates
    total.fat += lineMacros.fat
  }
  return total
}
