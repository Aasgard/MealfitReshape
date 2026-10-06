import type { Timestamp } from 'firebase/firestore'

/**
 * Un récipient (casserole, cocotte, boîte...) dont on connaît le poids à vide,
 * pour peser un meal prep et en déduire le poids d'une part.
 * En lecture depuis une collection Firestore (VueFire), chaque document a aussi un `id`.
 */
export interface Container {
  id: string
  /** Nom du récipient. Ex : "Cocotte en fonte grise" */
  label: string
  /** Poids à vide (tare), en grammes entiers. */
  weight: number
  /** Note libre. Ex : "Couvercle non compris" */
  comment?: string
  /** URL de téléchargement de la photo (Firebase Storage). */
  imageUrl?: string
  /** Chemin Storage de la photo, pour la remplacer ou la supprimer. */
  imagePath?: string
  /** Propriétaire (uid utilisateur) : un récipient est toujours privé. */
  owner: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
