import { differenceInCalendarDays } from 'date-fns'
import type { Ingredient } from '~/types/ingredient'
import type { Meal, MealSource, MealType } from '~/types/meal'
import type { MenuEntry, MenuMealTypeRow, MenuWeekEntries, MenuWeekMacroBalance } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { macrosForQuantity, type IngredientMacros } from './ingredientNutrition'
import { dayKeyOf, DAYS_PER_WEEK } from './menuWeek'
import { macrosForRecipe } from './recipeNutrition'

/** Ligne "Hors plan" du calendrier : repas hors objectif, comptés comme dérapages. */
export const EXTRA_MEAL_KEY: MealType = 'EXCESS'

/** Ligne "Non compté" du calendrier : repas exclus des totaux (kcal, macros, dérapages) du bas de page. */
export const UNCOUNTED_MEAL_KEY: MealType = 'NOTCOUNT'

/** Lignes du calendrier, dans leur ordre d'affichage. */
export const MENU_MEAL_TYPES: MenuMealTypeRow[] = [
  { key: 'BREAKFAST', label: 'Petit déj', icon: 'i-lucide-sunrise' },
  { key: 'LUNCH', label: 'Déjeuner', icon: 'i-lucide-sun' },
  { key: 'DINER', label: 'Diner', icon: 'i-lucide-sunset' },
  { key: 'SNACK', label: 'Collation', icon: 'i-lucide-cookie' },
  { key: EXTRA_MEAL_KEY, label: 'En plus', avgLabel: 'Hors plan', icon: 'i-lucide-candy-off' },
  { key: UNCOUNTED_MEAL_KEY, label: 'Non compté', avgLabel: 'Hors totaux', icon: 'i-lucide-save-off' },
]

/** Lignes qui doivent être remplies pour qu'un jour compte dans les moyennes de la semaine. */
const COMPLETE_DAY_MEALS: MealType[] = ['LUNCH', 'DINER']

/** Un jour est complet quand son déjeuner et son dîner contiennent chacun au moins un élément. */
export const isCompleteDay = (entries: Record<string, MenuEntry[]> | undefined) =>
  COMPLETE_DAY_MEALS.every(mealType => !!entries?.[mealType]?.length)

export interface MenuWeekSummary {
  /** Jours complets (voir `isCompleteDay`) : seuls comptés dans les moyennes. */
  completeDays: number
  /** Moyennes par jour complet, "En plus" compris, "Non compté" exclu (voir `summarizeDay`). */
  averageKcal: number
  averageExtraKcal: number
  macros: MenuWeekMacroBalance
}

/**
 * Moyennes par jour de la semaine (`dayKeys`) : un jour incomplet est retiré du total comme du nombre de jours, pour
 * qu'une semaine en cours de planification ne fasse pas baisser la moyenne.
 */
export function summarizeMenuWeek(entries: MenuWeekEntries, dayKeys: string[]): MenuWeekSummary {
  const days = dayKeys.map(key => entries[key]).filter(isCompleteDay).map(day => summarizeDay(day!))
  const perDay = (pick: (day: DaySummary) => number) =>
    days.length ? Math.round(days.reduce((total, day) => total + pick(day), 0) / days.length) : 0

  return {
    completeDays: days.length,
    averageKcal: perDay(day => day.kcal),
    averageExtraKcal: perDay(day => day.extraKcal),
    macros: {
      protein: perDay(day => day.macros.protein),
      carbohydrates: perDay(day => day.macros.carbohydrates),
      fat: perDay(day => day.macros.fat),
    },
  }
}

/** Repas prêt à être placé dans une case : un `MenuEntry` dont l'identifiant est attribué à l'insertion. */
export type MenuEntryDraft = Omit<MenuEntry, 'id'>

const formatQuantity = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

