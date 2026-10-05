import { differenceInYears, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { ActivityKey, SexKey, UserBody, UserGoal, UserTargets } from '~/types/user'
import type { DailyTargets } from './dailyTargets'
import { dayReaching, rateForCalories, resolveBodyModel, simulateWeight, totalEnergyExpenditure, type BodyModel } from './weightProjection'
import type { WeightGoal } from './weightTrend'
import { MANUAL_AISLES } from './groceryList'
import { MEASUREMENT_ZONES, type MeasurementZoneKey } from './measurements'

/**
 * Profil et réglages. La fiche corporelle, l'objectif et la fiche de besoins sont enregistrés dans Firestore
 * (`users/{uid}.body`, `.goal` et `.targets`, voir `useProfile`) ; les réglages restent une maquette en mémoire.
 * Les niveaux d'activité, les pourcentages de déficit / surplus et les niveaux de protéines sont partagés avec le
 * calculateur de besoins journaliers, pour que « Définir comme objectif » et le préremplissage passent d'une page à l'autre.
 */

// --- Profil ---

export type Sex = 'Homme' | 'Femme'
export const SEXES: Sex[] = ['Homme', 'Femme']

/** Valeur stockée côté Firestore pour chaque sexe. */
export const SEX_KEYS: Record<Sex, SexKey> = { Homme: 'male', Femme: 'female' }

export interface ActivityLevel {
  /** Valeur stockée côté Firestore : le libellé peut changer sans casser les fiches enregistrées. */
  key: ActivityKey
  /** Libellé complet, identique à l'option du calculateur. */
  label: string
  short: string
  detail: string
  /**
   * Coefficient d'activité habituellement associé à Mifflin-St Jeor (et Katch-McArdle), repris par la plupart des calculateurs.
   * Les PAL de la WHO/FAO/UNU (1,4 à 2,4) supposent un autre calcul du métabolisme de base : les combiner gonflait le maintien.
   */
  pal: number
}

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  { key: 'sedentary', label: 'Sédentaire (peu ou pas d\'exercice)', short: 'Sédentaire', detail: 'Peu ou pas d\'exercice', pal: 1.2 },
  { key: 'light', label: 'Légèrement actif (exercice léger 1-3 j/semaine)', short: 'Légèrement actif', detail: 'Exercice léger 1 à 3 j/semaine', pal: 1.375 },
  { key: 'moderate', label: 'Modérément actif (exercice 3-5 j/semaine)', short: 'Modérément actif', detail: 'Exercice 3 à 5 j/semaine', pal: 1.55 },
  { key: 'very', label: 'Très actif (exercice intense 6-7 j/semaine)', short: 'Très actif', detail: 'Exercice intense 6 à 7 j/semaine', pal: 1.725 },
  { key: 'extreme', label: 'Extrêmement actif (travail physique + sport)', short: 'Extrêmement actif', detail: 'Travail physique + sport', pal: 1.9 },
]

/** Coefficient d'activité d'un libellé (celui du calculateur et du profil) ; sédentaire à défaut. */
export const activityPal = (label: string) => ACTIVITY_LEVELS.find(level => level.label === label)?.pal ?? 1.2

export type GoalDirection = 'loss' | 'maintain' | 'gain'

export const GOAL_DIRECTIONS: { value: GoalDirection, label: string, icon: string }[] = [
  { value: 'loss', label: 'Perte', icon: 'i-lucide-trending-down' },
  { value: 'maintain', label: 'Maintien', icon: 'i-lucide-equal' },
  { value: 'gain', label: 'Prise', icon: 'i-lucide-trending-up' },
]

/** Déficits (perte) et surplus (prise) proposés, en % de la dépense journalière (valeur absolue ; le sens vient de l'objectif). */
export const GOAL_CALORIE_PERCENTS: Record<Exclude<GoalDirection, 'maintain'>, number[]> = {
  loss: [10, 15, 20, 25],
  gain: [10, 15],
}

/** Valeur de départ pour chaque sens, la même que le calculateur de besoins journaliers (−20 % / +15 %). */
export const GOAL_DEFAULT_CALORIE_PERCENT: Record<Exclude<GoalDirection, 'maintain'>, number> = {
  loss: 20,
  gain: 15,
}

