import type { Timestamp } from 'firebase/firestore'
import type { IngredientCategory } from './ingredientCategory'

/**
 * Représente un ingrédient ou aliment.
 * En lecture depuis une collection Firestore (VueFire), chaque document a aussi un `id`.
 */
export interface Ingredient {
  /** Mois actifs / de saison (1 = janvier, 12 = décembre) */
  activeMonths: number[]
  /** Référence Firestore vers la catégorie de l'ingrédient */
  category: IngredientCategory
  /** Commentaire ou note sur l'ingrédient */
  comment: string
  /** Nom de l'ingrédient */
  label: string
  /** Identifiant du document (présent quand lu depuis une collection via VueFire) */
  id: string
  /** Propriétaire de l'ingrédient */
  owner: string | null
  /** Date de dernière mise à jour */
  updatedAt: Timestamp
  /** Date de création */
  createdAt: Timestamp
  /** Indique si l'ingrédient est public */
  isPublic: boolean
  /** URL de l'image de l'ingrédient */
  imageUrl?: string
  unit?: 'g' | 'ml'
  /** Valeurs nutritionnelles par 100 unités de l'ingrédient */
  valuesBy100?: {
    calories: number
    protein: number
    carbohydrates: number
    fat: number
  }
  /** Tailles disponibles pour l'ingrédient */
  sizes?: Size[]
}

interface Size {
  label: string
  value: number
}