function draftFromMacros(label: string, macros: IngredientMacros, extra: Partial<MenuEntryDraft> = {}): MenuEntryDraft {
  return {
    ...extra,
    label,
    kcal: Math.round(macros.calories),
    carbohydrates: Math.round(macros.carbohydrates),
    protein: Math.round(macros.protein),
    fat: Math.round(macros.fat),
  }
}

/** Repas pour `parts` parts d'une recette (une part = `persons` de la recette). */
export function buildRecipeDraft(recipe: Recipe, parts: number, ingredientsById: Map<string, Ingredient>): MenuEntryDraft {
  // macrosForRecipe divise le total par `persons` : passer persons / parts donne total * parts / persons, sans double arrondi.
  const macros = macrosForRecipe(recipe.ingredients, ingredientsById, (recipe.persons ?? 1) / parts)
  const quantityLabel = `${formatQuantity(parts)} part${parts > 1 ? 's' : ''}`
  return draftFromMacros(recipe.title, macros, { recipeId: recipe.id, parts, quantityLabel })
}

/** Repas pour `quantity` grammes d'un ingrédient (`unitId` `null`) ou `quantity` fois l'une de ses unités ; `null` si non calculable. */
export function buildIngredientDraft(ingredient: Ingredient, unitId: string | null, quantity: number): MenuEntryDraft | null {
  const macros = macrosForQuantity(ingredient, unitId, quantity)
  if (!macros) return null

  const unitLabel = unitId == null ? undefined : ingredient.units?.[unitId]?.label
  const quantityLabel = unitLabel ? `${formatQuantity(quantity)} × ${unitLabel}` : `${formatQuantity(quantity)} g`
  return draftFromMacros(ingredient.label, macros, { ingredientId: ingredient.id, quantityLabel })
}

/** Repas saisi à la main : un libellé et des macros brutes. */
export function buildManualDraft(label: string, macros: IngredientMacros): MenuEntryDraft {
  return draftFromMacros(label, macros)
}

/** Ce qui a été mangé, sans le contexte du repas : de quoi en créer un autre exemplaire (copier / coller). */
export function mealSourceOf(meal: Meal): MealSource {
  switch (meal.category) {
    case 'RECIPE':
      return { category: 'RECIPE', recipeId: meal.recipeId, value: meal.value }
    case 'INGREDIENT':
      return { category: 'INGREDIENT', ingredientId: meal.ingredientId, unitId: meal.unitId ?? null, quantity: meal.quantity }
    case 'RAW':
      return {
        category: 'RAW',
        label: meal.label,
        calories: meal.calories,
        protein: meal.protein,
        fat: meal.fat,
        carbohydrates: meal.carbohydrates,
      }
  }
}

/** `null` si la recette ou l'aliment référencé n'existe plus (ou si ses macros ne sont plus calculables). */
function draftFromMeal(meal: Meal, recipesById: Map<string, Recipe>, ingredientsById: Map<string, Ingredient>): MenuEntryDraft | null {
  switch (meal.category) {
    case 'RECIPE': {
      const recipe = recipesById.get(meal.recipeId)
      return recipe ? buildRecipeDraft(recipe, meal.value, ingredientsById) : null
    }
    case 'INGREDIENT': {
      const ingredient = ingredientsById.get(meal.ingredientId)
      return ingredient ? buildIngredientDraft(ingredient, meal.unitId ?? null, meal.quantity) : null
    }
    case 'RAW':
      return buildManualDraft(meal.label, meal)
  }
}

/** Carte du calendrier pour un repas enregistré ; une recette ou un aliment supprimé depuis s'affiche "introuvable" (0 kcal) plutôt que de disparaître. */
export function entryFromMeal(meal: Meal, recipesById: Map<string, Recipe>, ingredientsById: Map<string, Ingredient>): MenuEntry {
  const draft = draftFromMeal(meal, recipesById, ingredientsById)
  if (draft) return { ...draft, id: meal.id }

  return {
    id: meal.id,
    label: meal.category === 'RECIPE' ? 'Recette introuvable' : 'Aliment introuvable',
    kcal: 0,
    carbohydrates: 0,
    protein: 0,
    fat: 0,
  }
}

