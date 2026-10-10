import { format } from 'date-fns'
import type { Ingredient } from '~/types/ingredient'
import type { IngredientCategory } from '~/types/ingredientCategory'
import type { Meal } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import { gramsForUnit } from './ingredientNutrition'

/** Besoin d'un ingrédient un jour donné : le jour où il est cuisiné (recette) ou mangé (aliment seul). */
export interface ShoppingNeed {
  /** Jour au format `yyyy-MM-dd`. */
  date: string
  grams: number
  milliliters: number
  /** Recettes (ou « Hors recette ») qui le demandent ce jour-là. */
  sources: string[]
}

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
  /** Poids d'une pièce, si l'ingrédient a une unité « Pièce » : sert à compter les pièces de chaque jour. */
  gramsPerPiece?: number
  /** Recettes qui demandent l'ingrédient (par ordre alphabétique), puis « Hors recette » s'il est aussi mangé seul. */
  sources: string[]
  /** Besoins jour par jour, par date croissante ; leurs quantités font `grams` et `milliliters`. */
  needs: ShoppingNeed[]
}

/** Source d'un ingrédient mangé seul, hors de toute recette. */
export const OUTSIDE_RECIPE_SOURCE = 'Hors recette'

/** Recettes par ordre alphabétique, « Hors recette » en dernier. */
export const compareShoppingSources = (a: string, b: string) =>
  a === OUTSIDE_RECIPE_SOURCE ? 1 : b === OUTSIDE_RECIPE_SOURCE ? -1 : a.localeCompare(b, 'fr')

export interface ShoppingList {
  /** Triés par catégorie (ordre du catalogue) puis par nom. */
  items: ShoppingListItem[]
  /** Ce qui n'a pas pu être ajouté à la liste (macros saisies à la main, recette ou unité introuvable...). */
  skipped: string[]
}

/** Unité « Pièce » de l'ingrédient (reconnue à son libellé, sans tenir compte des accents ni de la casse), en grammes. */
export function gramsPerPiece(ingredient: Ingredient): number | null {
  const pieceUnitId = Object.entries(ingredient.units ?? {}).find(([, unit]) =>
    unit.label.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase() === 'piece'
  )?.[0]
  return pieceUnitId ? gramsForUnit(ingredient, pieceUnitId) : null
}

/** Pièces à acheter pour `grams` ; la marge évite qu'un reste d'arrondi fasse acheter une pièce de plus. */
export const piecesFor = (grams: number, pieceGrams: number) => Math.ceil(grams / pieceGrams - 1e-6)

/** Jour d'un repas, au format `yyyy-MM-dd` (heure locale). */
export const mealDay = (meal: Meal) => format(meal.date.toDate(), 'yyyy-MM-dd')

/**
 * `quantity` grammes de l'ingrédient (`unitId` `null`) ou `quantity` fois l'une de ses unités, en grammes, ou en ml
 * faute de densité ; `null` si l'unité est introuvable.
 */
export function ingredientAmount(ingredient: Ingredient, unitId: string | null, quantity: number): { grams: number, milliliters: number } | null {
  if (unitId == null) return { grams: quantity, milliliters: 0 }
  const unitGrams = gramsForUnit(ingredient, unitId)
  if (unitGrams != null) return { grams: unitGrams * quantity, milliliters: 0 }
  const unit = ingredient.units?.[unitId]
  if (unit?.unit === 'ml' && unit.value > 0) return { grams: 0, milliliters: unit.value * quantity }
  return null
}

/** Une fournée de recette : le jour où elle se cuisine et les portions (par `id`) qu'elle couvre, même en partie. */
export interface RecipeBatch<Id> {
  day: string
  covers: Id[]
}

/**
 * Fournées d'une recette : elle se prépare en entier, le jour du premier repas qu'une fournée doit couvrir.
 * Recette pour 4, 2 parts mardi, mercredi, samedi et dimanche : une fournée mardi (mardi + mercredi), une samedi.
 * Autant de fournées que `ceil(parts cumulées / persons)`.
 */
