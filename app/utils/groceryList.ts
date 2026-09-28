import { addDays, format, startOfWeek } from 'date-fns'
import type { IngredientCategory } from '~/types/ingredientCategory'
import { formatShoppingQuantity, type ShoppingListItem } from './shoppingList'

/**
 * Page « Liste de courses » : maquette alimentée par des données d'exemple (pas encore de Firestore).
 * Les ingrédients des repas planifiés sont cumulés comme dans `buildShoppingList` (recettes entières,
 * pièces arrondies au supérieur) et gardent la trace des recettes qui les demandent.
 */

/** Rayon des articles ajoutés à la main sans catégorie du catalogue. */
export const MISC_AISLE: IngredientCategory = { id: 'misc', label: 'Divers', order: 99, icon: 'shopping-basket' }

/** Sous-ensemble des catégories du catalogue (mêmes libellés, ordre et icônes que le seed). */
const AISLES = {
  vegetables: { id: 'vegetables', label: 'Légumes', order: 1, icon: 'carrot' },
  fruits: { id: 'fruits', label: 'Fruits', order: 2, icon: 'apple' },
  legumes: { id: 'legumes', label: 'Légumineuses', order: 3, icon: 'bean' },
  cereals: { id: 'cereals_starches', label: 'Céréales & Féculents', order: 4, icon: 'wheat' },
  nuts: { id: 'nuts_seeds', label: 'Fruits secs & Graines', order: 7, icon: 'nut' },
  meat: { id: 'meat', label: 'Viandes & Œuf', order: 8, icon: 'beef' },
  seafood: { id: 'seafood', label: 'Poissons & Fruits de mer', order: 9, icon: 'fish' },
  dairy: { id: 'dairy', label: 'Produits laitiers', order: 11, icon: 'milk' },
  plant: { id: 'plant_based_alternatives', label: 'Alternatives végétales', order: 12, icon: 'leaf' },
  oils: { id: 'fats_oils', label: 'Huiles & Matières grasses', order: 13, icon: 'droplet' },
  condiments: { id: 'condiments_sauces', label: 'Condiments & Sauces', order: 15, icon: 'utensils' },
  spices: { id: 'herbs_spices', label: 'Herbes & Épices', order: 16, icon: 'sprout' },
} satisfies Record<string, IngredientCategory>

/** Rayons proposés pour un ajout manuel. */
export const MANUAL_AISLES: IngredientCategory[] = [MISC_AISLE, ...Object.values(AISLES)]

interface SampleIngredient {
  label: string
  aisle: IngredientCategory
  /** Poids d'une pièce, si l'ingrédient s'achète à la pièce. */
  gramsPerPiece?: number
}

const INGREDIENTS = {
  zucchini: { label: 'Courgette', aisle: AISLES.vegetables, gramsPerPiece: 200 },
  eggplant: { label: 'Aubergine', aisle: AISLES.vegetables, gramsPerPiece: 300 },
  pepper: { label: 'Poivron rouge', aisle: AISLES.vegetables, gramsPerPiece: 150 },
  tomato: { label: 'Tomate', aisle: AISLES.vegetables, gramsPerPiece: 120 },
  onion: { label: 'Oignon', aisle: AISLES.vegetables, gramsPerPiece: 100 },
  garlic: { label: 'Ail', aisle: AISLES.vegetables },
  broccoli: { label: 'Brocoli', aisle: AISLES.vegetables, gramsPerPiece: 400 },
  carrot: { label: 'Carotte', aisle: AISLES.vegetables, gramsPerPiece: 80 },
  spinach: { label: 'Pousses d\'épinard', aisle: AISLES.vegetables },
  banana: { label: 'Banane', aisle: AISLES.fruits, gramsPerPiece: 120 },
  lemon: { label: 'Citron', aisle: AISLES.fruits, gramsPerPiece: 100 },
  blueberries: { label: 'Myrtilles', aisle: AISLES.fruits },
  lentils: { label: 'Lentilles vertes', aisle: AISLES.legumes },
  rice: { label: 'Riz basmati', aisle: AISLES.cereals },
  oats: { label: 'Flocons d\'avoine', aisle: AISLES.cereals },
  chia: { label: 'Graines de chia', aisle: AISLES.nuts },
  chicken: { label: 'Blanc de poulet', aisle: AISLES.meat },
  salmon: { label: 'Pavé de saumon', aisle: AISLES.seafood, gramsPerPiece: 125 },
  skyr: { label: 'Skyr nature', aisle: AISLES.dairy },
  milk: { label: 'Lait demi-écrémé', aisle: AISLES.dairy },
  coconutMilk: { label: 'Lait de coco', aisle: AISLES.plant },
  oliveOil: { label: 'Huile d\'olive', aisle: AISLES.oils },
  mustard: { label: 'Moutarde à l\'ancienne', aisle: AISLES.condiments },
  soySauce: { label: 'Sauce soja', aisle: AISLES.condiments },
  curry: { label: 'Curry en poudre', aisle: AISLES.spices },
  provence: { label: 'Herbes de Provence', aisle: AISLES.spices },
  coriander: { label: 'Coriandre fraîche', aisle: AISLES.spices },
} satisfies Record<string, SampleIngredient>

