import type { MealType } from './meal'
import type { MenuEntry } from './menu'

/** Un repas de la journée : sa ligne du calendrier des menus et son objectif éventuel. */
export type MealSlot = {
  mealType: MealType
  label: string
  /** Objectif kcal du repas ; absent pour les lignes hors plan ("En plus", "Non compté"). */
  targetKcal?: number
  /** Précision affichée pour les lignes hors plan. Ex : "Hors totaux". */
  note?: string
}

/** Un repas de la liste "Alimentation" de l'accueil, avec ce qui a été enregistré dedans. */
export type TodayMealRow = MealSlot & {
  kcal: number
  entries: MenuEntry[]
}

/** Un jour du graphique "7 derniers jours". */
export type TodayTrendDay = {
  key: string
  /** Initiale du jour : "L", "M"... */
  label: string
  /** Ex : "lundi 21 septembre" (info-bulle). */
  fullLabel: string
  kcal: number
  isToday: boolean
}
