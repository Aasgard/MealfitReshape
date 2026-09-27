import type { Recipe } from '~/types/recipe'

/**
 * Recettes contenant l'ingrédient, ou seulement l'une de ses unités si `unitId` est fourni.
 * `line.ingredientRef.id` fonctionne que VueFire ait résolu la référence ou non.
 */
export function recipesUsingIngredient(recipes: Recipe[], ingredientId: string, unitId?: string): Recipe[] {
  return recipes.filter(r => (r.ingredients ?? []).some(line =>
    line.ingredientRef?.id === ingredientId && (unitId === undefined || line.unit === unitId)
  ))
}

/** Titres des recettes pour un message : « A », « B » et 2 autres. */
export function formatRecipeTitles(recipes: Recipe[], max = 3): string {
  const titles = recipes.slice(0, max).map(r => `« ${r.title} »`)
  const rest = recipes.length - titles.length
  if (rest > 0) return `${titles.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`
  if (titles.length <= 1) return titles.join('')
  return `${titles.slice(0, -1).join(', ')} et ${titles.at(-1)}`
}