export function recipeBatches<Id>(portions: { id: Id, date: string, parts: number }[], persons: number): RecipeBatch<Id>[] {
  const batches: RecipeBatch<Id>[] = []
  let left = 0
  const sorted = [...portions].sort((a, b) => a.date.localeCompare(b.date))
  for (const { id, date, parts } of sorted) {
    let toCover = parts
    while (toCover > 1e-9) {
      if (left <= 1e-9) {
        batches.push({ day: date, covers: [] })
        left = persons
      }
      const batch = batches.at(-1)!
      if (!batch.covers.includes(id)) batch.covers.push(id)
      const taken = Math.min(toCover, left)
      left -= taken
      toCover -= taken
    }
  }
  return batches
}

/** Jours de cuisson d'une recette (voir `recipeBatches`). */
export const recipeCookDays = (portions: { date: string, parts: number }[], persons: number): string[] =>
  recipeBatches(portions.map((portion, id) => ({ ...portion, id })), persons).map(batch => batch.day)

/**
 * Liste de courses des repas `meals` : chaque ligne de recette (autant de recettes entières qu'il en faut pour
 * couvrir les parts cumulées, chacune due le jour où elle se cuisine) et chaque aliment seul (dû le jour du repas)
 * est converti en grammes (une unité en ml passe par la densité de l'ingrédient), puis cumulé par ingrédient et par jour.
 */
export function buildShoppingList(
  meals: Meal[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>
): ShoppingList {
  const itemsById = new Map<string, ShoppingListItem>()
  const skipped = new Set<string>()

  /** Ajoute `quantity` grammes de l'ingrédient (`unitId` `null`) ou `quantity` fois l'une de ses unités, demandés par `source` le jour `date`. */
  const add = (ingredientId: string, unitId: string | null, quantity: number, source: string, date: string) => {
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
      sources: [],
      needs: [],
    }

    const amount = ingredientAmount(ingredient, unitId, quantity)
    if (!amount) {
      skipped.add(`${ingredient.label} (unité introuvable)`)
      return
    }
    const { grams, milliliters } = amount
    item.grams += grams
    item.milliliters += milliliters
    if (!item.sources.includes(source)) item.sources.push(source)

    let need = item.needs.find(n => n.date === date)
    if (!need) {
      need = { date, grams: 0, milliliters: 0, sources: [] }
      item.needs.push(need)
    }
    need.grams += grams
    need.milliliters += milliliters
    if (!need.sources.includes(source)) need.sources.push(source)

    itemsById.set(ingredientId, item)
  }

  /** Parts de chaque recette, jour par jour. */
  const portionsByRecipeId = new Map<string, { date: string, parts: number }[]>()

  for (const meal of meals) {
    switch (meal.category) {
      case 'RECIPE': {
        const portions = portionsByRecipeId.get(meal.recipeId) ?? []
        portions.push({ date: mealDay(meal), parts: meal.value })
        portionsByRecipeId.set(meal.recipeId, portions)
        break
      }
      case 'INGREDIENT':
        add(meal.ingredientId, meal.unitId ?? null, meal.quantity, OUTSIDE_RECIPE_SOURCE, mealDay(meal))
        break
      case 'RAW':
        skipped.add(`${meal.label} (macros saisies à la main)`)
        break
    }
  }

  // Une recette se prépare en entier : 6 parts planifiées d'une recette de 4 = 2 recettes complètes, chacune due
  // le jour où elle se cuisine.
  for (const [recipeId, portions] of portionsByRecipeId) {
    const recipe = recipesById.get(recipeId)
    if (!recipe) {
      skipped.add('Recette introuvable')
      continue
    }
    const persons = recipe.persons && recipe.persons > 0 ? recipe.persons : 1
    for (const day of recipeCookDays(portions, persons)) {
      for (const line of recipe.ingredients ?? []) {
        if (line.ingredientRef) add(line.ingredientRef.id, line.unit ?? null, line.quantity, recipe.title, day)
      }
    }
  }

  for (const item of itemsById.values()) {
    const ingredient = ingredientsById.get(item.ingredientId)
    const pieceGrams = ingredient ? gramsPerPiece(ingredient) : null
    if (pieceGrams && item.grams > 0) item.pieces = piecesFor(item.grams, pieceGrams)
    if (pieceGrams) item.gramsPerPiece = pieceGrams
    item.sources.sort(compareShoppingSources)
    item.needs.sort((a, b) => a.date.localeCompare(b.date))
    for (const need of item.needs) need.sources.sort(compareShoppingSources)
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
export function formatShoppingQuantity(item: Pick<ShoppingListItem, 'grams' | 'milliliters' | 'pieces'>): string {
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
