import { addDays, addWeeks, format, isSameMonth, isSameWeek, isToday, parse, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { MenuDayHeader, MenuWeekOption } from '~/types/menu'

/** Convention date-fns pour toutes les semaines de la page Menus : 1 = lundi. */
export const WEEK_STARTS_ON = 1

/** Jours de la semaine, lundi en premier (aligné sur `WEEK_STARTS_ON`). */
export const DAY_KEYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const
export type MenuDayKey = typeof DAY_KEYS[number]

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Identifiant stable d'une semaine : date ISO de son lundi (ex. "2026-09-14"). */
export const weekId = (date: Date) => format(date, 'yyyy-MM-dd')

/** Inverse de `weekId` : reconstruit le lundi de la semaine depuis son identifiant. */
export const parseWeekId = (id: string) => startOfWeek(parse(id, 'yyyy-MM-dd', new Date()), { weekStartsOn: WEEK_STARTS_ON })

/** "7-13 sept" : toujours le mois de fin de semaine, pour rester compact même quand la semaine chevauche deux mois. */
export const formatWeekRangeShort = (start: Date, end: Date) =>
  `${format(start, 'd')}-${format(end, 'd')} ${format(end, 'MMM', { locale: fr }).replace(/\.$/, '')}`

/** "14 – 20 septembre" (ou "28 septembre – 4 octobre" si la semaine chevauche deux mois, année ajoutée si différente de l'année en cours). */
export const formatWeekLabel = (start: Date, end: Date) => {
  const currentYear = new Date().getFullYear()
  const yearSuffix = start.getFullYear() !== currentYear || end.getFullYear() !== currentYear
    ? ` ${format(end, 'yyyy')}`
    : ''
  if (isSameMonth(start, end)) {
    return `${format(start, 'd')} – ${format(end, 'd')} ${format(end, 'MMMM', { locale: fr })}${yearSuffix}`
  }
  return `${format(start, 'd MMMM', { locale: fr })} – ${format(end, 'd MMMM', { locale: fr })}${yearSuffix}`
}

/** En-têtes de colonnes du calendrier pour la semaine commençant à `weekStart` (lundi) ; marque la colonne du jour courant. */
export function buildWeekDays(weekStart: Date): MenuDayHeader[] {
  return DAY_KEYS.map((key, index) => {
    const date = addDays(weekStart, index)
    return {
      key,
      dayLabel: capitalize(format(date, 'EEE', { locale: fr })),
      dateLabel: format(date, 'd'),
      isSelected: isToday(date),
    }
  })
}

/** Bande de `radius * 2 + 1` semaines sélectionnables, centrée sur `centerWeekStart`. */
export function buildWeekOptions(centerWeekStart: Date, radius: number, referenceWeekStart: Date): MenuWeekOption[] {
  return Array.from({ length: radius * 2 + 1 }, (_, i) => {
    const start = addWeeks(centerWeekStart, i - radius)
    const end = addDays(start, 6)
    return {
      id: weekId(start),
      rangeLabel: formatWeekRangeShort(start, end),
      isCurrent: isSameWeek(start, referenceWeekStart, { weekStartsOn: WEEK_STARTS_ON }),
    }
  })
}
