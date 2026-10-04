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

/** Grammes entiers à partir de 100 g, au dixième en dessous ; jusqu'à 2 décimales pour un nombre d'unités (ex. 1,5 œuf). */
const formatLineQuantity = (quantity: number, inGrams: boolean) =>
  quantity.toLocaleString('fr-FR', { maximumFractionDigits: inGrams ? (quantity >= 100 ? 0 : 1) : 2 })

/**
 * Intitulé lisible (nom de l'ingrédient parent, quelle que soit l'unité) et
 * quantité affichée d'une ligne de recette, résolus via `ingredientsById`.
 * `factor` multiplie la quantité (ex. 5 parts d'une recette prévue pour 4 : 5 / 4).
 * `equivalentLabel` : pour une unité autre que « g » / « ml » (pièce, cuillère…), le poids ou volume total
 * de la ligne, ex. « (= 160g) » pour 2 × Pièce de 80 g.
 * `null` si l'ingrédient ou l'unité référencée est introuvable.
 */
export function describeRecipeLine(
  line: Pick<RecipeIngredientLine, 'ingredientRef' | 'unit' | 'quantity'>,
  ingredientsById: Map<string, Ingredient>,
  factor = 1
): { label: string; quantityLabel: string; equivalentLabel?: string } | null {
  if (!line.ingredientRef) return null

  const ingredient = ingredientsById.get(line.ingredientRef.id)
  if (!ingredient) return null

  const quantity = line.quantity * factor
  if (!line.unit) {
    return { label: ingredient.label, quantityLabel: `${formatLineQuantity(quantity, true)} g` }
  }

  const unit = ingredient.units?.[line.unit]
  if (!unit) return null

  const quantityLabel = `${formatLineQuantity(quantity, false)} × ${unit.label}`
  const isPlainMeasure = ['g', 'ml'].includes(unit.label.trim().toLowerCase())
  if (isPlainMeasure || !(unit.value > 0)) return { label: ingredient.label, quantityLabel }

  return {
    label: ingredient.label,
    quantityLabel,
    equivalentLabel: `(= ${formatLineQuantity(quantity * unit.value, true)}${unit.unit})`,
  }
}

/**
 * Macros pour une part d'une recette : somme des lignes résolues via `ingredientsById`
 * (voir `macrosForRecipeLine`), divisée par `persons`. Une ligne dont la référence est
 * introuvable, ou sans valeurs nutritionnelles, est ignorée plutôt que de rendre le
 * total indisponible.
 */
export function macrosForRecipe(
  lines: RecipeIngredientLine[] | undefined,
  ingredientsById: Map<string, Ingredient>,
  persons = 1
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
  return scaleMacros(total, 1 / (persons > 0 ? persons : 1))
}
