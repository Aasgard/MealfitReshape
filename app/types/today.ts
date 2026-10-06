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

/** Un repas de la liste "Manger" de l'accueil, avec ce qui a été enregistré dedans. */
export type TodayMealRow = MealSlot & {
  kcal: number
  entries: MenuEntry[]
}

/** Un récipient à remplir pour une recette de la liste "Cuisiner" : les parts d'un repas. */
export type TodayCookingPortion = {
  key: string
  /** Repas, seulement quand la recette revient à plusieurs repas ce jour-là (sinon le jour suffit). */
  meal?: { label: string, icon: string }
  parts: number
}

/** Les récipients d'un même jour, écrits derrière un seul libellé. Ex : "Auj. ☀ 1 🌇 0,5". */
export type TodayCookingDay = {
  key: string
  /** Jour abrégé. Ex : "Auj.", "Dem.", "Ven.". */
  label: string
  portions: TodayCookingPortion[]
}

/** Une recette de la liste "Cuisiner" de l'accueil, à préparer en une fois. */
export type TodayCookingRecipe = {
  recipeId: string
  title: string
  /** Photo de la recette, affichée à la place de l'icône. */
  imageUrl?: string
  /** Répartition des parts par jour puis par repas, pour savoir comment la conditionner. */
  days: TodayCookingDay[]
  /** Somme des parts de ces repas. */
  parts: number
}
