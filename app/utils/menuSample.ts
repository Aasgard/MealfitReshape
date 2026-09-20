import type { Ingredient } from '~/types/ingredient'
import type { MenuWeekEntries } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import type { RecipeType } from './recipeType'
import type { IngredientMacros } from './ingredientNutrition'
import { EXTRA_MEAL_KEY } from './menuEntries'
import { DAY_KEYS } from './menuWeek'
import { macrosForRecipe } from './recipeNutrition'

/** Jours (index dans `DAY_KEYS`) où l'on ajoute un dessert hors plan : vendredi et samedi. */
const EXTRA_DAY_INDEXES = [4, 5]

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
export function buildSampleWeek(recipes: Recipe[], ingredientsById: Map<string, Ingredient>): MenuWeekEntries {
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

  const entries: MenuWeekEntries = {}

  const place = (dayKey: string, mealKey: string, sample: SampleRecipe | undefined) => {
    if (!sample) return

    const day = entries[dayKey] ??= {}
    ;(day[mealKey] ??= []).push({
      id: `${dayKey}-${mealKey}-${sample.recipe.id}`,
      recipeId: sample.recipe.id,
      label: sample.recipe.title,
      kcal: Math.round(sample.macros.calories),
      carbohydrates: Math.round(sample.macros.carbohydrates),
      protein: Math.round(sample.macros.protein),
      fat: Math.round(sample.macros.fat),
    })
  }

  DAY_KEYS.forEach((dayKey, day) => {
    place(dayKey, 'petit-dej', pick(breakfasts, day))
    place(dayKey, 'dejeuner', pick(mains, day * 2))
    place(dayKey, 'diner', pick(mains, day * 2 + 1))
    place(dayKey, 'collation', pick(starters, day))
    if (EXTRA_DAY_INDEXES.includes(day)) place(dayKey, EXTRA_MEAL_KEY, pick(desserts, day))
  })

  return entries
}
