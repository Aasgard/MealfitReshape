import type { MealSlot } from '~/types/today'

export type DailyTargets = {
  calories: number
  carbohydrates: number
  protein: number
  fat: number
}

/** Objectifs journaliers fixes (kcal et grammes), en attendant qu'ils viennent du profil de l'utilisateur. */
export const DAILY_TARGETS: DailyTargets = {
  calories: 1500,
  carbohydrates: 165,
  protein: 95,
  fat: 50,
}

/** Les 4 repas du plan, avec leur part fixe de l'objectif journalier (30 / 40 / 25 / 5 %). */
export const PLANNED_MEALS: MealSlot[] = [
  { mealType: 'BREAKFAST', label: 'Petit déjeuner', targetKcal: 450 },
  { mealType: 'LUNCH', label: 'Déjeuner', targetKcal: 600 },
  { mealType: 'DINER', label: 'Dîner', targetKcal: 375 },
  { mealType: 'SNACK', label: 'Collation', targetKcal: 75 },
]

/** Lignes hors plan, affichées seulement quand elles contiennent quelque chose. */
export const OUT_OF_PLAN_MEALS: MealSlot[] = [
  { mealType: 'EXCESS', label: 'En plus', note: 'Hors plan' },
  { mealType: 'NOTCOUNT', label: 'Non compté', note: 'Hors totaux' },
]