/** Position du jour d'un repas dans la semaine commençant à `weekStart` (0 = lundi) ; hors de 0-6 s'il tombe une autre semaine. */
const dayIndexOf = (meal: Meal, weekStart: Date) => differenceInCalendarDays(meal.date.toDate(), weekStart)

const byCreation = (a: Meal, b: Meal) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)

/** Repas de la semaine commençant à `weekStart`, dans leur ordre d'ajout. */
export function mealsOfWeek(meals: Meal[], weekStart: Date): Meal[] {
  return meals
    .filter((meal) => {
      const index = dayIndexOf(meal, weekStart)
      return index >= 0 && index < DAYS_PER_WEEK
    })
    .sort(byCreation)
}

/** Repas d'un jour (jour calendaire, heure locale), dans leur ordre d'ajout. */
export function mealsOfDay(meals: Meal[], day: Date): Meal[] {
  return meals
    .filter(meal => differenceInCalendarDays(meal.date.toDate(), day) === 0)
    .sort(byCreation)
}

/** Repas d'un jour rangés par ligne du calendrier (`BREAKFAST`, `LUNCH`...), prêts pour l'affichage. */
export function buildDayEntries(
  meals: Meal[],
  day: Date,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>
): Record<string, MenuEntry[]> {
  const entries: Record<string, MenuEntry[]> = {}
  for (const meal of mealsOfDay(meals, day)) {
    (entries[meal.mealType] ??= []).push(entryFromMeal(meal, recipesById, ingredientsById))
  }
  return entries
}

export type DaySummary = {
  /** Kcal du jour, "En plus" compris, "Non compté" exclu. */
  kcal: number
  /** Part "En plus" de ces kcal. */
  extraKcal: number
  /** Macros du jour (grammes arrondis), "Non compté" exclu. */
  macros: MenuWeekMacroBalance
}

/** Totaux d'une journée : "Non compté" exclu, "En plus" compris (et détaillé à part). */
export function summarizeDay(entries: Record<string, MenuEntry[]>): DaySummary {
  const summary: DaySummary = { kcal: 0, extraKcal: 0, macros: { carbohydrates: 0, protein: 0, fat: 0 } }
  for (const [mealKey, list] of Object.entries(entries)) {
    if (mealKey === UNCOUNTED_MEAL_KEY) continue

    for (const entry of list) {
      summary.kcal += entry.kcal
      summary.macros.carbohydrates += entry.carbohydrates
      summary.macros.protein += entry.protein
      summary.macros.fat += entry.fat
      if (mealKey === EXTRA_MEAL_KEY) summary.extraKcal += entry.kcal
    }
  }
  return summary
}

/** Repas rangés par jour (`yyyy-MM-dd`, voir `dayKeyOf`) puis par ligne du calendrier, dans leur ordre d'ajout. */
export function buildEntriesByDay(
  meals: Meal[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>
): MenuWeekEntries {
  const entries: MenuWeekEntries = {}
  for (const meal of [...meals].sort(byCreation)) {
    const day = entries[dayKeyOf(meal.date.toDate())] ??= {}
    ;(day[meal.mealType] ??= []).push(entryFromMeal(meal, recipesById, ingredientsById))
  }
  return entries
}

/**
 * Ce que la journée contient déjà, pour le filtre « Dans mes objectifs » de la modale d'ajout :
 * mêmes règles que `summarizeDay` (« Non compté » exclu), sans le repas en cours de modification.
 */
export function consumedOfDay(
  entries: Record<string, MenuEntry[]>,
  excludeEntryId?: string | null
): { calories: number, carbohydrates: number, protein: number, fat: number } {
  const kept = Object.fromEntries(
    Object.entries(entries).map(([mealKey, list]) => [mealKey, list.filter(e => e.id !== excludeEntryId)])
  )
  const { kcal, macros } = summarizeDay(kept)
  return { calories: kcal, ...macros }
}
