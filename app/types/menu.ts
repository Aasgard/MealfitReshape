/** Une semaine sélectionnable dans le sélecteur de semaines (bande de petites cartes). */
export interface MenuWeekOption {
  id: string
  /** Ex: "7-13 sept" */
  rangeLabel: string
  isCurrent?: boolean
}

/** Répartition hebdomadaire des macros (grammes), pour la carte "Équilibre de la semaine". */
export interface MenuWeekMacroBalance {
  protein: number
  carbohydrates: number
  fat: number
}

/** Un jour affiché en en-tête de colonne du calendrier. */
export interface MenuDayHeader {
  key: string
  /** Ex: "Lun." */
  dayLabel: string
  /** Ex: "14" */
  dateLabel: string
  isSelected?: boolean
}

/** Une ligne du calendrier (un type de repas : Petit déj, Déjeuner, ...). */
export interface MenuMealTypeRow {
  key: string
  label: string
  /** Ex: "~488 kcal" */
  avgLabel?: string
}

/** Un repas/aliment placé dans une case du calendrier. */
export interface MenuEntry {
  id: string
  label: string
  kcal: number
}
