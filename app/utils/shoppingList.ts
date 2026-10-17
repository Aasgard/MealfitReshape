import { format } from 'date-fns'
import type { Ingredient } from '~/types/ingredient'
import type { Meal } from '~/types/meal'
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

/** Source d'un ingrédient mangé seul, hors de toute recette. */
export const OUTSIDE_RECIPE_SOURCE = 'Hors recette'

/** Recettes par ordre alphabétique, « Hors recette » en dernier. */
export const compareShoppingSources = (a: string, b: string) =>
  a === OUTSIDE_RECIPE_SOURCE ? 1 : b === OUTSIDE_RECIPE_SOURCE ? -1 : a.localeCompare(b, 'fr')

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
const formatNumber = (n: number, maximumFractionDigits = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits })

/** "350 g", "1,25 kg", "200 ml", "1,5 l" ; arrondi au supérieur pour ne pas en acheter trop peu. */
function formatAmount(value: number, unit: 'g' | 'ml'): string {
  const rounded = Math.ceil(value)
  if (rounded < 1000) return `${formatNumber(rounded)} ${unit}`
  return `${formatNumber(rounded / 1000, 2)} ${unit === 'g' ? 'kg' : 'l'}`
}

/** Quantité affichée d'un ingrédient, ex. "350 g", "350 g + 200 ml" ou "4 pièces (600 g)" s'il a une unité « Pièce ». */
export function formatShoppingQuantity(item: { grams: number, milliliters: number, pieces?: number }): string {
  const amount = [
    item.grams > 0 ? formatAmount(item.grams, 'g') : null,
    item.milliliters > 0 ? formatAmount(item.milliliters, 'ml') : null,
  ].filter(Boolean).join(' + ')
  if (!item.pieces) return amount
  return `${item.pieces} pièce${item.pieces > 1 ? 's' : ''} (${amount})`
}
