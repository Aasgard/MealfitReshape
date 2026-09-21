import type { Ingredient } from '~/types/ingredient'
import type { MenuEntry, MenuWeekEntries, MenuWeekMacroBalance } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { macrosForQuantity, type IngredientMacros } from './ingredientNutrition'
import { DAY_KEYS } from './menuWeek'
import { macrosForRecipe } from './recipeNutrition'

/** Ligne "Hors plan" du calendrier : repas hors objectif, comptés comme dérapages. */
export const EXTRA_MEAL_KEY = 'en-plus'

/** Ligne "Non compté" du calendrier : repas exclus des totaux (kcal, macros, dérapages) du bas de page. */
export const UNCOUNTED_MEAL_KEY = 'non-compte'

export interface MenuWeekSummary {
  /** Total kcal du jour, par dayKey (uniquement les jours qui ont au moins un repas). */
  dayTotals: Record<string, number>
  averageKcal: number
  overagePerDayKcal: number
  overageCount: number
  overageTotalKcal: number
  macros: MenuWeekMacroBalance
}

/** Concatène les repas de plusieurs sources, case par case, dans l'ordre des sources. */
export function mergeMenuEntries(...sources: MenuWeekEntries[]): MenuWeekEntries {
  const merged: MenuWeekEntries = {}
  for (const source of sources) {
    for (const [dayKey, meals] of Object.entries(source)) {
      for (const [mealKey, list] of Object.entries(meals)) {
        const day = merged[dayKey] ??= {}
        ;(day[mealKey] ??= []).push(...list)
      }
    }
  }
  return merged
}

/** Totaux par jour et statistiques hebdomadaires (moyennes sur 7 jours) à partir des repas affichés. */
export function summarizeMenuWeek(entries: MenuWeekEntries): MenuWeekSummary {
  const dayTotals: Record<string, number> = {}
  const macroTotals = { protein: 0, carbohydrates: 0, fat: 0 }
  let kcalTotal = 0
  let overageTotalKcal = 0
  let overageCount = 0

  for (const [dayKey, meals] of Object.entries(entries)) {
    for (const [mealKey, list] of Object.entries(meals)) {
      if (mealKey === UNCOUNTED_MEAL_KEY) continue

      for (const entry of list) {
        dayTotals[dayKey] = (dayTotals[dayKey] ?? 0) + entry.kcal
        kcalTotal += entry.kcal
        macroTotals.protein += entry.protein
        macroTotals.carbohydrates += entry.carbohydrates
        macroTotals.fat += entry.fat

        if (mealKey === EXTRA_MEAL_KEY) {
          overageTotalKcal += entry.kcal
          overageCount++
        }
      }
    }
  }

  const perDay = (value: number) => Math.round(value / DAY_KEYS.length)

  return {
    dayTotals,
    averageKcal: perDay(kcalTotal),
    overagePerDayKcal: perDay(overageTotalKcal),
    overageCount,
    overageTotalKcal,
    macros: {
      protein: perDay(macroTotals.protein),
      carbohydrates: perDay(macroTotals.carbohydrates),
      fat: perDay(macroTotals.fat),
    },
  }
}

/** Repas prêt à être placé dans une case : un `MenuEntry` dont l'identifiant est attribué à l'insertion. */
export type MenuEntryDraft = Omit<MenuEntry, 'id'>

const formatQuantity = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

function draftFromMacros(label: string, macros: IngredientMacros, extra: Partial<MenuEntryDraft> = {}): MenuEntryDraft {
  return {
    ...extra,
    label,
    kcal: Math.round(macros.calories),
    carbohydrates: Math.round(macros.carbohydrates),
    protein: Math.round(macros.protein),
    fat: Math.round(macros.fat),
  }
}

/** Repas pour `parts` parts d'une recette (une part = `persons` de la recette). */
export function buildRecipeDraft(recipe: Recipe, parts: number, ingredientsById: Map<string, Ingredient>): MenuEntryDraft {
  // macrosForRecipe divise le total par `persons` : passer persons / parts donne total * parts / persons, sans double arrondi.
  const macros = macrosForRecipe(recipe.ingredients, ingredientsById, (recipe.persons ?? 1) / parts)
  const quantityLabel = `${formatQuantity(parts)} part${parts > 1 ? 's' : ''}`
  return draftFromMacros(recipe.title, macros, { recipeId: recipe.id, quantityLabel })
}

/** Repas pour `quantity` grammes d'un ingrédient (`unitId` `null`) ou `quantity` fois l'une de ses unités ; `null` si non calculable. */
export function buildIngredientDraft(ingredient: Ingredient, unitId: string | null, quantity: number): MenuEntryDraft | null {
  const macros = macrosForQuantity(ingredient, unitId, quantity)
  if (!macros) return null

  const unitLabel = unitId == null ? undefined : ingredient.units?.[unitId]?.label
  const quantityLabel = unitLabel ? `${formatQuantity(quantity)} × ${unitLabel}` : `${formatQuantity(quantity)} g`
  return draftFromMacros(ingredient.label, macros, { quantityLabel })
}

/** Repas saisi à la main : un libellé et des macros brutes. */
export function buildManualDraft(label: string, macros: IngredientMacros): MenuEntryDraft {
  return draftFromMacros(label, macros)
}
