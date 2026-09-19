import type { Ingredient } from '~/types/ingredient'
import type { MenuEntry, MenuWeekMacroBalance } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import type { RecipeType } from './recipeType'
import type { IngredientMacros } from './ingredientNutrition'
import { DAY_KEYS } from './menuWeek'
import { macrosForRecipe } from './recipeNutrition'

/** Ligne "Hors plan" du calendrier : repas hors objectif, comptés comme dérapages. */
const EXTRA_MEAL_KEY = 'en-plus'

/** Jours (index dans `DAY_KEYS`) où l'on ajoute un dessert hors plan : vendredi et samedi. */
const EXTRA_DAY_INDEXES = [4, 5]

export interface SampleWeek {
  /** Repas par jour puis par type de repas : entries[dayKey][mealTypeKey]. */
  entries: Record<string, Record<string, MenuEntry[]>>
  dayTotals: Record<string, number>
  stats: {
    averageKcal: number
    overagePerDayKcal: number
    overageCount: number
    overageTotalKcal: number
    macros: MenuWeekMacroBalance
  }
}

interface SampleRecipe {
  recipe: Recipe
  macros: IngredientMacros
}

/**
 * Semaine d'exemple bâtie à partir de vraies recettes (Firestore `recipes`), en attendant que la page
 * lise et écrive de vrais menus. Déterministe : le même catalogue donne toujours la même semaine
 * (pas d'aléatoire, pour rester stable entre rendu serveur et client).
 * Les recettes sans kcal calculable (ingrédients ou valeurs manquants) sont ignorées.
 */
export function buildSampleWeek(recipes: Recipe[], ingredientsById: Map<string, Ingredient>): SampleWeek {
  const samples: SampleRecipe[] = recipes
    .map(recipe => ({ recipe, macros: macrosForRecipe(recipe.ingredients, ingredientsById, recipe.persons ?? 1) }))
    .filter(({ macros }) => Math.round(macros.calories) > 0)

  const poolOf = (type: RecipeType) => samples.filter(({ recipe }) => recipe.type === type)
  const breakfasts = poolOf('BREAKFAST')
  const mains = poolOf('MAIN DISH')
  const starters = poolOf('STARTER')
  const desserts = poolOf('DESSERT')

  const pick = (pool: SampleRecipe[], index: number): SampleRecipe | undefined =>
    pool.length ? pool[index % pool.length] : undefined

  const entries: SampleWeek['entries'] = {}
  const dayTotals: SampleWeek['dayTotals'] = {}
  const macroTotals = { protein: 0, carbohydrates: 0, fat: 0 }
  let overageTotalKcal = 0
  let overageCount = 0
  let kcalTotal = 0

  const place = (dayKey: string, mealKey: string, sample: SampleRecipe | undefined) => {
    if (!sample) return
    const kcal = Math.round(sample.macros.calories)

    entries[dayKey] ??= {}
    entries[dayKey][mealKey] ??= []
    entries[dayKey][mealKey].push({
      id: `${dayKey}-${mealKey}-${sample.recipe.id}`,
      recipeId: sample.recipe.id,
      label: sample.recipe.title,
      kcal,
      carbohydrates: Math.round(sample.macros.carbohydrates),
      protein: Math.round(sample.macros.protein),
      fat: Math.round(sample.macros.fat),
    })

    dayTotals[dayKey] = (dayTotals[dayKey] ?? 0) + kcal
    kcalTotal += kcal
    macroTotals.protein += sample.macros.protein
    macroTotals.carbohydrates += sample.macros.carbohydrates
    macroTotals.fat += sample.macros.fat

    if (mealKey === EXTRA_MEAL_KEY) {
      overageTotalKcal += kcal
      overageCount++
    }
  }

  DAY_KEYS.forEach((dayKey, day) => {
    place(dayKey, 'petit-dej', pick(breakfasts, day))
    place(dayKey, 'dejeuner', pick(mains, day * 2))
    place(dayKey, 'diner', pick(mains, day * 2 + 1))
    place(dayKey, 'collation', pick(starters, day))
    if (EXTRA_DAY_INDEXES.includes(day)) place(dayKey, EXTRA_MEAL_KEY, pick(desserts, day))
  })

  const dayCount = DAY_KEYS.length
  const perDay = (value: number) => Math.round(value / dayCount)

  return {
    entries,
    dayTotals,
    stats: {
      averageKcal: perDay(kcalTotal),
      overagePerDayKcal: perDay(overageTotalKcal),
      overageCount,
      overageTotalKcal,
      macros: {
        protein: perDay(macroTotals.protein),
        carbohydrates: perDay(macroTotals.carbohydrates),
        fat: perDay(macroTotals.fat),
      },
    },
  }
}
