import type { Timestamp } from 'firebase/firestore'

/**
 * Où en est un article :
 * - `toBuy` : à acheter ;
 * - `atHome` : déjà à la maison, sorti de la liste à acheter (réaffichable) ;
 * - `inCart` : mis dans le panier en magasin, supprimé à la fin des courses.
 */
export type ShoppingItemStatus = 'toBuy' | 'atHome' | 'inCart'

/**
 * Un article de la collection Firestore `shoppingList`, un document par article.
 * Ajouté à la main, ou depuis les menus : il garde alors l'ingrédient et ses quantités cumulées, figées à l'ajout
 * (modifier les menus ensuite ne change pas la liste). Champs facultatifs omis plutôt qu'`undefined` (refusé par Firestore).
 * En lecture depuis VueFire, chaque document a aussi un `id`.
 */
export interface ShoppingItem {
  id: string
  /** Utilisateur auquel l'article est rattaché (uid, identifiant du document `users`). */
  user: string
  label: string
  status: ShoppingItemStatus
  /** Ingrédient (Firestore `ingredients`) dont provient l'article ; absent pour un ajout manuel. */
  ingredientId?: string
  /** Rayon (Firestore `ingredientCategories`) ; absent ou inconnu : « Divers ». */
  categoryId?: string
  /** Quantités cumulées, comme dans `ShoppingListItem` ; absentes pour un ajout manuel. */
  grams?: number
  milliliters?: number
  pieces?: number
  /**
   * Quantité saisie à la main (ex. "3 pièces", "2 paquets") : remplace celle calculée depuis `grams` / `milliliters` /
   * `pieces`, qui restent pour y revenir. Un article ainsi modifié n'est plus complété par un ajout depuis les menus.
   */
  quantity?: string
  /** Recettes qui demandent l'ingrédient, puis « Hors recette ». */
  sources?: string[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
