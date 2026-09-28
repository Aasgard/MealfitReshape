import { addDays, differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'

export interface WeighIn {
  id: string
  /** Jour de la pesée, au format `yyyy-MM-dd` (une pesée par jour au plus). */
  date: string
  weightKg: number
  note?: string
}

export interface WeightGoal {
  /** Jour de départ de la projection, au format `yyyy-MM-dd`. */
  startDate: string
  startWeightKg: number
  targetWeightKg: number
  /** Rythme prévu par le calculateur de besoins journaliers, en kg/semaine (négatif = perte). */
  plannedRateKgPerWeek: number
}

export interface TrendPoint extends WeighIn {
  /** Moyenne des pesées des 7 derniers jours calendaires, jour inclus. */
  trendKg: number
}

/** Fenêtre de la moyenne glissante : gomme les variations d'eau et de sel d'un jour à l'autre. */
export const TREND_WINDOW_DAYS = 7
/** En dessous de ce nombre de pesées, la tendance est encore trop sensible au bruit. */
export const MIN_WEIGH_INS_FOR_TREND = 7
/** Au-delà de cet écart entre deux pesées, la courbe est interrompue plutôt que de relier le trou. */
export const TREND_GAP_BREAK_DAYS = 4

export const toIsoDay = (date: Date) => format(date, 'yyyy-MM-dd')

export function sortWeighIns(weighIns: WeighIn[]): WeighIn[] {
  return [...weighIns].sort((a, b) => a.date.localeCompare(b.date))
}

/** Moyenne glissante calculée sur les pesées disponibles : les jours sans pesée ne comptent pas. */
export function computeTrend(weighIns: WeighIn[]): TrendPoint[] {
  const sorted = sortWeighIns(weighIns)
  return sorted.map((weighIn, i) => {
    const day = parseISO(weighIn.date)
    let sum = 0
    let count = 0
    for (let j = i; j >= 0; j--) {
      const previous = sorted[j]!
      if (differenceInCalendarDays(day, parseISO(previous.date)) >= TREND_WINDOW_DAYS) break
      sum += previous.weightKg
      count++
    }
    return { ...weighIn, trendKg: sum / count }
  })
}

/** Dernier point de tendance à la date donnée ou avant. */
export function trendAt(points: TrendPoint[], date: string): TrendPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i]!.date <= date) return points[i]!
  }
  return null
}

/**
 * Rythme réel en kg/semaine : pente (moindres carrés) de la tendance sur les `days` derniers jours.
 * `null` tant que les pesées ne couvrent pas au moins une semaine.
 */
export function trendRateKgPerWeek(points: TrendPoint[], days = 28): number | null {
  const last = points[points.length - 1]
  if (!last) return null
  const end = parseISO(last.date)
  const recent = points
    .map(p => ({ x: -differenceInCalendarDays(end, parseISO(p.date)), y: p.trendKg }))
    .filter(p => p.x > -days)
  if (recent.length < 2 || -recent[0]!.x < TREND_WINDOW_DAYS) return null

  const meanX = recent.reduce((s, p) => s + p.x, 0) / recent.length
  const meanY = recent.reduce((s, p) => s + p.y, 0) / recent.length
  let num = 0
  let den = 0
  for (const p of recent) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
  }
  return den === 0 ? null : (num / den) * 7
}

/** Jour où la projection atteint l'objectif (elle reste ensuite à plat). */
export function projectionReachDate(goal: WeightGoal): string | null {
  const delta = goal.targetWeightKg - goal.startWeightKg
  if (goal.plannedRateKgPerWeek === 0 || Math.sign(delta) !== Math.sign(goal.plannedRateKgPerWeek)) return null
  return toIsoDay(addDays(parseISO(goal.startDate), Math.round((delta / goal.plannedRateKgPerWeek) * 7)))
}

