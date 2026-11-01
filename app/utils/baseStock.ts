import type { BaseStock } from '~/types/baseStock'
import type { Ingredient } from '~/types/ingredient'
import type { Meal } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import { baseGrams, plannedBases } from './mealBaseAdjustments'
import { MENU_MEAL_TYPES } from './menuEntries'
import { mealDay } from './shoppingList'

/** En dessous, deux quantités en grammes sont égales. */
export const GRAMS_EPSILON = 0.5

/**
 * Grammes de chaque base qu'un repas mange : ce que la recette prévoit pour ses parts, remplacé par la quantité saisie
 * sur le repas quand elle a été ajustée (ou ajoutée). Seules les bases directement dans la recette comptent : une base
 * dans une base est déjà dans le bocal de celle-ci.
 */
export function mealBaseNeeds(meal: Meal, recipesById: Map<string, Recipe>, ingredientsById: Map<string, Ingredient>): Map<string, number> {
  const needs = new Map<string, number>()
  if (meal.category !== 'RECIPE') return needs
  const recipe = recipesById.get(meal.recipeId)
  if (!recipe) return needs
  for (const planned of plannedBases(recipe, meal.value)) {
    let grams = 0
    for (const line of planned.lines) grams += baseGrams(planned.recipeId, line.unit, line.quantity, ingredientsById) ?? 0
    needs.set(planned.recipeId, grams)
  }
  for (const adjustment of meal.baseAdjustments ?? []) {
    needs.set(adjustment.recipeId, baseGrams(adjustment.recipeId, adjustment.unit, adjustment.quantity, ingredientsById) ?? 0)
  }
  for (const [id, grams] of needs) if (grams < GRAMS_EPSILON) needs.delete(id)
  return needs
}

/** Où en est un bocal : ce qu'en ont pris les repas passés, ce que réservent ceux d'aujourd'hui et des jours suivants. */
export interface BaseStockState {
  stock: BaseStock
  /** Grammes mangés par les repas des jours passés (depuis le comptage). */
  consumed: number
  /** Grammes réservés par les repas d'aujourd'hui et des jours suivants. */
  reserved: number
  /** Ce qu'il reste dans le bocal aujourd'hui : comptage moins consommé. */
  remaining: number
  /** Ce qui reste une fois les réservations servies. */
  free: number
}

/** Besoin d'une base pour un repas, et la part que le stock couvre. */
export interface MealBaseCoverage {
  need: number
  covered: number
}

export interface BaseStockLedger {
  states: Map<string, BaseStockState>
  /** Par repas (id), par base (id de recette). */
  coverage: Map<string, Map<string, MealBaseCoverage>>
}

const mealTypeRank = (meal: Meal) => MENU_MEAL_TYPES.findIndex(row => row.key === meal.mealType)

/**
 * Répartit les bases mangées par les repas (`meals` : ceux du foyer, du plus ancien comptage jusqu'à l'horizon voulu)
 * entre les bocaux du stock : dans l'ordre des repas, chacun puise d'abord dans le bocal compté le plus tôt, parmi ceux
 * déjà comptés le jour du repas. Un repas des jours passés consomme ; un repas d'aujourd'hui ou plus tard réserve.
 */
export function baseStockLedger(
  stocks: BaseStock[],
  meals: Meal[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
  todayKey: string,
): BaseStockLedger {
  const states = new Map<string, BaseStockState>(stocks.map(stock => [stock.id, {
    stock,
    consumed: 0,
    reserved: 0,
    remaining: stock.grams,
    free: stock.grams,
  }]))
  const left = new Map(stocks.map(stock => [stock.id, stock.grams]))
  const byBase = new Map<string, BaseStock[]>()
  for (const stock of [...stocks].sort((a, b) => a.countedOn.localeCompare(b.countedOn) || a.preparedOn.localeCompare(b.preparedOn))) {
    byBase.set(stock.recipeId, [...(byBase.get(stock.recipeId) ?? []), stock])
  }

  const coverage = new Map<string, Map<string, MealBaseCoverage>>()
  const ordered = [...meals].sort((a, b) => a.date.toMillis() - b.date.toMillis()
    || mealTypeRank(a) - mealTypeRank(b)
    || (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))

  for (const meal of ordered) {
    const needs = mealBaseNeeds(meal, recipesById, ingredientsById)
    if (!needs.size) continue
    const day = mealDay(meal)
    const forMeal = new Map<string, MealBaseCoverage>()
    for (const [baseId, need] of needs) {
      let toCover = need
      for (const stock of byBase.get(baseId) ?? []) {
        if (toCover < GRAMS_EPSILON) break
        if (stock.countedOn > day) continue
        const available = left.get(stock.id) ?? 0
        if (available < GRAMS_EPSILON) continue
        const taken = Math.min(available, toCover)
        left.set(stock.id, available - taken)
        toCover -= taken
        const state = states.get(stock.id)!
        if (day < todayKey) state.consumed += taken
        else state.reserved += taken
      }
      forMeal.set(baseId, { need, covered: need - Math.max(0, toCover) })
    }
    coverage.set(meal.id, forMeal)
  }

  for (const state of states.values()) {
    state.remaining = Math.max(0, state.stock.grams - state.consumed)
    state.free = Math.max(0, state.remaining - state.reserved)
  }
  return { states, coverage }
}

const formatNumber = (n: number) => Math.round(n).toLocaleString('fr-FR')

/** "420 g". */
export const formatBaseGrams = (grams: number) => `${formatNumber(grams)} g`
