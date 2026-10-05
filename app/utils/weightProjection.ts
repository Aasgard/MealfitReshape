/**
 * Projection dynamique du poids, partagée par le calculateur de besoins journaliers et l'objectif du profil.
 * Modèle simplifié inspiré de Hall (2008, 2011) : la dépense est recalculée chaque jour à partir du poids courant,
 * si bien qu'à calories constantes la perte (ou la prise) ralentit jusqu'à un nouvel équilibre.
 */

export type BodySex = 'Homme' | 'Femme'

export type BodyModelInput = {
  sex: BodySex
  ageYears: number
  heightCm: number
  weightKg: number
  /** Masse grasse mesurée, en % ; `null` = estimée (Deurenberg). */
  measuredBodyFatPercent: number | null
  /** Coefficient d'activité (voir `ACTIVITY_LEVELS`). */
  pal: number
}

export type BodyModel = BodyModelInput & {
  bodyFatPercent: number
  bodyFatMeasured: boolean
  /** Katch-McArdle si la masse grasse est mesurée, sinon Mifflin-St Jeor. */
  formula: 'Katch-McArdle' | 'Mifflin-St Jeor'
  fatMassKg: number
  leanMassKg: number
}

/** Densités énergétiques de Hall (2008) : 39,5 MJ/kg de masse grasse, 7,6 MJ/kg de masse maigre. */
const FAT_ENERGY_DENSITY_KCAL_PER_KG = 9440
const LEAN_ENERGY_DENSITY_KCAL_PER_KG = 1816
/**
 * Forbes (1987) partage la variation de *masse* : dL/dF = 10,4 / F. Pour partager l'*énergie*, Hall (2007) convertit
 * la constante avec le rapport des densités : p = C / (C + F), C = 10,4 × ρL / ρF ≈ 2 kg.
 *
 * Erreur corrigée (octobre 2026) : la première version du calculateur utilisait 10,4 kg tel quel comme partage de l'énergie,
 * avec une masse maigre à 1 100 kcal/kg. Pour 21 kg de masse grasse, un tiers du déficit partait alors sur la masse
 * maigre, très peu dense : chaque kcal de déficit « coûtait » environ 2 700 kcal/kg au lieu d'environ 7 000, et la courbe
 * maigrissait deux à trois fois trop vite (82,5 → 61 kg en 6 mois à −20 %, soit −1,2 kg/sem au départ pour 534 kcal
 * de déficit ; environ 70,5 kg et −0,54 kg/sem avec la conversion de Hall).
 */
const ENERGY_PARTITION_CONSTANT_KG = 10.4 * LEAN_ENERGY_DENSITY_KCAL_PER_KG / FAT_ENERGY_DENSITY_KCAL_PER_KG

/** ~3 ans, horizon retenu par Hall pour approcher le plateau. */
export const STEADY_STATE_DAYS = 1095

/** Au-delà, une masse grasse saisie est jugée aberrante et remplacée par l'estimation. */
export const MAX_MEASURED_BODY_FAT_PERCENT = 70

/** Formule de Deurenberg et al. (1991) : estimation à partir de l'IMC, à défaut de mesure réelle. */
export function estimateBodyFatPercent(sex: BodySex, ageYears: number, heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100
  const bmi = weightKg / (heightM * heightM)
  const bf = 1.2 * bmi + 0.23 * ageYears - 10.8 * (sex === 'Homme' ? 1 : 0) - 5.4
  return Math.min(60, Math.max(5, bf))
}

export function resolveBodyModel(input: BodyModelInput): BodyModel {
  const measured = input.measuredBodyFatPercent
  const bodyFatMeasured = measured !== null && measured < MAX_MEASURED_BODY_FAT_PERCENT
  const bodyFatPercent = bodyFatMeasured ? measured : estimateBodyFatPercent(input.sex, input.ageYears, input.heightCm, input.weightKg)
  const fatMassKg = input.weightKg * (bodyFatPercent / 100)
  return {
    ...input,
    bodyFatPercent,
    bodyFatMeasured,
    formula: bodyFatMeasured ? 'Katch-McArdle' : 'Mifflin-St Jeor',
    fatMassKg,
    leanMassKg: input.weightKg - fatMassKg,
  }
}

/** Métabolisme de base pour une composition donnée (le poids et la masse maigre évoluent au fil de la projection). */
function basalMetabolicRate(model: BodyModel, weightKg: number, leanMassKg: number): number {
  if (model.formula === 'Katch-McArdle') return 370 + 21.6 * leanMassKg
  const base = 10 * weightKg + 6.25 * model.heightCm - 5 * model.ageYears
  return model.sex === 'Homme' ? base + 5 : base - 161
}

export const basalMetabolicRateAtStart = (model: BodyModel) => basalMetabolicRate(model, model.weightKg, model.leanMassKg)

/** Dépense journalière au départ. */
export const totalEnergyExpenditure = (model: BodyModel) => basalMetabolicRateAtStart(model) * model.pal

/** Part de l'écart énergétique prise sur la masse maigre (le reste sur la masse grasse). */
const leanEnergyShare = (fatMassKg: number) => ENERGY_PARTITION_CONSTANT_KG / (ENERGY_PARTITION_CONSTANT_KG + Math.max(fatMassKg, 0.1))

/** kcal par kg de poids perdu ou pris au départ : mélange de masse grasse et de masse maigre. */
function energyPerKgAtStart(model: BodyModel): number {
  const p = leanEnergyShare(model.fatMassKg)
  return 1 / ((1 - p) / FAT_ENERGY_DENSITY_KCAL_PER_KG + p / LEAN_ENERGY_DENSITY_KCAL_PER_KG)
}

/** Rythme de départ (kg/semaine, négatif = perte) obtenu en mangeant `calories` par jour. */
export const rateForCalories = (model: BodyModel, calories: number) =>
  ((calories - totalEnergyExpenditure(model)) / energyPerKgAtStart(model)) * 7

/** Poids jour par jour (index = jour, 0 = départ) en mangeant `calories` par jour, activité constante. */
export function simulateWeight(model: BodyModel, calories: number, days = STEADY_STATE_DAYS): number[] {
  const weights = [model.weightKg]
  let fm = model.fatMassKg
  let ffm = model.leanMassKg

  for (let day = 1; day <= days; day++) {
    const imbalance = calories - basalMetabolicRate(model, fm + ffm, ffm) * model.pal
    const p = leanEnergyShare(fm)
    fm = Math.max(0, fm + (imbalance * (1 - p)) / FAT_ENERGY_DENSITY_KCAL_PER_KG)
    ffm = Math.max(0, ffm + (imbalance * p) / LEAN_ENERGY_DENSITY_KCAL_PER_KG)
    weights.push(fm + ffm)
  }
  return weights
}

/** Premier jour où la projection atteint `targetKg`, ou `null` si elle plafonne avant (dans l'horizon simulé). */
export function dayReaching(weights: number[], targetKg: number): number | null {
  const start = weights[0]!
  const losing = targetKg < start
  const day = weights.findIndex(w => (losing ? w <= targetKg : w >= targetKg))
  return day === -1 ? null : day
}
