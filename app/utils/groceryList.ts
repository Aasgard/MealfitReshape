import type { IngredientCategory } from '~/types/ingredientCategory'
import type { ShoppingItem, ShoppingItemStatus } from '~/types/shoppingList'
import { formatShoppingQuantity } from './shoppingList'

/** Page « Liste de courses » : une ligne affichée par article de la collection `shoppingList`. */

/** Rayon des articles sans catégorie du catalogue (ajouts manuels, catégorie inconnue). */
export const MISC_AISLE: IngredientCategory = { id: 'misc', label: 'Divers', order: 99, icon: 'shopping-basket' }

export interface GroceryLine {
  id: string
  label: string
  aisle: IngredientCategory
  /** Quantité affichée : saisie à la main, sinon calculée ("4 pièces (600 g)") ; vide si aucune. */
  quantityLabel: string
  /** Quantité calculée depuis les menus ; vide pour un ajout manuel. */
  computedQuantityLabel: string
  /** La quantité affichée a été saisie à la main. */
  isQuantityEdited: boolean
  /** Recettes (ou « Hors recette ») qui demandent cet ingrédient. */
  sources: string[]
  manual: boolean
  status: ShoppingItemStatus
  item: ShoppingItem
}

export const compareGroceryLines = (a: GroceryLine, b: GroceryLine) =>
  a.aisle.order - b.aisle.order || a.aisle.label.localeCompare(b.aisle.label, 'fr') || a.label.localeCompare(b.label, 'fr')

/** Ligne affichée d'un article ; `aisleOf` résout son rayon dans le catalogue des catégories. */
export function groceryLineFromItem(item: ShoppingItem, aisleOf: (categoryId?: string) => IngredientCategory): GroceryLine {
  const hasQuantity = (item.grams ?? 0) > 0 || (item.milliliters ?? 0) > 0
  const computedQuantityLabel = hasQuantity
    ? formatShoppingQuantity({ grams: item.grams ?? 0, milliliters: item.milliliters ?? 0, pieces: item.pieces })
    : ''
  return {
    id: item.id,
    label: item.label,
    aisle: aisleOf(item.categoryId),
    quantityLabel: item.quantity || computedQuantityLabel,
    computedQuantityLabel,
    isQuantityEdited: !!item.quantity,
    sources: item.sources ?? [],
    manual: !item.ingredientId,
    status: item.status,
    item,
  }
}
