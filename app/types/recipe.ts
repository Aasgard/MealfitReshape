import type { DocumentReference, Timestamp } from 'firebase/firestore'
import type { RecipeType } from '~/utils/recipeType'

/** Ligne d’ingrédient dans une recette (réf. document `ingredients` + quantité) */
export interface RecipeIngredientLine {
  /** Référence Firestore vers le document ingrédient (jamais vers une unité) */
  ingredientRef: DocumentReference
  /** Id d'une unité de l'ingrédient (clé de `ingredient.units`) ; absent = quantité en grammes */
  unit?: string
  /** Quantité : grammes si `unit` absent, sinon nombre de fois l'unité référencée */
  quantity: number
}

/**
 * Représente une recette.
 * En lecture depuis une collection Firestore (VueFire), chaque document a aussi un `id`.
 */
export interface Recipe {
  id: string
  /** Titre de la recette */
  title: string
  /** Description ou instructions */
  description?: string
  /** Date de dernière mise à jour */
  updatedAt?: Timestamp
  /** Date de création */
  createdAt?: Timestamp
  /** Indique si la recette est publique */
  isPublic?: boolean
  /** Propriétaire (uid utilisateur) */
  owner?: string | null
  /** Durée de préparation (minutes) */
  prepTime?: number
  /** Durée de cuisson (minutes) */
  cookTime?: number
  /** Type de repas */
  type?: RecipeType
  /** Niveau de difficulté (ex. "EASY", "MEDIUM", "HARD") */
  difficulty?: string
  /** Nombre de parts que produit la recette ; `undefined` équivaut à 1. */
  persons?: number
  imageUrl?: string
  source?: string
  instructions?: string
  tags?: string[]
  ingredients?: RecipeIngredientLine[]
}
