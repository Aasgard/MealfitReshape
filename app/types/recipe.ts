import type { DocumentReference, Timestamp } from 'firebase/firestore'

/** Ligne d’ingrédient dans une recette (réf. document `ingredients` + quantité + variation) */
export interface RecipeIngredientLine {
  /** Référence Firestore vers le document dans la collection `ingredients` */
  ingredientRef: DocumentReference
  quantity: number
  /** Référence à une entrée de `ingredient.variations`, ou `null` si non renseignée */
  variation: string | null
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
  /** Type de repas (ex. breakfast, lunch) */
  type?: string
  isFavorite?: boolean
  imageUrl?: string
  source?: string
  ingredients?: RecipeIngredientLine[]
}
