import type { DocumentReference } from 'firebase/firestore'
import type { IngredientCategory } from './ingredientCategory'

/**
 * Représente un ingrédient ou aliment.
 * En lecture depuis une collection Firestore (VueFire), chaque document a aussi un `id`.
 */
export interface Ingredient {
  /** Mois actifs / de saison (1 = janvier, 12 = décembre) */
  activeMonths: number[]
  /** Référence Firestore vers la catégorie de l'ingrédient */
  category: DocumentReference<IngredientCategory>
  /** Commentaire ou note sur l'ingrédient */
  comment: string
  /** Nom de l'ingrédient */
  label: string
  /** Identifiant du document (présent quand lu depuis une collection via VueFire) */
  id?: string
}
