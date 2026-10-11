import type { Timestamp } from 'firebase/firestore'
import type { IngredientMacros } from '~/utils/ingredientNutrition'

/** Où un plat préparé est rangé, stocké tel quel côté Firestore (`preparedDishes.storage`). */
export type DishStorage = 'FREEZER' | 'FRIDGE' | 'PANTRY'

/** Surplus prévu d'une fournée : des parts cuisinées en plus de celles des menus, pour le stock. */
export interface DishBatchSurplus {
  /** Jour où la fournée se cuisine, `yyyy-MM-dd`. */
  cookDay: string
  /** Parts prévues en plus : comptées dans « Cuisiner » et dans la liste de courses (pas décomptées par les repas). */
  surplusParts: number
}

/**
 * Un plat déjà préparé, disponible d'avance (collection Firestore `preparedDishes`) : pris dans un repas, il ne se
 * cuisine pas et ne s'achète pas. Libellé et macros par part sont figés à l'entrée au stock : modifier la recette
 * d'origine ensuite ne change pas les parts déjà rangées.
 * Champs facultatifs omis plutôt qu'`undefined` (refusé par Firestore).
 * En lecture depuis VueFire, chaque document a aussi un `id`.
 */
export interface PreparedDish {
  id: string
  /** Propriétaire (uid utilisateur) : le stock est privé, en attendant un stock de foyer. */
  owner: string
  label: string
  /** Recette d'origine, pour sa fiche ; absente pour un plat hors recette. */
  recipeId?: string
  /** Macros d'une part, non arrondies. */
  perPart: IngredientMacros
  /** Parts encore disponibles : celles déjà placées dans un repas des menus en sont retirées. */
  parts: number
  storage: DishStorage
  /** Jour de préparation, `yyyy-MM-dd` ; plus tard qu'aujourd'hui, le plat est prévu (pas encore disponible). */
  preparedOn: string
  comment?: string
  /** Présent quand le plat vient du surplus prévu d'une fournée. */
  batch?: DishBatchSurplus
  /** Jour du repas le plus tardif qui y a pioché, `yyyy-MM-dd` : un plat épuisé reste affiché jusqu'à ce jour inclus. */
  lastMealOn?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
