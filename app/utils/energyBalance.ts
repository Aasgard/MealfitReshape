import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import { energyPerKgAtStart, resolveBodyModel, totalEnergyExpenditure, type BodyModelInput } from './weightProjection'
import type { WeighIn } from './weightTrend'

/**
 * Bilan énergétique par semaine (lundi → dimanche, comme les menus), pour relier le déficit calorique à la variation
 * de poids sur le suivi de poids. Le déficit d'un jour se décompose en trois parts :
 * - prévu : entretien − objectif kcal (le déficit voulu par l'objectif) ;
 * - écart au plan : objectif kcal − kcal mangées (négatif quand on mange au-delà de l'objectif) ;
 * - séances : kcal dépensées en séance, retirées comme sur l'accueil.
 * Leur somme, convertie avec les kcal par kg du modèle de Hall à la composition de la semaine, donne la perte attendue.
 * Comme le résumé hebdomadaire des Menus, la moyenne ne porte que sur les jours complets (`isCompleteDay`).
 */

/** En dessous, la semaine est « incomplète » : sa moyenne repose sur trop peu de jours. */
export const MIN_LOGGED_DAYS = 5

/** Demi-fenêtre de la tendance autour d'un lundi : la moyenne des pesées de jeudi à jeudi gomme l'eau et le sel. */
const TREND_HALF_WINDOW_DAYS = 3

export type EnergyWeekStatus = 'complete' | 'incomplete' | 'current'

export interface EnergyBalanceParts {
  /** kcal/j, positif = déficit. */
  planned: number
  planGap: number
  sessions: number
}

export interface EnergyWeek {
  /** Lundi et dimanche, `yyyy-MM-dd`. */
  start: string
  end: string
  status: EnergyWeekStatus
  /** Jours complets (déjeuner et dîner saisis), seuls comptés dans la moyenne. */
  loggedDays: number
  /** Séances avec des kcal renseignées, sur les jours saisis. */
  sessionCount: number
  /** `null` : aucun jour saisi (rien à moyenner). */
  energy: null | (EnergyBalanceParts & {
    /** Somme des trois parts, kcal/j ; positif = déficit. */
    deficit: number
    maintenanceKcal: number
    targetKcal: number
    /** Moyenne par jour saisi. */
    eatenKcal: number
    /** Poids auquel l'entretien est calculé. */
    weightKg: number
    kcalPerKg: number
    /** Variation attendue sur la semaine, kg ; négatif = perte. */
    expectedKg: number
  })
  /** Variation de la tendance entre ce lundi et le suivant ; `null` sans pesée de part et d'autre. */
  actualKg: number | null
}

export interface EnergyBalanceInput {
  /** Lundis des semaines à calculer, `yyyy-MM-dd`, du plus ancien au plus récent. */
  weekStarts: string[]
  /** Lundi de la semaine en cours. */
  currentWeekStart: string
  /** kcal comptées par jour complet (`yyyy-MM-dd`, voir `isCompleteDay`) ; un jour absent ne compte pas. */
  eatenByDay: Map<string, number>
  /** Kcal dépensées en séance par jour, et nombre de séances qui les renseignent. */
  sessionsByDay: Map<string, { kcal: number, count: number }>
  /** Pesées triées par date. */
  weighIns: WeighIn[]
  /** Fiche corporelle sans le poids, pris à chaque semaine. */
  body: Omit<BodyModelInput, 'weightKg'>
  /** Objectif kcal du jour ; `null` : pas de besoins définis, l'objectif vaut l'entretien (rien de prévu). */
  targetKcal: number | null
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10)
const shift = (day: string, days: number) => dayKey(addDays(parseISO(`${day}T12:00:00Z`), days))

