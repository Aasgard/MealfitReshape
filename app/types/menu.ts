import type { MealType } from './meal'

/** Macros en grammes : d'un jour, ou moyenne par jour d'une semaine. */
export interface MenuWeekMacroBalance {
  protein: number
  carbohydrates: number
  fat: number
}

/** Un jour affiché en en-tête de colonne du calendrier. */
export interface MenuDayHeader {
  /** Date ISO du jour (voir `dayKeyOf`). */
  key: string
  date: Date
  /** Ex: "Lun." */
  dayLabel: string
  /** Ex: "14" */
  dateLabel: string
  isSelected?: boolean
  /** Lundi : début d'une semaine, marqué quand le calendrier en enchaîne plusieurs. */
  isWeekStart?: boolean
}

/** Une ligne du calendrier (un type de repas : Petit déj, Déjeuner, ...). */
export interface MenuMealTypeRow {
  key: MealType
  /** Nom complet, lu au survol et par les lecteurs d'écran (la colonne n'affiche que l'icône). */
  label: string
  /** Icône affichée dans la première colonne du calendrier. Ex: "i-lucide-sun" */
  icon: string
  /** Sous-titre affiché sous le libellé. Ex: "Hors plan" */
  avgLabel?: string
}

/** Repas par jour (date ISO) puis par type de repas : entries[dayKey][mealTypeKey]. */
export type MenuWeekEntries = Record<string, Record<string, MenuEntry[]>>

/** Un repas/aliment placé dans une case du calendrier. */
export interface MenuEntry {
  id: string
  /** Recette (Firestore `recipes`) dont provient ce repas ; sert à ouvrir sa fiche au clic. Absent pour un aliment ou des macros saisies à la main. */
  recipeId?: string
  /** Aliment (Firestore `ingredients`) dont provient ce repas ; sert à ouvrir sa fiche au clic. */
  ingredientId?: string
  label: string
  /** Quantité affichée sur la carte : "2 parts" pour une recette, "150 g" / "2 × tranche" pour un aliment. Absent pour des macros saisies à la main. */
  quantityLabel?: string
  /** Parts de la recette mangées dans ce repas ; absent pour un aliment ou des macros saisies à la main. */
  parts?: number
  kcal: number
  /** Macros d'une part, en grammes arrondis (affichées "G62 P41 L15" : glucides, protéines, lipides). */
  carbohydrates: number
  protein: number
  fat: number
}
