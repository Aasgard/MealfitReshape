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

/** Une recette de la liste "À cuisiner" de l'accueil, à préparer en une fois. */
export type TodayCookingRecipe = {
  recipeId: string
  title: string
  /** Photo de la recette, affichée à la place de l'icône. */
  imageUrl?: string
  /** Jours où elle est mangée. Ex : "Aujourd'hui, jeudi, samedi". */
  daysLabel: string
  /** Somme des parts de ces jours. */
  parts: number
}
