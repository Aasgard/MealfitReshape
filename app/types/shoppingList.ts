import type { Timestamp } from 'firebase/firestore'

/**
 * Où en est un article :
 * - `toBuy` : à acheter ;
 * - `atHome` : déjà à la maison, sorti de la liste à acheter (réaffichable) ;
 * - `inCart` : mis dans le panier en magasin, supprimé à la fin des courses.
 */
export type ShoppingItemStatus = 'toBuy' | 'atHome' | 'inCart'

/**
 * Ce qu'une recette ou un aliment seul apporte à un article, un jour donné (jour de cuisson pour une recette, jour du
 * repas pour un aliment). Quantités figées au moment de l'inclusion du repas.
 */
export interface ShoppingContribution {
  /** Regroupement du panneau : `recipe:<id>` ou `ingredient:<id>:<unité>`. */
  key: string
  /** Jour au format `yyyy-MM-dd`. */
  date: string
  grams: number
  milliliters: number
  /** Nom de la recette (ou « Hors recette ») au moment de l'inclusion, pour l'affichage. */
  label: string
}

/**
 * Un article de la collection Firestore `shoppingList`, un document par article.
 * Ajouté à la main, ou depuis les menus : il porte alors ses apports, dont se déduisent quantités et besoins par jour.
 * Champs facultatifs omis plutôt qu'`undefined` (refusé par Firestore).
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
  /** Poids d'une pièce, si l'ingrédient a une unité « Pièce » : pour compter les pièces. */
  gramsPerPiece?: number
  /** Apports des repas inclus ; absents pour un ajout manuel. */
  contributions?: ShoppingContribution[]
  /** Quantité saisie à la main (ex. "3 pièces", "2 paquets") : remplace celle calculée depuis les apports. */
  quantity?: string
  /** Marqué urgent à la main (plus de stock, indispensable...), en plus de l'urgence calculée depuis les apports. */
  urgent?: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

/**
 * Un repas inclus dans la liste de courses (collection Firestore `shoppingMeals`), id `{uid}_{mealId}`.
 * Garde de quoi recalculer les apports sans relire les menus : modifier un repas dans les menus ne change pas la liste.
 * - `listed` : ses ingrédients sont dans la liste ;
 * - `bought` : achetés (fin des courses) ; ne peut plus être décoché ni racheté. Supprimé 2 jours après le repas.
 */
export interface ShoppingMealInclusion {
  id: string
  user: string
  /** Repas d'origine (Firestore `meals`). */
  mealId: string
  /** Jour du repas, `yyyy-MM-dd`. */
  date: string
  /** Regroupement du panneau : `recipe:<id>` ou `ingredient:<id>:<unité>`. */
  key: string
  recipeId?: string
  /** Parts retenues pour une recette (parts modifiées comprises). */
  parts?: number
  ingredientId?: string
  /** Quantité d'un aliment seul, en grammes (`unitId` `null`) ou en nombre de fois l'unité `unitId`. */
  quantity?: number
  unitId?: string | null
  state: 'listed' | 'bought'
  updatedAt?: Timestamp
}
