import type { Timestamp } from 'firebase/firestore'
import type { IngredientMacros } from '~/utils/ingredientNutrition'

/** Ligne du calendrier à laquelle appartient un repas, stockée telle quelle côté Firestore (`meals.mealType`). */
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINER' | 'SNACK' | 'EXCESS' | 'NOTCOUNT'

/** Nature de ce qui a été mangé, stockée telle quelle côté Firestore (`meals.category`). */
export type MealCategory = 'RECIPE' | 'INGREDIENT' | 'RAW'

/** Une recette de la base, en nombre de parts. */
export type RecipeMealSource = {
  category: 'RECIPE'
  recipeId: string
  /** Nombre de parts mangées. */
  value: number
}

/** Un ingrédient de la base, en grammes ou en nombre de fois l'une de ses unités. */
export type IngredientMealSource = {
  category: 'INGREDIENT'
  ingredientId: string
  /** Id d'une unité de l'ingrédient (clé de `ingredient.units`) ; `null` = quantité en grammes. */
  unitId: string | null
  quantity: number
}

/**
 * Produit scanné (Open Food Facts) d'où un repas « Macros » tire ses valeurs, sans être enregistré comme ingrédient.
 * Copie figée au moment du scan : l'affichage ne dépend jamais d'Open Food Facts. Champs facultatifs omis plutôt
 * qu'`undefined` (refusé par Firestore).
 */
export type ScannedProduct = {
  ean: string
  name: string
  brand?: string
  imageUrl?: string
  /** Base des valeurs : pour 100 g, ou 100 ml pour une boisson. */
  unit: 'g' | 'ml'
  per100: IngredientMacros
  /** Une portion et l'emballage entier, en `unit`, quand Open Food Facts les donne : raccourcis de quantité. */
  serving?: number
  package?: number
  /** Quantité mangée, en `unit`. */
  quantity: number
}

/** Un repas saisi à la main : un libellé et des macros brutes, calculées depuis un produit scanné quand `product` est présent. */
export type RawMealSource = IngredientMacros & {
  category: 'RAW'
  label: string
  product?: ScannedProduct
}

/** Ce qui a été mangé, sans son contexte (jour, ligne du calendrier, utilisateur). */
export type MealSource = RecipeMealSource | IngredientMealSource | RawMealSource

/**
 * Un repas de la collection Firestore `meals`.
 * En lecture depuis VueFire, chaque document a aussi un `id`.
 */
export type Meal = MealSource & {
  id: string
  /** Utilisateur auquel le repas est rattaché (uid, identifiant du document `users`). */
  user: string
  /** Jour du repas (minuit, heure locale). */
  date: Timestamp
  mealType: MealType
  createdAt?: Timestamp
}