/** Bornes d'un déficit ou surplus saisi à la main, en % de la dépense (valeur absolue). */
export const GOAL_CALORIE_PERCENT_LIMITS: Record<Exclude<GoalDirection, 'maintain'>, { min: number, max: number }> = {
  loss: { min: 1, max: 35 },
  gain: { min: 1, max: 25 },
}

export interface ProteinLevel {
  /** Valeur stockée côté Firestore (`users.goal.proteinPerKg`). */
  gramsPerKg: number
  label: string
}

// 0,8 : référence nutritionnelle adulte (EFSA, ANSES). 1,2 : apport souvent retenu en restriction calorique pour limiter la perte
// de masse maigre. 1,6 : plateau de la méta-analyse de Morton et al. (2018) sur le gain de masse maigre en musculation.
// 2,0 : haut de la fourchette ISSN (Jäger et al., 2017 : 1,4-2,0 g/kg chez les sportifs), utile en déficit.
/** Apport en protéines, en g par kg de poids de corps, selon la pratique sportive (profil et calculateur). */
export const PROTEIN_LEVELS: ProteinLevel[] = [
  { gramsPerKg: 0.8, label: 'Peu ou pas de sport' },
  { gramsPerKg: 1.2, label: 'Perte de poids sans musculation' },
  { gramsPerKg: 1.6, label: 'Sport régulier ou musculation' },
  { gramsPerKg: 2, label: 'Musculation en déficit calorique' },
]

export const DEFAULT_PROTEIN_PER_KG = 1.6

/** « 1,6 g/kg » (toujours une décimale, comme « 2,0 g/kg »). */
export const formatProteinPerKg = (gramsPerKg: number) =>
  `${gramsPerKg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g/kg`

/** Options de liste déroulante, identiques dans le profil et le calculateur (« 1,6 g/kg · Sport régulier ou musculation »). */
export const PROTEIN_LEVEL_ITEMS = PROTEIN_LEVELS.map(level => ({
  label: `${formatProteinPerKg(level.gramsPerKg)} · ${level.label}`,
  value: level.gramsPerKg,
}))

export type ProteinBasis = UserGoal['proteinBasis']

/** Poids auquel appliquer les g/kg (profil et calculateur) : en surpoids, le poids visé évite de surestimer le besoin. */
export const PROTEIN_BASES: { value: ProteinBasis, label: string }[] = [
  { value: 'current', label: 'Poids actuel' },
  { value: 'target', label: 'Poids visé' },
]

/** Poids de référence des protéines ; le poids visé n'a de sens qu'avec un objectif de perte ou de prise. */
export function proteinBasisWeightKg(goal: Pick<ProfileGoal, 'direction' | 'targetWeightKg' | 'proteinBasis'>, currentKg: number | null): number | null {
  return goal.proteinBasis === 'target' && goal.direction !== 'maintain' && goal.targetWeightKg !== null ? goal.targetWeightKg : currentKg
}

/** Pourcentage à garder en passant au sens `direction` : l'actuel s'il y est proposé, sinon celui par défaut. */
export function percentForDirection(direction: Exclude<GoalDirection, 'maintain'>, current: number): number {
  return GOAL_CALORIE_PERCENTS[direction].includes(current) ? current : GOAL_DEFAULT_CALORIE_PERCENT[direction]
}

/** Calories par jour pour un objectif : dépense ∓ le pourcentage choisi. */
export function goalCalories(expenditureKcal: number, goal: Pick<ProfileGoal, 'direction' | 'calorieDeltaPercent'>): number {
  if (goal.direction === 'maintain') return expenditureKcal
  const sign = goal.direction === 'loss' ? -1 : 1
  return expenditureKcal * (1 + (sign * goal.calorieDeltaPercent) / 100)
}

export interface BodyProfile {
  sex: Sex
  /** Format `yyyy-MM-dd`. */
  birthDate: string | null
  heightCm: number | null
  /** Utilisé seulement quand le suivi de poids n'a aucune pesée. */
  manualWeightKg: number | null
  bodyFatPercent: number | null
  activity: string
}

