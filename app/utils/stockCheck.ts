import type { Meal } from '~/types/meal'
import type { ShoppingItem, ShoppingMealInclusion } from '~/types/shoppingList'
import { plannedMealKey } from './plannedMealRows'
import { gramsPerPiece, ingredientAmount, mealDay, OUTSIDE_RECIPE_SOURCE, piecesFor, recipeBatches } from './shoppingList'
import type { ShoppingCatalog } from './shoppingPlan'

/**
 * « Vérifier un article » : ce que les repas planifiés vont encore consommer d'un ingrédient, d'aujourd'hui à la fin de
 * la période, comparé à ce qu'on en a. Calcul ponctuel : ni le stock saisi ni les lignes écartées ne sont enregistrés.
 */

/** D'où vient un besoin : déjà couvert par des courses, dans la liste à acheter, ou pas encore passé par la liste. */
export type StockNeedOrigin = 'bought' | 'listed' | 'unlisted'

/** Ce qu'une recette (le jour où elle se cuisine) ou un aliment seul (le jour du repas) demande d'un ingrédient. */
export interface StockNeedEntry {
  /** Regroupement et jour : `recipe:<id>|<jour>`, `ingredient:<id>:<unité>|<jour>`. */
  id: string
  /** Jour au format `yyyy-MM-dd`. */
  date: string
  /** Titre de la recette, ou « Hors recette ». */
  label: string
  kind: 'recipe' | 'ingredient'
  grams: number
  milliliters: number
  origin: StockNeedOrigin
}

/** Un ingrédient demandé par les repas de la période, avec ses besoins par date croissante. */
export interface StockNeedIngredient {
  ingredientId: string
  label: string
  /** Poids d'une pièce, si l'ingrédient a une unité « Pièce » : le stock se compte alors en pièces. */
  gramsPerPiece?: number
  entries: StockNeedEntry[]
}

/** Le moins couvert l'emporte : un besoin en partie pas listé reste à vérifier. */
const ORIGIN_RANK: Record<StockNeedOrigin, number> = { unlisted: 0, listed: 1, bought: 2 }
const weakest = (a: StockNeedOrigin, b: StockNeedOrigin) => (ORIGIN_RANK[a] <= ORIGIN_RANK[b] ? a : b)

/**
 * Besoins des repas `meals` du `days.start` au `days.end` (bornes comprises), par ingrédient, par ordre alphabétique.
 * Une recette compte en entier le jour où sa fournée se cuisine (mêmes fournées que la liste de courses, parts
 * retenues dans la liste comprises) : `meals` doit remonter avant `days.start`, pour qu'une fournée cuisinée hier ne
 * soit pas comptée aujourd'hui. Les repas du stock et les macros saisies à la main ne consomment rien.
 */