type IngredientId = keyof typeof INGREDIENTS

interface SampleRecipe {
  label: string
  persons: number
  lines: { ingredientId: IngredientId, grams?: number, ml?: number }[]
}

const RECIPES = {
  ratatouille: {
    label: 'Ratatouille',
    persons: 4,
    lines: [
      { ingredientId: 'zucchini', grams: 400 }, { ingredientId: 'eggplant', grams: 300 }, { ingredientId: 'pepper', grams: 300 },
      { ingredientId: 'tomato', grams: 480 }, { ingredientId: 'onion', grams: 200 }, { ingredientId: 'garlic', grams: 10 },
      { ingredientId: 'oliveOil', ml: 30 }, { ingredientId: 'provence', grams: 5 },
    ],
  },
  curry: {
    label: 'Poulet au curry',
    persons: 4,
    lines: [
      { ingredientId: 'chicken', grams: 600 }, { ingredientId: 'coconutMilk', ml: 400 }, { ingredientId: 'onion', grams: 100 },
      { ingredientId: 'garlic', grams: 10 }, { ingredientId: 'curry', grams: 15 }, { ingredientId: 'rice', grams: 300 },
      { ingredientId: 'coriander', grams: 15 },
    ],
  },
  salmon: {
    label: 'Saumon, riz et brocoli',
    persons: 2,
    lines: [
      { ingredientId: 'salmon', grams: 250 }, { ingredientId: 'rice', grams: 150 }, { ingredientId: 'broccoli', grams: 400 },
      { ingredientId: 'lemon', grams: 100 }, { ingredientId: 'soySauce', ml: 20 },
    ],
  },
  oats: {
    label: 'Overnight oats',
    persons: 1,
    lines: [
      { ingredientId: 'oats', grams: 50 }, { ingredientId: 'milk', ml: 150 }, { ingredientId: 'chia', grams: 10 },
      { ingredientId: 'blueberries', grams: 50 },
    ],
  },
  lentils: {
    label: 'Salade de lentilles',
    persons: 3,
    lines: [
      { ingredientId: 'lentils', grams: 240 }, { ingredientId: 'carrot', grams: 160 }, { ingredientId: 'spinach', grams: 120 },
      { ingredientId: 'mustard', grams: 20 }, { ingredientId: 'oliveOil', ml: 30 },
    ],
  },
  stirFry: {
    label: 'Poêlée de légumes',
    persons: 2,
    lines: [
      { ingredientId: 'zucchini', grams: 200 }, { ingredientId: 'pepper', grams: 150 }, { ingredientId: 'carrot', grams: 160 },
      { ingredientId: 'oliveOil', ml: 15 },
    ],
  },
} satisfies Record<string, SampleRecipe>

type RecipeId = keyof typeof RECIPES

/** Un repas planifié, comme dans les menus : une recette en parts, un aliment seul, ou des macros saisies. */
export type PlannedMeal =
  | { id: string, date: string, kind: 'recipe', recipeId: RecipeId, parts: number }
  | { id: string, date: string, kind: 'ingredient', ingredientId: IngredientId, pieces?: number, grams?: number }
  | { id: string, date: string, kind: 'raw', label: string }

