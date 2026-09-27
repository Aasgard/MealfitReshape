import type { Ingredient } from '~/types/ingredient'
import type { IngredientCategory } from '~/types/ingredientCategory'
import type { Meal } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import { gramsForUnit } from './ingredientNutrition'

/** Un ingrédient à acheter : toutes ses occurrences (recettes et aliments seuls) cumulées. */
export interface ShoppingListItem {
  ingredientId: string
  label: string
  category?: IngredientCategory
  grams: number
  /** Quantités exprimées en ml qui n'ont pas pu être converties en grammes, faute de densité. */
  milliliters: number
  /** Nombre de pièces correspondant à `grams` (arrondi au supérieur), si l'ingrédient a une unité « Pièce ». */
  pieces?: number
}

export interface ShoppingList {
  /** Triés par catégorie (ordre du catalogue) puis par nom. */
  items: ShoppingListItem[]
  /** Ce qui n'a pas pu être ajouté à la liste (macros saisies à la main, recette ou unité introuvable...). */
  skipped: string[]
}

/** Unité « Pièce » de l'ingrédient (reconnue à son libellé, sans tenir compte des accents ni de la casse), en grammes. */
function gramsPerPiece(ingredient: Ingredient): number | null {
  const pieceUnitId = Object.entries(ingredient.units ?? {}).find(([, unit]) =>
    unit.label.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase() === 'piece'
  )?.[0]
  return pieceUnitId ? gramsForUnit(ingredient, pieceUnitId) : null
}

/**
 * Liste de courses des repas `meals` : chaque ligne de recette (autant de recettes entières qu'il en faut pour
 * couvrir les parts cumulées) et chaque aliment seul est converti en grammes (une unité en ml passe par la densité
 * de l'ingrédient), puis cumulé par ingrédient.
 */
export function buildShoppingList(
  meals: Meal[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>
): ShoppingList {
  const itemsById = new Map<string, ShoppingListItem>()
  const skipped = new Set<string>()

  /** Ajoute `quantity` grammes de l'ingrédient (`unitId` `null`) ou `quantity` fois l'une de ses unités. */
  const add = (ingredientId: string, unitId: string | null, quantity: number) => {
    if (quantity <= 0) return

    const ingredient = ingredientsById.get(ingredientId)
    if (!ingredient) {
      skipped.add('Ingrédient introuvable')
      return
    }

    const item = itemsById.get(ingredientId) ?? {
      ingredientId,
      label: ingredient.label,
      category: ingredient.category,
      grams: 0,
      milliliters: 0,
    }

    if (unitId == null) {
      item.grams += quantity
    } else {
      const unit = ingredient.units?.[unitId]
      const unitGrams = gramsForUnit(ingredient, unitId)
      if (unitGrams != null) item.grams += unitGrams * quantity
      else if (unit?.unit === 'ml' && unit.value > 0) item.milliliters += unit.value * quantity
      else {
        skipped.add(`${ingredient.label} (unité introuvable)`)
        return
      }
    }
    itemsById.set(ingredientId, item)
  }

  /** Parts cumulées de chaque recette, sur tous les repas. */
  const partsByRecipeId = new Map<string, number>()

  for (const meal of meals) {
    switch (meal.category) {
      case 'RECIPE':
        partsByRecipeId.set(meal.recipeId, (partsByRecipeId.get(meal.recipeId) ?? 0) + meal.value)
        break
      case 'INGREDIENT':
        add(meal.ingredientId, meal.unitId ?? null, meal.quantity)
        break
      case 'RAW':
        skipped.add(`${meal.label} (macros saisies à la main)`)
        break
    }
  }

  // Une recette se prépare en entier : 6 parts planifiées d'une recette de 4 = 2 recettes complètes.
  for (const [recipeId, parts] of partsByRecipeId) {
    const recipe = recipesById.get(recipeId)
    if (!recipe) {
      skipped.add('Recette introuvable')
      continue
    }
    const persons = recipe.persons && recipe.persons > 0 ? recipe.persons : 1
    const factor = Math.ceil(parts / persons)
    for (const line of recipe.ingredients ?? []) {
      if (line.ingredientRef) add(line.ingredientRef.id, line.unit ?? null, line.quantity * factor)
    }
  }

  for (const item of itemsById.values()) {
    const ingredient = ingredientsById.get(item.ingredientId)
    const pieceGrams = ingredient ? gramsPerPiece(ingredient) : null
    // La marge évite qu'un reste d'arrondi (600,0000001 g pour des pièces de 150 g) ne fasse acheter une pièce de plus.
    if (pieceGrams && item.grams > 0) item.pieces = Math.ceil(item.grams / pieceGrams - 1e-6)
  }

  const categoryOrder = (item: ShoppingListItem) => item.category?.order ?? Number.POSITIVE_INFINITY
  const items = [...itemsById.values()].sort((a, b) =>
    categoryOrder(a) - categoryOrder(b)
    || (a.category?.label ?? '').localeCompare(b.category?.label ?? '', 'fr')
    || a.label.localeCompare(b.label, 'fr')
  )

  return { items, skipped: [...skipped] }
}

const formatNumber = (n: number, maximumFractionDigits = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits })

/** "350 g", "1,25 kg", "200 ml", "1,5 l" ; arrondi au supérieur pour ne pas en acheter trop peu. */
function formatAmount(value: number, unit: 'g' | 'ml'): string {
  const rounded = Math.ceil(value)
  if (rounded < 1000) return `${formatNumber(rounded)} ${unit}`
  return `${formatNumber(rounded / 1000, 2)} ${unit === 'g' ? 'kg' : 'l'}`
}

/** Quantité affichée d'un ingrédient, ex. "350 g", "350 g + 200 ml" ou "4 pièces (600 g)" s'il a une unité « Pièce ». */
export function formatShoppingQuantity(item: ShoppingListItem): string {
  const amount = [
    item.grams > 0 ? formatAmount(item.grams, 'g') : null,
    item.milliliters > 0 ? formatAmount(item.milliliters, 'ml') : null,
  ].filter(Boolean).join(' + ')
  if (!item.pieces) return amount
  return `${item.pieces} pièce${item.pieces > 1 ? 's' : ''} (${amount})`
}

/** Une ligne par ingrédient ("Tomate — 4 pièces (600 g)") : collée dans Todoist, chaque ligne devient une tâche. */
export function formatShoppingListText(items: ShoppingListItem[]): string {
  return items.map(item => `${item.label} — ${formatShoppingQuantity(item)}`).join('\n')
}
