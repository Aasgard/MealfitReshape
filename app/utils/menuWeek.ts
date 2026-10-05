import { addDays, format, isSameMonth, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { MenuDayHeader } from '~/types/menu'

/** Convention date-fns pour toutes les semaines de la page Menus : 1 = lundi. */
export const WEEK_STARTS_ON = 1

export const DAYS_PER_WEEK = 7

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Clé d'un jour dans le calendrier et ses repas : sa date ISO (ex. "2026-09-14"), unique d'une semaine à l'autre. */
export const dayKeyOf = (date: Date) => format(date, 'yyyy-MM-dd')

/** Identifiant stable d'une semaine : la clé de son lundi. */
export const weekId = dayKeyOf

/**
 * "14 – 20 septembre" (ou "28 septembre – 4 octobre" si la semaine chevauche deux mois, année ajoutée si différente de
 * l'année en cours). `short` abrège les mois ("28 sept – 4 oct") pour tenir sur une ligne sur mobile.
 */
export const formatWeekLabel = (start: Date, end: Date, { short = false } = {}) => {
  const currentYear = new Date().getFullYear()
  const yearSuffix = start.getFullYear() !== currentYear || end.getFullYear() !== currentYear
    ? ` ${format(end, 'yyyy')}`
    : ''
  const month = (date: Date) => format(date, short ? 'MMM' : 'MMMM', { locale: fr }).replace(/\.$/, '')
  if (isSameMonth(start, end)) {
    return `${format(start, 'd')} – ${format(end, 'd')} ${month(end)}${yearSuffix}`
  }
  return `${format(start, 'd')} ${month(start)} – ${format(end, 'd')} ${month(end)}${yearSuffix}`
}

/** En-têtes de `weeks` semaines consécutives à partir du lundi `firstWeekStart` ; marque la colonne du jour courant. */
export function buildDays(firstWeekStart: Date, weeks = 1): MenuDayHeader[] {
  return Array.from({ length: weeks * DAYS_PER_WEEK }, (_, index) => {
    const date = addDays(firstWeekStart, index)
    return {
      key: dayKeyOf(date),
      date,
      dayLabel: capitalize(format(date, 'EEE', { locale: fr })),
      dateLabel: format(date, 'd'),
      isSelected: isToday(date),
      isWeekStart: index % DAYS_PER_WEEK === 0,
    }
  })
}