export interface ProfileGoal {
  direction: GoalDirection
  targetWeightKg: number | null
  /** Déficit ou surplus en % de la dépense, valeur absolue (voir `UserGoal`). */
  calorieDeltaPercent: number
  /** Protéines visées, en g par kg de poids de corps (une valeur de `PROTEIN_LEVELS`). */
  proteinPerKg: number
  /** Poids auquel appliquer `proteinPerKg` (voir `PROTEIN_BASES`). */
  proteinBasis: ProteinBasis
  /** Point de départ de l'objectif (voir `UserGoal`), format `yyyy-MM-dd`. */
  startDate: string | null
  startWeightKg: number | null
}

export interface ProfileTargets extends DailyTargets {
  source: UserTargets['source']
  /** Format `yyyy-MM-dd`. */
  updatedAt: string
}

/** Fiche de besoins stockée → fiche de l'app, datée de `updatedAt` (son enregistrement). */
export function targetsFromStored(stored: Partial<UserTargets>, updatedAt: Date): ProfileTargets {
  return {
    calories: finiteOrNull(stored.calories) ?? 0,
    carbohydrates: finiteOrNull(stored.carbohydrates) ?? 0,
    protein: finiteOrNull(stored.protein) ?? 0,
    fat: finiteOrNull(stored.fat) ?? 0,
    source: stored.source === 'profile' || stored.source === 'calculator' ? stored.source : 'manual',
    updatedAt: format(updatedAt, 'yyyy-MM-dd'),
  }
}

/** Fiche de besoins de l'app → fiche stockée, valeurs arrondies (sans `updatedAt`, posé à l'écriture). */
export function targetsToStored(values: DailyTargets, source: UserTargets['source']): Omit<UserTargets, 'updatedAt'> {
  return {
    calories: Math.round(values.calories),
    carbohydrates: Math.round(values.carbohydrates),
    protein: Math.round(values.protein),
    fat: Math.round(values.fat),
    source,
  }
}

const DEFAULT_ACTIVITY = ACTIVITY_LEVELS[2]!

const finiteOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Fiche stockée → fiche de l'app ; une valeur inconnue ou manquante retombe sur la valeur par défaut. */
export function bodyFromStored(stored: Partial<UserBody>): BodyProfile {
  return {
    sex: SEXES.find(sex => SEX_KEYS[sex] === stored.sex) ?? 'Homme',
    birthDate: typeof stored.birthDate === 'string' ? stored.birthDate : null,
    heightCm: finiteOrNull(stored.heightCm),
    manualWeightKg: finiteOrNull(stored.manualWeightKg),
    bodyFatPercent: finiteOrNull(stored.bodyFatPercent),
    activity: (ACTIVITY_LEVELS.find(level => level.key === stored.activity) ?? DEFAULT_ACTIVITY).label,
  }
}

/** Fiche vierge, tant que rien n'est enregistré dans Firestore. */
export const emptyBody = () => bodyFromStored({})

/** Objectif stocké → objectif de l'app ; une valeur inconnue ou manquante retombe sur le maintien. */
export function goalFromStored(stored: Partial<UserGoal>): ProfileGoal {
  const direction = GOAL_DIRECTIONS.find(d => d.value === stored.direction)?.value ?? 'maintain'
  const percent = finiteOrNull(stored.calorieDeltaPercent)
  return {
    direction,
    targetWeightKg: finiteOrNull(stored.targetWeightKg),
    calorieDeltaPercent: percent && percent > 0 ? percent : GOAL_DEFAULT_CALORIE_PERCENT[direction === 'gain' ? 'gain' : 'loss'],
    proteinPerKg: PROTEIN_LEVELS.find(level => level.gramsPerKg === stored.proteinPerKg)?.gramsPerKg ?? DEFAULT_PROTEIN_PER_KG,
    proteinBasis: stored.proteinBasis === 'target' ? 'target' : 'current',
    startDate: typeof stored.startDate === 'string' ? stored.startDate : null,
    startWeightKg: finiteOrNull(stored.startWeightKg),
  }
}

