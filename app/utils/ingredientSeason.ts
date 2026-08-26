import type { Ingredient } from '~/types/ingredient'

const currentMonth = new Date().getMonth() + 1

/** Un ingrédient est "de saison" si le mois courant fait partie de ses `activeMonths`. */
export function isIngredientInSeason(ingredient: Pick<Ingredient, 'activeMonths'>): boolean {
  return !!ingredient.activeMonths?.includes(currentMonth)
}