/** Poids projeté à une date : rythme prévu constant, plafonné à l'objectif. */
export function projectionAt(goal: WeightGoal, date: string): number {
  const days = differenceInCalendarDays(parseISO(date), parseISO(goal.startDate))
  const projected = goal.startWeightKg + (goal.plannedRateKgPerWeek * days) / 7
  return goal.plannedRateKgPerWeek < 0
    ? Math.max(projected, goal.targetWeightKg)
    : Math.min(projected, goal.targetWeightKg)
}

/** Date estimée d'atteinte de l'objectif au rythme réel, ou `null` si le rythme n'y mène pas. */
export function estimateGoalDate(currentKg: number, targetKg: number, rateKgPerWeek: number | null, from: string): string | null {
  if (rateKgPerWeek === null || Math.abs(rateKgPerWeek) < 0.05) return null
  const weeks = (targetKg - currentKg) / rateKgPerWeek
  if (weeks <= 0 || weeks > 156) return null
  return toIsoDay(addDays(parseISO(from), Math.round(weeks * 7)))
}

// --- Formatage ---

const MINUS = '−'

export function formatWeight(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace('.', ',')
}

/** Valeur signée avec un vrai signe moins typographique (`−1,3`, `+0,4`). */
export function formatSignedWeight(value: number, decimals = 1): string {
  const rounded = Number(value.toFixed(decimals))
  if (rounded === 0) return formatWeight(0, decimals)
  return `${rounded > 0 ? '+' : MINUS}${formatWeight(Math.abs(rounded), decimals)}`
}

// --- Données d'exemple (maquette, pas encore de Firestore) ---

/** Générateur pseudo-aléatoire déterministe : l'exemple reste identique d'un chargement à l'autre. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SAMPLE_DAYS = 90
const SAMPLE_START_KG = 82.1

/** Poids « réel » sous-jacent : perte régulière, plateau d'une dizaine de jours, puis reprise plus lente. */
function sampleUnderlyingWeight(day: number): number {
  if (day < 35) return SAMPLE_START_KG - 0.08 * day
  if (day < 46) return SAMPLE_START_KG - 0.08 * 35
  return SAMPLE_START_KG - 0.08 * 35 - 0.06 * (day - 46)
}

/** 8 jours sans pesée, dont 4 jours de vacances d'affilée. */
const SAMPLE_SKIPPED_DAYS = new Set([6, 17, 33, 58, 59, 60, 61, 71])

/** Écarts ponctuels expliqués par une note, comme on en saisit réellement. */
const SAMPLE_EVENTS: Record<number, { deltaKg: number, note: string }> = {
  12: { deltaKg: 0.9, note: 'Repas au restaurant la veille' },
  27: { deltaKg: -0.6, note: 'Après une sortie longue de 2 h' },
  40: { deltaKg: 0.7, note: 'Soirée pizza' },
  62: { deltaKg: 1.1, note: 'Retour de vacances' },
  76: { deltaKg: -0.5, note: 'Trail de 25 km la veille' },
  84: { deltaKg: 0.6, note: 'Repas salé' },
}

export function buildSampleWeighIns(today = new Date()): WeighIn[] {
  const random = mulberry32(20260928)
  const first = subDays(today, SAMPLE_DAYS - 1)
  const weighIns: WeighIn[] = []

  for (let day = 0; day < SAMPLE_DAYS; day++) {
    const noise = (random() - 0.5) * 1.1
    if (SAMPLE_SKIPPED_DAYS.has(day)) continue
    const event = SAMPLE_EVENTS[day]
    const weightKg = Math.round((sampleUnderlyingWeight(day) + noise + (event?.deltaKg ?? 0)) * 10) / 10
    weighIns.push({
      id: `sample-${day}`,
      date: toIsoDay(addDays(first, day)),
      weightKg: day === 0 ? SAMPLE_START_KG : weightKg,
      note: event?.note,
    })
  }
  return weighIns
}

export function buildSampleGoal(weighIns: WeighIn[]): WeightGoal | null {
  const first = sortWeighIns(weighIns)[0]
  if (!first) return null
  return {
    startDate: first.date,
    startWeightKg: first.weightKg,
    targetWeightKg: 72,
    plannedRateKgPerWeek: -0.5,
  }
}
