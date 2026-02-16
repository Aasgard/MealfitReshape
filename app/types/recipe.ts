import type { Timestamp } from 'firebase/firestore'

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
}
