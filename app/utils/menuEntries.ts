import type { MenuWeekEntries, MenuWeekMacroBalance } from '~/types/menu'
import { DAY_KEYS } from './menuWeek'

/** Ligne "Hors plan" du calendrier : repas hors objectif, comptés comme dérapages. */
export const EXTRA_MEAL_KEY = 'en-plus'

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