/** Une ligne de la colonne « Repas planifiés » : repas regroupés par recette ou aliment. */
export interface PlannedMealRow {
  key: string
  label: string
  quantityLabel: string
  /** Les macros saisies à la main n'ont pas d'ingrédients. */
  selectable: boolean
}

export interface GroceryLine {
  id: string
  label: string
  aisle: IngredientCategory
  quantityLabel: string
  /** Recettes (ou « Hors recette ») qui demandent cet ingrédient. */
  sources: string[]
  manual: boolean
  /** Quantités cumulées, pour la copie vers Todoist ; absentes pour un ajout manuel. */
  item?: ShoppingListItem
}

export interface ManualItem {
  id: string
  label: string
  aisle: IngredientCategory
}

export const plannedMealKey = (meal: PlannedMeal) => {
  switch (meal.kind) {
    case 'recipe': return `recipe:${meal.recipeId}`
    case 'ingredient': return `ingredient:${meal.ingredientId}`
    case 'raw': return `raw:${meal.label}`
  }
}

const plural = (count: number, word: string) => `${count.toLocaleString('fr-FR')} ${word}${count > 1 ? 's' : ''}`

export function groupPlannedMeals(meals: PlannedMeal[]): PlannedMealRow[] {
  const rows = new Map<string, { meal: PlannedMeal, total: number }>()
  for (const meal of meals) {
    const key = plannedMealKey(meal)
    const amount = meal.kind === 'recipe' ? meal.parts : meal.kind === 'ingredient' ? (meal.pieces ?? meal.grams ?? 0) : 1
    const row = rows.get(key)
    if (row) row.total += amount
    else rows.set(key, { meal, total: amount })
  }
  const rank = { recipe: 0, ingredient: 1, raw: 2 }
  return [...rows].map(([key, { meal, total }]) => {
    switch (meal.kind) {
      case 'recipe':
        return { key, label: RECIPES[meal.recipeId].label, quantityLabel: plural(total, 'part'), selectable: true, rank: rank.recipe }
      case 'ingredient':
        return {
          key,
          label: INGREDIENTS[meal.ingredientId].label,
          quantityLabel: meal.pieces !== undefined ? plural(total, 'pièce') : `${total.toLocaleString('fr-FR')} g`,
          selectable: true,
          rank: rank.ingredient,
        }
      case 'raw':
        return { key, label: meal.label, quantityLabel: 'Macros seules', selectable: false, rank: rank.raw }
    }
  })
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'fr'))
    .map(({ rank: _rank, ...row }) => row)
}

export const compareGroceryLines = (a: GroceryLine, b: GroceryLine) =>
  a.aisle.order - b.aisle.order || a.label.localeCompare(b.label, 'fr')

/** Cumule les ingrédients des repas : recettes entières (6 parts d'une recette de 4 = 2 recettes), pièces arrondies au supérieur. */
export function buildGeneratedLines(meals: PlannedMeal[]): { lines: GroceryLine[], skipped: string[] } {
  const totals = new Map<IngredientId, { grams: number, ml: number, sources: Set<string> }>()
  const skipped = new Set<string>()
  const partsByRecipe = new Map<RecipeId, number>()

  const add = (ingredientId: IngredientId, grams: number, ml: number, source: string) => {
    const total = totals.get(ingredientId) ?? { grams: 0, ml: 0, sources: new Set<string>() }
    total.grams += grams
    total.ml += ml
    total.sources.add(source)
    totals.set(ingredientId, total)
  }

  for (const meal of meals) {
    if (meal.kind === 'recipe') {
      partsByRecipe.set(meal.recipeId, (partsByRecipe.get(meal.recipeId) ?? 0) + meal.parts)
    }
    else if (meal.kind === 'ingredient') {
      const ingredient: SampleIngredient = INGREDIENTS[meal.ingredientId]
      const grams = meal.pieces !== undefined ? meal.pieces * (ingredient.gramsPerPiece ?? 0) : meal.grams ?? 0
      add(meal.ingredientId, grams, 0, 'Hors recette')
    }
    else {
      skipped.add(`${meal.label} (macros saisies à la main)`)
    }
  }

  for (const [recipeId, parts] of partsByRecipe) {
    const recipe: SampleRecipe = RECIPES[recipeId]
    const factor = Math.ceil(parts / recipe.persons)
    for (const line of recipe.lines) add(line.ingredientId, (line.grams ?? 0) * factor, (line.ml ?? 0) * factor, recipe.label)
  }

  const lines = [...totals].map(([ingredientId, total]): GroceryLine => {
    const ingredient: SampleIngredient = INGREDIENTS[ingredientId]
    const item: ShoppingListItem = {
      ingredientId,
      label: ingredient.label,
      category: ingredient.aisle,
      grams: total.grams,
      milliliters: total.ml,
      pieces: ingredient.gramsPerPiece && total.grams > 0 ? Math.ceil(total.grams / ingredient.gramsPerPiece - 1e-6) : undefined,
    }
    const sources = [...total.sources].sort((a, b) => (a === 'Hors recette' ? 1 : b === 'Hors recette' ? -1 : a.localeCompare(b, 'fr')))
    return {
      id: `ingredient:${ingredientId}`,
      label: ingredient.label,
      aisle: ingredient.aisle,
      quantityLabel: formatShoppingQuantity(item),
      sources,
      manual: false,
      item,
    }
  })

  return { lines: lines.sort(compareGroceryLines), skipped: [...skipped] }
}

