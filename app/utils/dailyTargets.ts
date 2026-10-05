import type { MealSlot } from '~/types/today'

export type DailyTargets = {
  calories: number
  carbohydrates: number
  protein: number
  fat: number
}

/** Part des kcal apportée par les lipides dans la répartition par défaut. */
const FAT_KCAL_SHARE = 0.25

/**
 * Répartition simple des macros (calculateur et objectif du profil) : protéines fixées par le g/kg choisi,
 * lipides 25 % des kcal, glucides le reste.
 */
export function splitMacros(calories: number, proteinGrams: number): DailyTargets {
  const fatKcal = calories * FAT_KCAL_SHARE
  return {
    calories,
    carbohydrates: Math.max(0, calories - proteinGrams * 4 - fatKcal) / 4,
    protein: proteinGrams,
    fat: fatKcal / 9,
  }
}

/** Objectifs journaliers fixes (kcal et grammes), en attendant qu'ils viennent du profil de l'utilisateur. */
export const DAILY_TARGETS: DailyTargets = {
  calories: 1531,
  carbohydrates: 188,
  protein: 99,
  fat: 43,
}

/**
 * Part fixe de l'objectif journalier par repas (30 / 40 / 30 %), en attendant qu'elle vienne des réglages.
 * La collation n'a pas d'objectif : elle compte dans le total du jour, sans anneau.
 */
export const MEAL_KCAL_SHARES: { mealType: 'BREAKFAST' | 'LUNCH' | 'DINER', label: string, share: number }[] = [
  { mealType: 'BREAKFAST', label: 'Petit déjeuner', share: 0.3 },
  { mealType: 'LUNCH', label: 'Déjeuner', share: 0.4 },
  { mealType: 'DINER', label: 'Dîner', share: 0.3 },
]

/** Les 4 repas du plan, avec leur part de l'objectif journalier (voir `MEAL_KCAL_SHARES`). */
export const PLANNED_MEALS: MealSlot[] = [
  ...MEAL_KCAL_SHARES.map(({ mealType, label, share }) => ({ mealType, label, targetKcal: Math.round(DAILY_TARGETS.calories * share) })),
  { mealType: 'SNACK', label: 'Collation' },
]

/** Lignes hors plan, affichées seulement quand elles contiennent quelque chose. */
export const OUT_OF_PLAN_MEALS: MealSlot[] = [
  { mealType: 'EXCESS', label: 'En plus', note: 'Hors plan' },
  { mealType: 'NOTCOUNT', label: 'Non compté', note: 'Hors totaux' },
]

/** Marge autour de l'objectif d'un repas dans laquelle il est considéré comme atteint. */
export const MEAL_TARGET_TOLERANCE = 0.1
/** Marge autour des objectifs de la journée (kcal et macros), plus stricte que celle d'un repas. */
export const DAILY_TARGET_TOLERANCE = 0.05

/** Non atteint (sous la cible − tolérance), atteint (± tolérance) ou dépassé (au-delà de la cible + tolérance). */
export type TargetStatus = 'under' | 'reached' | 'over'

export function targetStatus(value: number, target: number, tolerance: number): TargetStatus {
  if (value < target * (1 - tolerance)) return 'under'
  if (value > target * (1 + tolerance)) return 'over'
  return 'reached'
}

/** Couleur d'un statut : bleu (non atteint), vert (atteint), orange (dépassé). */
export const TARGET_STATUS_COLOR: Record<TargetStatus, string> = {
  under: 'var(--ui-info)',
  reached: 'var(--ui-success)',
  over: 'var(--ui-warning)',
}

export const TARGET_STATUS_TEXT_CLASS: Record<TargetStatus, string> = {
  under: 'text-info',
  reached: 'text-success',
  over: 'text-warning',
}
