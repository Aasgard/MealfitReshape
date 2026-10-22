import type { Timestamp } from 'firebase/firestore'
import type { StoreColor } from '~/utils/stores'

/**
 * Un magasin de la collection Firestore `stores`, un document par magasin. Rattaché à une liste comme les articles de
 * courses : celle du foyer (id `households`), sinon celle du compte (uid). Tous les membres le voient et le modifient ;
 * il reste au foyer quand celui qui l'a ajouté part.
 * En lecture depuis VueFire, chaque document a aussi un `id`.
 */
export interface Store {
  id: string
  /** Liste du magasin, comme `ShoppingItem.scope`. */
  scope: string
  /** Nom affiché. Ex : "Picard", "Marché du samedi" */
  name: string
  /** Clé de palette (`STORE_COLORS`), jamais une couleur brute : les teintes restent ajustables. */
  color: StoreColor
  /** Rang d'affichage, croissant. */
  order: number
  /** Compte qui l'a ajouté. */
  createdBy: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