export function manualGroceryLine(item: ManualItem): GroceryLine {
  return { id: item.id, label: item.label, aisle: item.aisle, quantityLabel: '', sources: [], manual: true }
}

// --- Semaine d'exemple ---

export function buildSamplePlannedMeals(today = new Date()): PlannedMeal[] {
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  const day = (offset: number) => format(addDays(monday, offset), 'yyyy-MM-dd')
  const meals: PlannedMeal[] = []
  let n = 0
  const recipe = (offset: number, recipeId: RecipeId, parts: number) =>
    meals.push({ id: `meal-${n++}`, date: day(offset), kind: 'recipe', recipeId, parts })

  recipe(0, 'ratatouille', 2)
  recipe(1, 'ratatouille', 2)
  recipe(2, 'curry', 2)
  recipe(3, 'curry', 2)
  recipe(4, 'salmon', 2)
  recipe(1, 'lentils', 1)
  recipe(2, 'lentils', 1)
  recipe(5, 'lentils', 1)
  recipe(6, 'stirFry', 2)
  for (let d = 0; d < 5; d++) {
    recipe(d, 'oats', 1)
    meals.push({ id: `meal-${n++}`, date: day(d), kind: 'ingredient', ingredientId: 'banana', pieces: 1 })
    meals.push({ id: `meal-${n++}`, date: day(d), kind: 'ingredient', ingredientId: 'skyr', grams: 150 })
  }
  meals.push({ id: `meal-${n++}`, date: day(1), kind: 'raw', label: 'Barre protéinée' })
  meals.push({ id: `meal-${n++}`, date: day(3), kind: 'raw', label: 'Barre protéinée' })
  return meals
}

export const SAMPLE_MANUAL_ITEMS: ManualItem[] = [
  { id: 'manual-sponges', label: 'Éponges', aisle: MISC_AISLE },
  { id: 'manual-coffee', label: 'Café moulu', aisle: MISC_AISLE },
  { id: 'manual-baking-paper', label: 'Papier cuisson', aisle: MISC_AISLE },
  { id: 'manual-detergent', label: 'Lessive', aisle: MISC_AISLE },
]

/** Ingrédients souvent déjà dans les placards, pour l'exemple. */
export const SAMPLE_AT_HOME = ['ingredient:oliveOil', 'ingredient:provence']
export const SAMPLE_AT_HOME_IN_PROGRESS = [...SAMPLE_AT_HOME, 'ingredient:curry', 'ingredient:soySauce']
/** Courses à moitié faites : fruits terminés, une partie des légumes et du frais dans le panier. */
export const SAMPLE_IN_CART = [
  'ingredient:banana', 'ingredient:lemon', 'ingredient:blueberries',
  'ingredient:zucchini', 'ingredient:eggplant', 'ingredient:tomato', 'ingredient:onion', 'ingredient:garlic',
  'ingredient:rice', 'ingredient:oats', 'ingredient:lentils', 'manual-coffee',
]