export function stockNeeds(
  meals: Meal[],
  inclusionByMealId: Map<string, ShoppingMealInclusion>,
  catalog: ShoppingCatalog,
  days: { start: string, end: string },
): { ingredients: StockNeedIngredient[], skipped: string[] } {
  const byId = new Map<string, StockNeedIngredient>()
  const skipped = new Set<string>()
  const inDays = (date: string) => date >= days.start && date <= days.end
  const originOf = (mealId: string): StockNeedOrigin => {
    const state = inclusionByMealId.get(mealId)?.state
    return state === 'bought' ? 'bought' : state === 'listed' ? 'listed' : 'unlisted'
  }

  const add = (ingredientId: string, unitId: string | null, quantity: number, entry: Omit<StockNeedEntry, 'grams' | 'milliliters'>) => {
    const ingredient = catalog.ingredientsById.get(ingredientId)
    if (!ingredient || quantity <= 0) return
    const amount = ingredientAmount(ingredient, unitId, quantity)
    if (!amount) {
      skipped.add(`${ingredient.label} (unité introuvable)`)
      return
    }
    let item = byId.get(ingredientId)
    if (!item) {
      const pieceGrams = gramsPerPiece(ingredient)
      item = { ingredientId, label: ingredient.label, ...(pieceGrams ? { gramsPerPiece: pieceGrams } : {}), entries: [] }
      byId.set(ingredientId, item)
    }
    const same = item.entries.find(e => e.id === entry.id)
    if (same) {
      same.grams += amount.grams
      same.milliliters += amount.milliliters
      same.origin = weakest(same.origin, entry.origin)
    }
    else {
      item.entries.push({ ...entry, ...amount })
    }
  }

  const portionsByRecipeId = new Map<string, { id: string, date: string, parts: number }[]>()
  for (const meal of meals) {
    if (meal.category === 'RECIPE') {
      const parts = inclusionByMealId.get(meal.id)?.parts ?? meal.value
      portionsByRecipeId.set(meal.recipeId, [...(portionsByRecipeId.get(meal.recipeId) ?? []), { id: meal.id, date: mealDay(meal), parts }])
    }
    else if (meal.category === 'INGREDIENT') {
      const date = mealDay(meal)
      if (!inDays(date)) continue
      add(meal.ingredientId, meal.unitId ?? null, meal.quantity, {
        id: `${plannedMealKey(meal)}|${date}`,
        date,
        label: OUTSIDE_RECIPE_SOURCE,
        kind: 'ingredient',
        origin: originOf(meal.id),
      })
    }
  }

  for (const [recipeId, portions] of portionsByRecipeId) {
    const recipe = catalog.recipesById.get(recipeId)
    if (!recipe) {
      skipped.add('Recette introuvable')
      continue
    }
    const persons = recipe.persons && recipe.persons > 0 ? recipe.persons : 1
    for (const batch of recipeBatches(portions, persons)) {
      if (!inDays(batch.day)) continue
      const origins = batch.covers.map(originOf)
      // Une fournée s'achète en entier : un repas acheté suffit à la couvrir.
      const origin: StockNeedOrigin = origins.includes('bought') ? 'bought' : origins.includes('listed') ? 'listed' : 'unlisted'
      for (const line of recipe.ingredients ?? []) {
        if (!line.ingredientRef) continue
        add(line.ingredientRef.id, line.unit ?? null, line.quantity, {
          id: `recipe:${recipeId}|${batch.day}`,
          date: batch.day,
          label: recipe.title,
          kind: 'recipe',
          origin,
        })
      }
    }
  }

  const ingredients = [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  for (const item of ingredients) {
    item.entries.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'fr'))
  }
  return { ingredients, skipped: [...skipped] }
}

/**
 * Ce que la liste prévoit déjà d'acheter de l'ingrédient pour la période : apports des articles à acheter ou dans le
 * panier (pas ceux « déjà à la maison » : ils font partie de ce qu'on a), et compléments ajoutés.
 */
export function toBuyFor(items: ShoppingItem[], ingredientId: string, days: { start: string, end: string }) {
  let grams = 0
  let milliliters = 0
  for (const item of items) {
    if (item.status === 'atHome') continue
    if (item.ingredientId === ingredientId) {
      for (const c of item.contributions ?? []) {
        if (c.date < days.start || c.date > days.end) continue
        grams += c.grams
        milliliters += c.milliliters
      }
    }
    else if (item.complementOf?.ingredientId === ingredientId) {
      grams += item.complementOf.grams
      milliliters += item.complementOf.milliliters
    }
  }
  return { grams, milliliters }
}

/**
 * Unité de comparaison : les pièces si l'ingrédient en a, sinon les grammes ; les ml seulement s'il n'est demandé
 * qu'en ml (unité sans densité).
 */
export type StockUnit = 'piece' | 'g' | 'ml'

/** Un jour du registre, ce qu'il prend et ce qu'il en reste après lui. */
export interface StockCheckDay {
  date: string
  entries: StockNeedEntry[]
  /** Besoin du jour (lignes écartées non comptées), dans l'unité de base (g, ou ml). */
  amount: number
  /** Reste après ce jour, si le stock est saisi ; négatif quand il ne suffit plus. */
  remaining: number | null
}

export interface StockCheck {
  unit: StockUnit
  /** Besoin total compté, dans l'unité de base : grammes (pièces comprises) ou ml. */
  need: number
  /** Quantités en ml d'un ingrédient compté en grammes, faute de densité : affichées à part, hors calcul. */
  uncountedMilliliters: number
  /** Déjà prévu dans la liste, dans l'unité de base. */
  toBuy: number
  days: StockCheckDay[]
  /** Premier jour que le stock saisi ne couvre plus. */
  runOutDate: string | null
  /** Ce qu'il faudra en plus de ce qu'on a et de ce qui est déjà à acheter, dans l'unité de base. */
  missing: number
}

