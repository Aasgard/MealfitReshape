import { subDays } from 'date-fns'
import { toIsoDay } from './weightTrend'

export type MeasurementZoneKey = 'neck' | 'chest' | 'arm' | 'waist' | 'hips' | 'thigh' | 'calf'

export interface MeasurementZone {
  key: MeasurementZoneKey
  label: string
  /** Où et comment placer le ruban, en une phrase. */
  howTo: string
}

/** Zones dans l'ordre du corps, de haut en bas — c'est aussi l'ordre de saisie. */
export const MEASUREMENT_ZONES: MeasurementZone[] = [
  { key: 'neck', label: 'Cou', howTo: 'Juste sous la pomme d\'Adam, ruban bien horizontal.' },
  { key: 'chest', label: 'Poitrine', howTo: 'Au niveau des mamelons, bras le long du corps, après une expiration normale.' },
  { key: 'arm', label: 'Bras', howTo: 'Bras droit détendu, à mi-hauteur entre l\'épaule et le coude.' },
  { key: 'waist', label: 'Taille', howTo: 'Au niveau du nombril, ventre relâché, après une expiration normale.' },
  { key: 'hips', label: 'Hanches', howTo: 'Au point le plus large des fesses, pieds joints.' },
  { key: 'thigh', label: 'Cuisse', howTo: 'Cuisse droite détendue, à mi-hauteur entre l\'aine et le genou.' },
  { key: 'calf', label: 'Mollet', howTo: 'Mollet droit, debout, au point le plus large.' },
]

export const ZONE_BY_KEY = Object.fromEntries(MEASUREMENT_ZONES.map(z => [z.key, z])) as Record<MeasurementZoneKey, MeasurementZone>

export interface MeasurementSession {
  id: string
  /** Jour de la séance, au format `yyyy-MM-dd` (une séance par jour au plus). */
  date: string
  /** Tours en cm ; une zone absente n'a pas été mesurée ce jour-là. */
  values: Partial<Record<MeasurementZoneKey, number>>
}

export interface ZonePoint {
  date: string
  valueCm: number
}

export const MIN_MEASUREMENT_CM = 10
export const MAX_MEASUREMENT_CM = 250
/** Au-delà de cet écart relatif avec la mesure précédente, on invite à vérifier (sans bloquer). */
export const MEASUREMENT_WARNING_RATIO = 0.08

export function sortSessions(sessions: MeasurementSession[]): MeasurementSession[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date))
}

/** Historique d'une zone, de la plus ancienne à la plus récente, sans les séances où elle manque. */
export function zoneHistory(sessions: MeasurementSession[], key: MeasurementZoneKey): ZonePoint[] {
  return sortSessions(sessions)
    .filter(s => s.values[key] !== undefined)
    .map(s => ({ date: s.date, valueCm: s.values[key]! }))
}

export interface ZoneSummary {
  zone: MeasurementZone
  first: ZonePoint | null
  previous: ZonePoint | null
  latest: ZonePoint | null
  /** Écart depuis la première mesure de la zone ; `null` tant qu'il n'y en a qu'une. */
  sinceStartCm: number | null
  sinceLastCm: number | null
}

export function summarizeZones(sessions: MeasurementSession[]): ZoneSummary[] {
  return MEASUREMENT_ZONES.map((zone) => {
    const history = zoneHistory(sessions, zone.key)
    const first = history[0] ?? null
    const latest = history.at(-1) ?? null
    const previous = history.at(-2) ?? null
    return {
      zone,
      first,
      previous,
      latest,
      sinceStartCm: first && latest && history.length > 1 ? latest.valueCm - first.valueCm : null,
      sinceLastCm: previous && latest ? latest.valueCm - previous.valueCm : null,
    }
  })
}

/** Dernière valeur connue d'une zone avant une date donnée (exclue), pour préremplir les repères. */
export function lastValueBefore(sessions: MeasurementSession[], key: MeasurementZoneKey, date: string): ZonePoint | null {
  return zoneHistory(sessions, key).filter(p => p.date < date).at(-1) ?? null
}

export function formatCm(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/** Écart signé avec un vrai signe moins typographique (`−6,0`, `+0,5`). */
export function formatSignedCm(value: number): string {
  const rounded = Number(value.toFixed(1))
  if (rounded === 0) return formatCm(0)
  return `${rounded > 0 ? '+' : '−'}${formatCm(Math.abs(rounded))}`
}

// --- Données d'exemple (maquette, pas encore de Firestore) ---

/** Jours écoulés avant aujourd'hui pour chaque séance : toutes les 3 à 4 semaines. */
const SAMPLE_SESSION_OFFSETS = [89, 65, 42, 20, 4]
/** Avancement de chaque séance entre le départ et la dernière mesure : progression irrégulière, comme en vrai. */
const SAMPLE_PROGRESS = [0, 0.3, 0.45, 0.75, 1]

const SAMPLE_RANGES: Record<MeasurementZoneKey, [number, number]> = {
  neck: [38.5, 37.5],
  chest: [104, 102],
  arm: [34, 33.5],
  waist: [92.5, 86.5],
  hips: [102, 98.5],
  thigh: [60, 58.5],
  calf: [38, 38],
}

/** Petites variations de lecture du ruban, indépendantes de la tendance. */
const SAMPLE_JITTER: Partial<Record<MeasurementZoneKey, number[]>> = {
  arm: [0, 0.5, 0, 0, 0],
  calf: [0, 0.5, 0, -0.5, 0],
  chest: [0, 0, 0.5, 0, 0],
}

const roundToHalf = (value: number) => Math.round(value * 2) / 2

export function buildSampleSessions(today = new Date()): MeasurementSession[] {
  return SAMPLE_SESSION_OFFSETS.map((offset, i) => {
    const values: MeasurementSession['values'] = {}
    for (const zone of MEASUREMENT_ZONES) {
      // Séance du milieu : le mollet a été oublié.
      if (zone.key === 'calf' && i === 2) continue
      const [start, end] = SAMPLE_RANGES[zone.key]
      values[zone.key] = roundToHalf(start + (end - start) * SAMPLE_PROGRESS[i]! + (SAMPLE_JITTER[zone.key]?.[i] ?? 0))
    }
    return { id: `sample-${i}`, date: toIsoDay(subDays(today, offset)), values }
  })
}
