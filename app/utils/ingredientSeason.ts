import type { Ingredient } from '~/types/ingredient'
import type { Recipe } from '~/types/recipe'
import { recipeIngredientIds } from '~/utils/recipeBases'

/** Mois courant (1 = janvier), relu à chaque appel : une page restée ouverte passe au mois suivant. */
export const currentMonthNumber = () => new Date().getMonth() + 1

/** Mois précédent (1 = janvier) : décembre avant janvier. */
export const previousMonthNumber = (month: number) => (month === 1 ? 12 : month - 1)

/** Un ingrédient est "de saison" si le mois (courant par défaut) fait partie de ses `activeMonths`. */
export function isIngredientInSeason(ingredient: Pick<Ingredient, 'activeMonths'>, month = currentMonthNumber()): boolean {
  return !!ingredient.activeMonths?.includes(month)
}

/** Vrai si l'aliment n'est pas hors saison : sans mois renseignés, faute d'information, il n'est pas écarté. */
export function isIngredientSeasonCompatible(ingredient: Pick<Ingredient, 'activeMonths'>, month = currentMonthNumber()): boolean {
  return !ingredient.activeMonths?.length || isIngredientInSeason(ingredient, month)
}

/**
 * Vrai si aucun aliment de la recette n'est hors saison ce mois-là. Un aliment sans mois renseignés, ou introuvable,
 * ne compte pas comme hors saison : faute d'information, il n'écarte pas la recette.
 * Les ingrédients des bases comptent : des pickles de tomates sont hors saison avec les tomates.
 */
export function isRecipeInSeason(
  recipe: Recipe,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
  month = currentMonthNumber(),
): boolean {
  return [...recipeIngredientIds(recipe, recipesById)].every((id) => {
    const ingredient = ingredientsById.get(id)
    return !ingredient || isIngredientSeasonCompatible(ingredient, month)
  })
}

/** Catégories du catalogue concernées par le récapitulatif de saison. */
const SEASON_RECAP_CATEGORY_IDS = new Set(['fruits', 'vegetables'])

/** Fruit ou légume dont la saison ne couvre pas toute l'année (seuls ceux-là arrivent ou s'en vont). */
const isSeasonalProduce = (ingredient: Ingredient) => {
  const months = ingredient.activeMonths?.length ?? 0
  return SEASON_RECAP_CATEGORY_IDS.has(ingredient.category?.id) && months > 0 && months < 12
}

export interface SeasonChanges {
  /** Fruits et légumes de saison ce mois-ci, pas le mois d'avant. */
  arriving: Ingredient[]
  /** Fruits et légumes de saison le mois d'avant, plus ce mois-ci. */
  leaving: Ingredient[]
  /** Recettes écartées le mois d'avant par un aliment hors saison, de saison ce mois-ci. */
  returningRecipes: Recipe[]
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'fr')

/** Un seul exemplaire par nom : un ingrédient privé peut doubler celui du catalogue public. */
function uniqueByLabel(ingredients: Ingredient[]) {
  const seen = new Set<string>()
  return ingredients.filter((ingredient) => {
    const key = ingredient.label.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort(byLabel)
}

/** Ce qui change entre le mois précédent et `month` : fruits et légumes qui arrivent, qui s'en vont, recettes de retour. */
export function seasonChanges(
  ingredients: Ingredient[],
  recipes: Recipe[],
  ingredientsById: Map<string, Ingredient>,
  month = currentMonthNumber(),
): SeasonChanges {
  const previous = previousMonthNumber(month)
  const produce = ingredients.filter(isSeasonalProduce)
  const recipesById = new Map(recipes.map(recipe => [recipe.id, recipe]))
  return {
    arriving: uniqueByLabel(produce.filter(i => isIngredientInSeason(i, month) && !isIngredientInSeason(i, previous))),
    leaving: uniqueByLabel(produce.filter(i => isIngredientInSeason(i, previous) && !isIngredientInSeason(i, month))),
    returningRecipes: recipes
      .filter(recipe => !isRecipeInSeason(recipe, recipesById, ingredientsById, previous)
        && isRecipeInSeason(recipe, recipesById, ingredientsById, month))
      .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
  }
}
