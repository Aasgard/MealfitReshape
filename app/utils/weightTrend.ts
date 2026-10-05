import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

/** Une pesée (`users/{uid}/weighIns/{date}`, voir `useWeighIns`) ; `id` et `date` valent tous deux le jour. */
export interface WeighIn {
  id: string
  /** Jour de la pesée, au format `yyyy-MM-dd` (une pesée par jour au plus). */
  date: string
  weightKg: number
  note?: string
}

/** Objectif suivi, tiré de l'objectif du profil (voir `trackingGoal`). */
export interface WeightGoal {
  /** Jour de départ de l'objectif, au format `yyyy-MM-dd`. */
  startDate: string
  startWeightKg: number
  targetWeightKg: number
  /**
   * Poids projeté jour par jour depuis `startDate` (index = nombre de jours), avec le modèle du calculateur de besoins
   * journaliers, plafonné au poids visé. `null` : pas de projection (fiche corporelle incomplète ou projection masquée).
   */
  projection: number[] | null
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

/** Bornes d'une saisie de poids plausible. */
export const MIN_WEIGHT_KG = 20
export const MAX_WEIGHT_KG = 400

/** Message d'erreur pour un poids saisi (`null` : saisie vide ou illisible), `undefined` s'il est valide. */
export function weightInputError(weightKg: number | null): string | undefined {
  if (weightKg === null) return 'Saisissez votre poids, par exemple 78,4'
  if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) return `Le poids doit être compris entre ${MIN_WEIGHT_KG} et ${MAX_WEIGHT_KG} kg`
  return undefined
}

/** Un poids est enregistré au dixième de kilo. */
export const roundWeight = (weightKg: number) => Math.round(weightKg * 10) / 10

/** Dernière pesée strictement avant `date` (`yyyy-MM-dd`), ou `null`. */
export function weighInBefore(weighIns: WeighIn[], date: string): WeighIn | null {
  return weighIns.reduce<WeighIn | null>(
    (latest, w) => (w.date < date && (!latest || w.date > latest.date) ? w : latest),
    null,
  )
}

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

/** Une perte (poids visé sous le poids de départ) plutôt qu'une prise. */
export const isLossGoal = (goal: WeightGoal) => goal.targetWeightKg < goal.startWeightKg

/** Poids projeté à une date ; `null` sans projection ou avant le départ. Au-delà de l'horizon simulé, le dernier poids. */
export function projectionAt(goal: WeightGoal, date: string): number | null {
  const days = differenceInCalendarDays(parseISO(date), parseISO(goal.startDate))
  if (!goal.projection || days < 0) return null
  return goal.projection[Math.min(days, goal.projection.length - 1)]!
}

/** Part du chemin parcourue entre le poids de départ et le poids visé, bornée à [0, 1]. */
export function goalRatio(goal: WeightGoal, trendKg: number): number {
  const total = goal.startWeightKg - goal.targetWeightKg
  return total === 0 ? 1 : Math.min(Math.max((goal.startWeightKg - trendKg) / total, 0), 1)
}

export interface WeightProgress {
  /** Rythme de la tendance sur 4 semaines ; `null` tant qu'il y a moins de `MIN_WEIGH_INS_FOR_TREND` pesées. */
  rateKgPerWeek: number | null
  /** Part de l'objectif atteinte, en % entier ; `null` sans objectif. */
  goalPercent: number | null
  /** Le rythme (arrondi au centième, comme affiché) va à l'inverse de l'objectif : hausse pour une perte, baisse pour une prise. */
  againstGoal: boolean
}

/**
 * Progression au jour `date`, sans poids brut : seules les pesées jusqu'à ce jour comptent. `null` quand il n'y a
 * rien à montrer (aucune pesée, ou ni rythme ni objectif).
 */
export function weightProgressAt(weighIns: WeighIn[], goal: WeightGoal | null, date: string): WeightProgress | null {
  const points = computeTrend(weighIns.filter(w => w.date <= date))
  const current = points.at(-1)
  if (!current) return null

  const rateKgPerWeek = points.length >= MIN_WEIGH_INS_FOR_TREND ? trendRateKgPerWeek(points) : null
  const goalPercent = goal ? Math.round(goalRatio(goal, current.trendKg) * 100) : null
  if (rateKgPerWeek === null && goalPercent === null) return null

  const roundedRate = rateKgPerWeek === null ? 0 : Math.round(rateKgPerWeek * 100)
  const againstGoal = !!goal && (isLossGoal(goal) ? roundedRate > 0 : roundedRate < 0)
  return { rateKgPerWeek, goalPercent, againstGoal }
}

/**
 * Rythme prévu en kg/semaine sur les `days` jours qui précèdent `date`, pour le comparer à `trendRateKgPerWeek` :
 * il ralentit au fil de l'objectif, puis tombe à 0 une fois le poids visé atteint. La première semaine, celui du départ.
 */
export function projectionRateKgPerWeek(goal: WeightGoal, date: string, days = 28): number | null {
  const projection = goal.projection
  const end = differenceInCalendarDays(parseISO(date), parseISO(goal.startDate))
  if (!projection || end < 0) return null
  const last = Math.min(Math.max(end, TREND_WINDOW_DAYS), projection.length - 1)
  const first = Math.max(last - days, 0)
  return ((projection[last]! - projection[first]!) / (last - first)) * 7
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
