import { addDays, differenceInYears, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { DailyTargets } from './dailyTargets'
import { MANUAL_AISLES } from './groceryList'
import { MEASUREMENT_ZONES, type MeasurementZoneKey } from './measurements'

/**
 * Profil et réglages : maquette en mémoire (pas encore de Firestore).
 * Les libellés d'activité et d'objectif reprennent ceux du calculateur de besoins journaliers,
 * pour que « Définir comme objectif » et le préremplissage passent d'une page à l'autre sans traduction.
 */

// --- Profil ---

export type Sex = 'Homme' | 'Femme'
export const SEXES: Sex[] = ['Homme', 'Femme']

export interface ActivityLevel {
  /** Libellé complet, identique à l'option du calculateur. */
  label: string
  short: string
  detail: string
}

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  { label: 'Sédentaire (peu ou pas d\'exercice)', short: 'Sédentaire', detail: 'Peu ou pas d\'exercice' },
  { label: 'Légèrement actif (exercice léger 1-3 j/semaine)', short: 'Légèrement actif', detail: 'Exercice léger 1 à 3 j/semaine' },
  { label: 'Modérément actif (exercice 3-5 j/semaine)', short: 'Modérément actif', detail: 'Exercice 3 à 5 j/semaine' },
  { label: 'Très actif (exercice intense 6-7 j/semaine)', short: 'Très actif', detail: 'Exercice intense 6 à 7 j/semaine' },
  { label: 'Extrêmement actif (travail physique + sport)', short: 'Extrêmement actif', detail: 'Travail physique + sport' },
]

export type GoalDirection = 'loss' | 'maintain' | 'gain'

export const GOAL_DIRECTIONS: { value: GoalDirection, label: string, icon: string }[] = [
  { value: 'loss', label: 'Perte', icon: 'i-lucide-trending-down' },
  { value: 'maintain', label: 'Maintien', icon: 'i-lucide-equal' },
  { value: 'gain', label: 'Prise', icon: 'i-lucide-trending-up' },
]

/** Rythmes proposés, en kg/semaine (valeur absolue ; le sens vient de l'objectif). */
export const GOAL_RATES: Record<Exclude<GoalDirection, 'maintain'>, number[]> = {
  loss: [0.25, 0.5, 0.75, 1],
  gain: [0.25, 0.5],
}

/** Libellé d'objectif du calculateur → sens de l'objectif du profil. */
export const CALCULATOR_GOAL_DIRECTION: Record<string, GoalDirection> = {
  'Perte de poids (-20 %)': 'loss',
  'Maintien': 'maintain',
  'Prise de poids (+15 %)': 'gain',
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
  /** kg/semaine, valeur absolue. */
  rateKgPerWeek: number
}

export interface ProfileTargets extends DailyTargets {
  source: 'calculator' | 'manual'
  /** Format `yyyy-MM-dd`. */
  updatedAt: string
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

/** Date estimée d'arrivée au poids visé, au rythme prévu. */
export function goalArrivalDate(currentKg: number, goal: ProfileGoal, from = new Date()): Date | null {
  if (goal.direction === 'maintain' || goal.targetWeightKg === null || goal.rateKgPerWeek <= 0) return null
  const remaining = Math.abs(currentKg - goal.targetWeightKg)
  return addDays(from, Math.round((remaining / goal.rateKgPerWeek) * 7))
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

// --- Données d'exemple ---

export type ProfileScenario = 'complete' | 'new'

export const PROFILE_SCENARIO_LABELS: Record<ProfileScenario, string> = {
  complete: 'Profil complet',
  new: 'Nouveau profil',
}

export function sampleBody(scenario: ProfileScenario): BodyProfile {
  return scenario === 'complete'
    ? { sex: 'Homme', birthDate: '1991-04-17', heightCm: 178, manualWeightKg: null, bodyFatPercent: null, activity: ACTIVITY_LEVELS[2]!.label }
    : { sex: 'Homme', birthDate: null, heightCm: null, manualWeightKg: null, bodyFatPercent: null, activity: ACTIVITY_LEVELS[1]!.label }
}

export function sampleGoal(scenario: ProfileScenario): ProfileGoal {
  return scenario === 'complete'
    ? { direction: 'loss', targetWeightKg: 72, rateKgPerWeek: 0.5 }
    : { direction: 'maintain', targetWeightKg: null, rateKgPerWeek: 0.5 }
}

export function sampleTargets(scenario: ProfileScenario, today = new Date()): ProfileTargets | null {
  if (scenario === 'new') return null
  return { calories: 2140, carbohydrates: 275, protein: 127, fat: 59, source: 'calculator', updatedAt: format(addDays(today, -5), 'yyyy-MM-dd') }
}

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
