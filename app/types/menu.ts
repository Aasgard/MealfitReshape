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
  /** Sous-titre affiché sous le libellé. Ex: "Hors plan" */
  avgLabel?: string
}

/** Repas d'une semaine, par jour puis par type de repas : entries[dayKey][mealTypeKey]. */
export type MenuWeekEntries = Record<string, Record<string, MenuEntry[]>>

/** Un repas/aliment placé dans une case du calendrier. */
export interface MenuEntry {
  id: string
  /** Recette (Firestore `recipes`) dont provient ce repas ; sert à ouvrir sa fiche au clic. Absent pour un aliment ou des macros saisies à la main. */
  recipeId?: string
  label: string
  /** Quantité affichée sur la carte : "2 parts" pour une recette, "150 g" / "2 × tranche" pour un aliment. Absent pour des macros saisies à la main. */
  quantityLabel?: string
  kcal: number
  /** Macros d'une part, en grammes arrondis (affichées "G62 P41 L15" : glucides, protéines, lipides). */
  carbohydrates: number
  protein: number
  fat: number
}