/** Objectif vierge, tant que rien n'est enregistré dans Firestore. */
export const emptyGoal = () => goalFromStored({})

/** Objectif de l'app → objectif stocké (sans `updatedAt`, posé à l'écriture). */
export function goalToStored(goal: ProfileGoal): Omit<UserGoal, 'updatedAt'> {
  return {
    direction: goal.direction,
    targetWeightKg: goal.targetWeightKg,
    calorieDeltaPercent: goal.calorieDeltaPercent,
    proteinPerKg: goal.proteinPerKg,
    proteinBasis: goal.proteinBasis,
    startDate: goal.startDate,
    startWeightKg: goal.startWeightKg,
  }
}

/** Fiche de l'app → fiche stockée (sans `updatedAt`, posé à l'écriture). */
export function bodyToStored(body: BodyProfile): Omit<UserBody, 'updatedAt'> {
  return {
    sex: SEX_KEYS[body.sex],
    birthDate: body.birthDate,
    heightCm: body.heightCm,
    manualWeightKg: body.manualWeightKg,
    bodyFatPercent: body.bodyFatPercent,
    activity: (ACTIVITY_LEVELS.find(level => level.label === body.activity) ?? DEFAULT_ACTIVITY).key,
  }
}

export function ageFromBirthDate(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null
  const age = differenceInYears(today, parseISO(birthDate))
  return age >= 0 && age < 130 ? age : null
}

export function bodyMassIndex(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null
  const m = heightCm / 100
  return weightKg / (m * m)
}

/** kcal apportées par les macros (4 / 4 / 9 kcal par gramme). */
export const macroKcal = (t: Pick<DailyTargets, 'carbohydrates' | 'protein' | 'fat'>) =>
  t.carbohydrates * 4 + t.protein * 4 + t.fat * 9

/** Au-delà de cet écart entre kcal saisies et kcal des macros, la fiche signale l'incohérence. */
export const MACRO_KCAL_TOLERANCE = 0.05

export interface GoalProjection {
  /** kcal par jour : dépense de départ ∓ le pourcentage choisi, gardées fixes ensuite. */
  calories: number
  /** Rythme au départ, en kg/semaine (négatif = perte) ; il ralentit ensuite. */
  startRateKgPerWeek: number
  /** Jours avant d'atteindre le poids visé ; `null` si le poids se stabilise avant (dans l'horizon simulé). */
  reachDay: number | null
  /** Poids vers lequel tend la projection à ces kcal. */
  plateauKg: number
}

/**
 * Projection de l'objectif avec le modèle du calculateur de besoins journaliers (voir utils/weightProjection) :
 * mêmes kcal que le calculateur pour le même pourcentage, puis la perte (ou la prise) ralentit à kcal constantes.
 */
export function projectGoal(model: BodyModel, goal: ProfileGoal): GoalProjection | null {
  if (goal.direction === 'maintain' || goal.targetWeightKg === null || goal.calorieDeltaPercent <= 0) return null
  const calories = goalCalories(totalEnergyExpenditure(model), goal)
  const weights = simulateWeight(model, calories)
  return {
    calories,
    startRateKgPerWeek: rateForCalories(model, calories),
    reachDay: dayReaching(weights, goal.targetWeightKg),
    plateauKg: weights.at(-1)!,
  }
}

/**
 * Objectif du suivi de poids, tiré de l'objectif du profil ; `null` en maintien, sans poids visé ou sans point de départ.
 * La projection reprend le modèle du profil depuis le jour et le poids de départ, aux kcal que donnait le pourcentage
 * à ce poids ; sans date de naissance ni taille, pas de projection.
 */
