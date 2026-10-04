import type { Recipe } from '~/types/recipe'
import { proteinShare, type IngredientMacros } from '~/utils/ingredientNutrition'
import type { SortOption, SortState, SortValue } from '~/utils/listSort'
import { RECIPE_TYPES, type RecipeType } from '~/utils/recipeType'

export type RecipeSortKey =
  | 'title' | 'type' | 'difficulty' | 'time' | 'prepTime' | 'cookTime'
  | 'calories' | 'ratio' | 'carbohydrates' | 'protein' | 'fat' | 'ingredients'

export const RECIPE_SORT_OPTIONS: SortOption<RecipeSortKey>[] = [
  { key: 'title', label: 'Nom', defaultDirection: 'asc', icon: 'i-lucide-case-sensitive' },
  { key: 'type', label: 'Type', defaultDirection: 'asc', icon: 'i-lucide-utensils' },
  { key: 'difficulty', label: 'Difficulté', defaultDirection: 'asc', icon: 'i-lucide-gauge' },
  { key: 'time', label: 'Temps total', defaultDirection: 'asc', icon: 'i-lucide-timer' },
  { key: 'prepTime', label: 'Préparation', defaultDirection: 'asc', icon: 'i-lucide-clock' },
  { key: 'cookTime', label: 'Cuisson', defaultDirection: 'asc', icon: 'i-lucide-cooking-pot' },
  { key: 'calories', label: 'Calories', defaultDirection: 'desc', icon: 'i-lucide-flame' },
  { key: 'ratio', label: 'Part de protéines', defaultDirection: 'desc', icon: 'i-lucide-chart-pie' },
  { key: 'carbohydrates', label: 'Glucides', defaultDirection: 'desc', dot: 'bg-green-500' },
  { key: 'protein', label: 'Protéines', defaultDirection: 'desc', dot: 'bg-red-700' },
  { key: 'fat', label: 'Lipides', defaultDirection: 'desc', dot: 'bg-amber-500' },
  { key: 'ingredients', label: 'Ingrédients', defaultDirection: 'desc', icon: 'i-lucide-list' },
]

export const DEFAULT_RECIPE_SORT: SortState<RecipeSortKey> = { key: 'title', direction: 'asc' }

export function recipeSortOption(key: RecipeSortKey): SortOption<RecipeSortKey> {
  return RECIPE_SORT_OPTIONS.find(o => o.key === key)!
}

/** Ordre croissant de difficulté ; « HARD » est un ancien alias de « HIGH » (voir recipeDifficulty). */
const DIFFICULTY_RANK: Record<string, number> = { EASY: 0, MEDIUM: 1, HIGH: 2, HARD: 2 }

/** Niveau de difficulté 0 (facile) à 2 (difficile) ; `null` si absente ou inconnue. */
export function recipeDifficultyRank(difficulty: string | undefined | null): number | null {
  return difficulty ? DIFFICULTY_RANK[difficulty.toUpperCase()] ?? null : null
}

/** Temps total (préparation + cuisson) en minutes ; `null` si aucune des deux durées n'est renseignée. */
export function recipeTotalTime(recipe: Recipe): number | null {
  if (recipe.prepTime == null && recipe.cookTime == null) return null
  return (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)
}

/**
 * Valeur triée pour un critère ; `macros` = macros par part (`null` si non calculables).
 * `null` range la recette en fin de liste, quel que soit le sens.
 */
export function recipeSortValue(recipe: Recipe, key: RecipeSortKey, macros: IngredientMacros | null): SortValue {
  switch (key) {
    case 'title': return recipe.title
    case 'type': {
      const index = recipe.type ? RECIPE_TYPES.indexOf(recipe.type as RecipeType) : -1
      return index >= 0 ? index : null
    }
    case 'difficulty': return recipeDifficultyRank(recipe.difficulty)
    case 'time': return recipeTotalTime(recipe)
    case 'prepTime': return recipe.prepTime ?? null
    case 'cookTime': return recipe.cookTime ?? null
    case 'ingredients': return recipe.ingredients?.length || null
    case 'ratio': return proteinShare(macros)
    default: return macros?.[key] ?? null
  }
}

/** Critères proposés en vue cartes : type, temps de préparation / cuisson séparés et ratio ne servent qu'en vue liste. */
export const RECIPE_CARD_SORT_OPTIONS = RECIPE_SORT_OPTIONS.filter(o => !(['type', 'prepTime', 'cookTime', 'ratio'] as RecipeSortKey[]).includes(o.key))
