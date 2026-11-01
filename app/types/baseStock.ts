import type { Timestamp } from 'firebase/firestore'
import type { DishStorage } from './preparedDish'

/**
 * Une recette de base préparée d'avance et rangée (collection Firestore `baseStocks`) : un bocal de pickles, un pot de
 * pesto. Elle se compte en grammes : les plats des menus qui l'utilisent y puisent leur part (réservée tant que le jour
 * du repas n'est pas passé, consommée ensuite). Commune au foyer, comme les plats préparés.
 * Champs facultatifs omis plutôt qu'`undefined` (refusé par Firestore). En lecture depuis VueFire, chaque document a
 * aussi un `id`.
 */
export interface BaseStock {
  id: string
  /** Créateur (uid), qui ne change jamais ; les membres de son foyer la voient, y puisent et la corrigent. */
  owner: string
  /** Recette de base (Firestore `recipes`, type `BASE`). */
  recipeId: string
  /** Titre de la base à l'entrée au stock, si la recette disparaît. */
  label: string
  /** Grammes comptés le jour `countedOn` : ce qui a été préparé, ou ce qui restait à la dernière correction. */
  grams: number
  /** Jour du comptage, `yyyy-MM-dd` : seuls les repas de ce jour et des suivants y puisent. */
  countedOn: string
  /** Jour de préparation, `yyyy-MM-dd` : pour la fraîcheur, ne change pas à la correction. */
  preparedOn: string
  storage: DishStorage
  comment?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