export function trackingGoal(goal: ProfileGoal, body: BodyProfile, ageYears: number | null): WeightGoal | null {
  const { startDate, startWeightKg, targetWeightKg } = goal
  if (goal.direction === 'maintain' || !startDate || startWeightKg === null || targetWeightKg === null) return null
  if (ageYears === null || !body.heightCm) return { startDate, startWeightKg, targetWeightKg, projection: null }

  const model = resolveBodyModel({
    sex: body.sex,
    ageYears,
    heightCm: body.heightCm,
    weightKg: startWeightKg,
    measuredBodyFatPercent: body.bodyFatPercent,
    pal: activityPal(body.activity),
  })
  const weights = simulateWeight(model, goalCalories(totalEnergyExpenditure(model), goal))
  const capped = (kg: number) => (targetWeightKg < startWeightKg ? Math.max(kg, targetWeightKg) : Math.min(kg, targetWeightKg))
  return { startDate, startWeightKg, targetWeightKg, projection: weights.map(capped) }
}

/** Le poids visé va-t-il dans le sens de l'objectif ? */
export function goalDirectionError(currentKg: number | null, goal: ProfileGoal): string | undefined {
  if (goal.direction === 'maintain' || currentKg === null || goal.targetWeightKg === null) return undefined
  if (goal.direction === 'loss' && goal.targetWeightKg >= currentKg) return 'Pour une perte, le poids visé doit être sous le poids actuel'
  if (goal.direction === 'gain' && goal.targetWeightKg <= currentKg) return 'Pour une prise, le poids visé doit être au-dessus du poids actuel'
  return undefined
}

export const formatNumber = (n: number, maximumFractionDigits = 0) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits })

export const formatDay = (iso: string, pattern = 'd MMM') => format(parseISO(iso), pattern, { locale: fr }).replace(/\.$/, '')

// --- Réglages ---

export type PlannedMealType = 'BREAKFAST' | 'LUNCH' | 'DINER' | 'SNACK'

export const MEAL_SHARE_LABELS: Record<PlannedMealType, string> = {
  BREAKFAST: 'Petit déjeuner',
  LUNCH: 'Déjeuner',
  DINER: 'Dîner',
  SNACK: 'Collation',
}

/** Jours de la semaine, lundi d'abord (même convention que les menus). */
export const WEEK_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export type ExportFormat = 'todoist' | 'text'

export interface AppSettings {
  /** Part des kcal du jour par repas, en %. La collation ne compte que si `snackHasTarget`. */
  mealShares: Record<PlannedMealType, number>
  snackHasTarget: boolean
  /** En %, autour de la cible. */
  mealTolerance: number
  dayTolerance: number
  householdPortions: number
  /** Index dans `WEEK_DAYS`. */
  shoppingDay: number
  /** Identifiants de rayons, dans l'ordre de passage en magasin. */
  aisleOrder: string[]
  pantry: string[]
  roundUpPieces: boolean
  exportFormat: ExportFormat
  trackedZones: MeasurementZoneKey[]
  showGoalProjection: boolean
}

/** Ordre du catalogue (celui du seed), « Divers » en dernier. */
export const DEFAULT_AISLE_ORDER = [...MANUAL_AISLES].sort((a, b) => a.order - b.order).map(a => a.id)

export const AISLE_BY_ID = Object.fromEntries(MANUAL_AISLES.map(a => [a.id, a]))

export function defaultSettings(): AppSettings {
  return {
    mealShares: { BREAKFAST: 30, LUNCH: 40, DINER: 30, SNACK: 0 },
    snackHasTarget: false,
    mealTolerance: 10,
    dayTolerance: 5,
    householdPortions: 2,
    shoppingDay: 5,
    aisleOrder: [...DEFAULT_AISLE_ORDER],
    pantry: ['Sel', 'Poivre', 'Huile d\'olive', 'Ail'],
    roundUpPieces: true,
    exportFormat: 'todoist',
    trackedZones: MEASUREMENT_ZONES.map(z => z.key),
    showGoalProjection: true,
  }
}

export function activeMealShares(settings: AppSettings): PlannedMealType[] {
  return settings.snackHasTarget ? ['BREAKFAST', 'LUNCH', 'DINER', 'SNACK'] : ['BREAKFAST', 'LUNCH', 'DINER']
}

export function mealSharesTotal(settings: AppSettings): number {
  return activeMealShares(settings).reduce((sum, key) => sum + (settings.mealShares[key] ?? 0), 0)
}