const EPSILON = 1e-6

export function stockUnitOf(ingredient: StockNeedIngredient): StockUnit {
  const grams = ingredient.entries.reduce((sum, e) => sum + e.grams, 0)
  if (grams <= EPSILON && ingredient.entries.some(e => e.milliliters > EPSILON)) return 'ml'
  return ingredient.gramsPerPiece ? 'piece' : 'g'
}

/**
 * Compare les besoins de l'ingrédient à `have` (unité de base, `null` tant que rien n'est saisi) : reste jour par jour,
 * jour où ça ne suffit plus, et manque une fois retiré ce que la liste prévoit déjà (`toBuy`, en grammes et ml).
 * `excluded` : lignes écartées (déjà cuisiné ou mangé aujourd'hui).
 */
export function checkStock(
  ingredient: StockNeedIngredient,
  excluded: ReadonlySet<string>,
  have: number | null,
  toBuy: { grams: number, milliliters: number },
): StockCheck {
  const unit = stockUnitOf(ingredient)
  const base = (e: { grams: number, milliliters: number }) => (unit === 'ml' ? e.milliliters : e.grams)
  const counted = ingredient.entries.filter(e => !excluded.has(e.id))

  const days: StockCheckDay[] = []
  let need = 0
  let runOutDate: string | null = null
  for (const entry of ingredient.entries) {
    let day = days.at(-1)
    if (day?.date !== entry.date) {
      day = { date: entry.date, entries: [], amount: 0, remaining: null }
      days.push(day)
    }
    day.entries.push(entry)
  }
  for (const day of days) {
    day.amount = day.entries.filter(e => !excluded.has(e.id)).reduce((sum, e) => sum + base(e), 0)
    need += day.amount
    if (have == null) continue
    day.remaining = have - need
    if (runOutDate == null && day.remaining < -EPSILON) runOutDate = day.date
  }

  const plannedToBuy = base(toBuy)
  const missing = have == null ? 0 : Math.max(0, need - have - plannedToBuy)
  return {
    unit,
    need,
    uncountedMilliliters: unit === 'ml' ? 0 : counted.reduce((sum, e) => sum + e.milliliters, 0),
    toBuy: plannedToBuy,
    days,
    runOutDate,
    missing: missing > EPSILON ? missing : 0,
  }
}

const formatNumber = (n: number, maximumFractionDigits = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits })

/**
 * Quantité dans l'unité de comparaison : "350 g", "1,25 kg", "200 ml", "3 pièces". `up` arrondit au supérieur (ce
 * qu'il faut), `nearest` au plus proche (ce qu'il reste, à la demi-pièce près).
 */
export function formatStockAmount(value: number, unit: StockUnit, pieceGrams?: number, rounding: 'up' | 'nearest' = 'up'): string {
  if (unit === 'piece' && pieceGrams) {
    const pieces = rounding === 'up' ? piecesFor(value, pieceGrams) : Math.round(value / pieceGrams * 2) / 2
    return `${formatNumber(pieces, 1)} pièce${Math.abs(pieces) > 1 ? 's' : ''}`
  }
  const symbol = unit === 'ml' ? 'ml' : 'g'
  const rounded = rounding === 'up' ? Math.ceil(value - EPSILON) : Math.round(value)
  if (Math.abs(rounded) < 1000) return `${formatNumber(rounded)} ${symbol}`
  return `${formatNumber(rounded / 1000, 2)} ${symbol === 'g' ? 'kg' : 'l'}`
}

/** Saisie « J'en ai » ("300", "1,5") dans l'unité de comparaison, ramenée à l'unité de base ; `null` si vide ou invalide. */
export function parseStockInput(text: string, unit: StockUnit, pieceGrams?: number): number | null {
  const value = Number(text.trim().replace(',', '.'))
  if (!text.trim() || !Number.isFinite(value) || value < 0) return null
  return unit === 'piece' && pieceGrams ? value * pieceGrams : value
}
