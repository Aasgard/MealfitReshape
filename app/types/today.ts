import type { MealType } from './meal'
import type { MenuEntry } from './menu'
import type { DishStorage } from './preparedDish'

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
  /** "Décongeler" : jour déjà arrivé alors que ses parts sont encore au congélateur. */
  isLate?: boolean
}

/** Une recette de la liste "Cuisiner" de l'accueil, à préparer en une fois. */
export type TodayCookingRecipe = {
  recipeId: string
  /** Jour où elle se cuisine, `yyyy-MM-dd`. */
  cookDay: string
  title: string
  /** Photo de la recette, affichée à la place de l'icône. */
  imageUrl?: string
  /** Répartition des parts par jour puis par repas, pour savoir comment la conditionner. */
  days: TodayCookingDay[]
  /** Somme des parts de ces repas, surplus pour le stock compris. */
  parts: number
  /** Parts que fait la recette : alerte quand `parts` n'en fait pas un nombre entier. */
  persons?: number
  /** Parts cuisinées en plus pour le stock, et où elles seront rangées. */
  surplus?: { parts: number, storage: DishStorage }
}

/** Un repas d'un plat à sortir du congélateur, tel que listé dans la confirmation. */
export type TodayThawMeal = {
  mealId: string
  /** Ex : "Demain · Déjeuner". */
  label: string
  parts: number
  /** Membre du foyer à qui est ce repas ; absent pour le compte connecté. */
  memberName?: string
}

/** Un plat de la liste "Décongeler" de l'accueil : ses repas encore au congélateur, à sortir la veille. */
export type TodayThawDish = {
  dishId: string
  title: string
  /** Recette d'origine, pour ouvrir sa fiche ; photo affichée à la place de l'icône. */
  recipeId?: string
  imageUrl?: string
  /** Répartition des parts par jour puis par repas, écrite comme dans "Cuisiner". */
  days: TodayCookingDay[]
  /** Somme des parts de ces repas. */
  parts: number
  /** Un repas du jour même est encore au congélateur : il aurait dû sortir la veille. */
  isLate: boolean
  meals: TodayThawMeal[]
}
