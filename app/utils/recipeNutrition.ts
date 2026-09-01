import type { Ingredient } from '~/types/ingredient'
import type { RecipeIngredientLine } from '~/types/recipe'
import { gramsForUnit, scaleMacros, type IngredientMacros } from './ingredientNutrition'

const EMPTY_MACROS: IngredientMacros = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }

/**
 * Index unité → ingrédient parent : pour chaque id d'unité (`ing.units[id]`) du
 * catalogue, l'ingrédient qui la porte. Permet de résoudre une ligne de recette
 * dont `ingredientRef` référence une unité plutôt que l'ingrédient lui-même.
 * À construire une fois pour tout le catalogue chargé (voir `macrosForRecipe`).
 */
export function buildUnitOwnerIndex(ingredients: Ingredient[]): Map<string, Ingredient> {
  const index = new Map<string, Ingredient>()
  for (const ing of ingredients) {
    for (const unitId of Object.keys(ing.units ?? {})) {
      index.set(unitId, ing)
    }
  }
  return index
}

/**
 * Macros d'une ligne d'ingrédient de recette. L'id référencé par la ligne
 * (`line.ingredientRef.id`) désigne :
 * - un ingrédient (aliment brut, trouvé dans `ingredientsById`) : `quantity` est
 *   alors en grammes ;
 * - sinon une unité d'un ingrédient (trouvée dans `unitOwnerById`, via
 *   `ingredient.units[id]`) : `quantity` est alors un multiplicateur de cette
 *   unité (ex. 5 pièces).
 * `null` si l'id est introuvable dans les deux index, ou si les valeurs
 * nutritionnelles / l'unité référencée sont manquantes.
 */
export function macrosForRecipeLine(
  line: Pick<RecipeIngredientLine, 'ingredientRef' | 'quantity'>,
  ingredientsById: Map<string, Ingredient>,
  unitOwnerById: Map<string, Ingredient>
): IngredientMacros | null {
  if (line.quantity <= 0) return null

  const refId = line.ingredientRef.id

  const directIngredient = ingredientsById.get(refId)
  if (directIngredient) {
    if (!directIngredient.valuesBy100) return null
    return scaleMacros(directIngredient.valuesBy100, line.quantity / 100)
  }

  const owner = unitOwnerById.get(refId)
  if (!owner?.valuesBy100) return null

  const unitGrams = gramsForUnit(owner, refId)
  if (unitGrams == null) return null

  return scaleMacros(owner.valuesBy100, (unitGrams * line.quantity) / 100)
}

/**
 * Intitulé lisible et quantité affichée d'une ligne de recette, résolus via les
 * mêmes index que `macrosForRecipeLine` : nom de l'ingrédient + quantité en
 * grammes pour une référence directe, ou « ingrédient (unité) » + multiplicateur
 * pour une référence à une unité. `null` si l'id est introuvable dans les deux index.
 */
export function describeRecipeLine(
  line: Pick<RecipeIngredientLine, 'ingredientRef' | 'quantity'>,
  ingredientsById: Map<string, Ingredient>,
  unitOwnerById: Map<string, Ingredient>
): { label: string; quantityLabel: string } | null {
  const refId = line.ingredientRef.id

  const directIngredient = ingredientsById.get(refId)
  if (directIngredient) {
    return { label: directIngredient.label, quantityLabel: `${line.quantity} g` }
  }

  const owner = unitOwnerById.get(refId)
  const unit = owner?.units?.[refId]
  if (owner && unit) {
    return { label: `${owner.label} (${unit.label})`, quantityLabel: `${line.quantity} × ${unit.label}` }
  }

  return null
}

/**
 * Macros totales d'une recette : somme des lignes résolues via `ingredientsById`
 * / `unitOwnerById` (voir `macrosForRecipeLine`). Une ligne dont la référence est
 * introuvable, ou sans valeurs nutritionnelles, est ignorée plutôt que de rendre
 * le total indisponible.
 */
export function macrosForRecipe(
  lines: RecipeIngredientLine[] | undefined,
  ingredientsById: Map<string, Ingredient>,
  unitOwnerById: Map<string, Ingredient>
): IngredientMacros {
  const total = { ...EMPTY_MACROS }
  for (const line of lines ?? []) {
    const lineMacros = macrosForRecipeLine(line, ingredientsById, unitOwnerById)
    if (!lineMacros) continue

    total.calories += lineMacros.calories
    total.protein += lineMacros.protein
    total.carbohydrates += lineMacros.carbohydrates
    total.fat += lineMacros.fat
  }
  return total
}
