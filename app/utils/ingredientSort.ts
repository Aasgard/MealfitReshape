import type { Ingredient } from '~/types/ingredient'
import type { SortOption, SortState, SortValue } from '~/utils/listSort'
import { ingredientPieceUnit, proteinShare } from '~/utils/ingredientNutrition'

export type IngredientSortKey = 'label' | 'calories' | 'ratio' | 'carbohydrates' | 'protein' | 'fat' | 'piece'

export const INGREDIENT_SORT_OPTIONS: SortOption<IngredientSortKey>[] = [
  { key: 'label', label: 'Nom', defaultDirection: 'asc', icon: 'i-lucide-case-sensitive' },
  { key: 'calories', label: 'Calories', defaultDirection: 'desc', icon: 'i-lucide-flame' },
  { key: 'ratio', label: 'Part de protéines', defaultDirection: 'desc', icon: 'i-lucide-chart-pie' },
  { key: 'carbohydrates', label: 'Glucides', defaultDirection: 'desc', dot: 'bg-green-500' },
  { key: 'protein', label: 'Protéines', defaultDirection: 'desc', dot: 'bg-red-700' },
  { key: 'fat', label: 'Lipides', defaultDirection: 'desc', dot: 'bg-amber-500' },
  { key: 'piece', label: 'Poids d’une pièce', defaultDirection: 'desc', icon: 'i-lucide-scale' },
]

export const DEFAULT_INGREDIENT_SORT: SortState<IngredientSortKey> = { key: 'label', direction: 'asc' }

export function ingredientSortOption(key: IngredientSortKey): SortOption<IngredientSortKey> {
  return INGREDIENT_SORT_OPTIONS.find(o => o.key === key)!
}

/** Valeur triée pour un critère ; `null` (macros non renseignées, pas d'unité « pièce ») range l'ingrédient en fin de liste. */
export function ingredientSortValue(ingredient: Ingredient, key: IngredientSortKey): SortValue {
  switch (key) {
    case 'label': return ingredient.label
    case 'ratio': return proteinShare(ingredient.valuesBy100)
    case 'piece': return ingredientPieceUnit(ingredient)?.value ?? null
    default: return ingredient.valuesBy100?.[key] ?? null
  }
}

/**
 * Critères du champ « Trier par », identiques en vue cartes et en vue liste : sans le poids d'une pièce.
 * INGREDIENT_SORT_OPTIONS reste la liste complète, utilisée par les en-têtes de colonnes du tableau.
 */
export const INGREDIENT_MENU_SORT_OPTIONS = INGREDIENT_SORT_OPTIONS.filter(o => o.key !== 'piece')