/** Moyenne des pesées à ±3 jours de `day`, ou `null`. */
export function trendAround(weighIns: WeighIn[], day: string): number | null {
  const from = shift(day, -TREND_HALF_WINDOW_DAYS)
  const to = shift(day, TREND_HALF_WINDOW_DAYS)
  const inWindow = weighIns.filter(w => w.date >= from && w.date <= to)
  return inWindow.length ? inWindow.reduce((sum, w) => sum + w.weightKg, 0) / inWindow.length : null
}

/** Pesée la plus proche de `day`, pour l'entretien d'une semaine sans pesée autour de son lundi. */
function nearestWeight(weighIns: WeighIn[], day: string): number | null {
  let best: WeighIn | null = null
  let bestDistance = Infinity
  for (const w of weighIns) {
    const distance = Math.abs(differenceInCalendarDays(parseISO(w.date), parseISO(day)))
    if (distance < bestDistance) {
      best = w
      bestDistance = distance
    }
  }
  return best?.weightKg ?? null
}

export function buildEnergyWeeks(input: EnergyBalanceInput): EnergyWeek[] {
  return input.weekStarts.map((start) => {
    const end = shift(start, 6)
    const days = Array.from({ length: 7 }, (_, i) => shift(start, i))
    const logged = days.filter(day => input.eatenByDay.has(day))

    let sessionKcal = 0
    let sessionCount = 0
    for (const day of logged) {
      const sessions = input.sessionsByDay.get(day)
      if (!sessions) continue
      sessionKcal += sessions.kcal
      sessionCount += sessions.count
    }

    const startTrend = trendAround(input.weighIns, start)
    const endTrend = trendAround(input.weighIns, shift(start, 7))
    const weightKg = startTrend ?? nearestWeight(input.weighIns, start)

    let energy: EnergyWeek['energy'] = null
    if (logged.length && weightKg !== null) {
      const model = resolveBodyModel({ ...input.body, weightKg })
      const maintenanceKcal = totalEnergyExpenditure(model)
      const kcalPerKg = energyPerKgAtStart(model)
      const targetKcal = input.targetKcal ?? maintenanceKcal
      const eatenKcal = logged.reduce((sum, day) => sum + input.eatenByDay.get(day)!, 0) / logged.length
      const parts = {
        planned: maintenanceKcal - targetKcal,
        planGap: targetKcal - eatenKcal,
        sessions: sessionKcal / logged.length,
      }
      const deficit = parts.planned + parts.planGap + parts.sessions
      energy = { ...parts, deficit, maintenanceKcal, targetKcal, eatenKcal, weightKg, kcalPerKg, expectedKg: -(deficit * 7) / kcalPerKg }
    }

    const status: EnergyWeekStatus = start === input.currentWeekStart
      ? 'current'
      : logged.length >= MIN_LOGGED_DAYS ? 'complete' : 'incomplete'

    return {
      start,
      end,
      status,
      loggedDays: logged.length,
      sessionCount,
      energy,
      actualKg: status === 'current' || startTrend === null || endTrend === null ? null : endTrend - startTrend,
    }
  })
}

export interface EnergyBalanceSummary {
  weeks: number
  /** kcal/j, positif = déficit. */
  averageDeficit: number
  expectedKg: number
  actualKg: number
}

/** Cumul des semaines complètes qui ont à la fois un bilan et une variation de poids ; `null` s'il n'y en a aucune. */
export function summarizeEnergyWeeks(weeks: EnergyWeek[]): EnergyBalanceSummary | null {
  const usable = weeks.filter(w => w.status === 'complete' && w.energy && w.actualKg !== null)
  if (!usable.length) return null
  return {
    weeks: usable.length,
    averageDeficit: usable.reduce((sum, w) => sum + w.energy!.deficit, 0) / usable.length,
    expectedKg: usable.reduce((sum, w) => sum + w.energy!.expectedKg, 0),
    actualKg: usable.reduce((sum, w) => sum + w.actualKg!, 0),
  }
}

// --- Formatage ---

/** Valeur absolue, arrondie à l'unité. */
export const formatKcal = (kcal: number) => Math.round(Math.abs(kcal)).toLocaleString('fr-FR')
