import type { TargetStatus } from './dailyTargets'

/**
 * Référence nutritionnelle en calcium (ANSES, mg/jour), selon l'âge : 1 150 mg de 11 à 17 ans, 1 000 mg de 18 à 24 ans,
 * 950 mg à partir de 25 ans. Les références sont les mêmes pour les deux sexes ; sans date de naissance, celle d'un adulte.
 */
export function calciumReference(ageYears: number | null): number {
  if (ageYears == null) return 950
  if (ageYears < 18) return 1150
  if (ageYears < 25) return 1000
  return 950
}

/** Limite supérieure de sécurité (EFSA, adulte) : au-delà seulement, un apport élevé est signalé. */
export const CALCIUM_UPPER_LIMIT = 2500

/**
 * Bleu sous l'objectif (moins la tolérance), vert ensuite : dépasser l'objectif de calcium n'est pas un écart. Orange
 * seulement au-delà de la limite supérieure.
 */
export function calciumStatus(value: number, target: number, tolerance: number): TargetStatus {
  if (value > CALCIUM_UPPER_LIMIT) return 'over'
  return value < target * (1 - tolerance) ? 'under' : 'reached'
}
