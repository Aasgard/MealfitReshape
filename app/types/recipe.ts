import type { DocumentReference, Timestamp } from 'firebase/firestore'
import type { RecipeType } from '~/utils/recipeType'
import type { RecipeReading } from '#shared/types/recipeReading'

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
  /** URL de l'image : photo envoyée dans Firebase Storage, ou lien externe saisi. */
  imageUrl?: string
  /** Chemin Storage de la photo envoyée, pour la remplacer ou la supprimer ; absent pour un lien externe. */
  imagePath?: string
  /** Source en texte libre (lien, magazine…) ; absente quand la recette vient d'un livre de la bibliothèque. */
  source?: string
  /** Livre de cuisine (Firestore `books`) d'où vient la recette. */
  bookId?: string
  /** Page du livre, telle qu'écrite (« 42 », « 42-43 ») ; seulement avec `bookId`. */
  bookPage?: string
  instructions?: string
  tags?: string[]
  ingredients?: RecipeIngredientLine[]
}

/** Brouillon de recette lu sur des photos, qui pré-remplit le formulaire de création (rien n'est écrit avant relecture). */
export interface RecipeDraft {
  reading: RecipeReading
  /** Nombre de photos lues, pour le rappeler en tête du formulaire. */
  photoCount: number
  /** Illustration du plat recadrée depuis la page ; `null` si la page n'en montre pas. */
  dishImage: Blob | null
}
