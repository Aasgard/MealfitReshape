import type { RecipeIngredientLine } from '~/types/recipe'

type SourcedLine = Pick<RecipeIngredientLine, 'ingredientRef' | 'recipeRef'>

/**
 * Id d'une référence Firestore telle que VueFire la donne : document résolu (ou `DocumentReference`), ou son chemin
 * (« recipes/abc ») tant qu'elle n'est pas encore résolue ou au-delà de la profondeur résolue.
 */
export const refId = (ref: unknown): string | undefined => {
  if (typeof ref === 'string') return ref.split('/').pop() || undefined
  return (ref as { id?: string } | null | undefined)?.id || undefined
}

/** Clé de l'ingrédient virtuel d'une recette de base dans `ingredientsById` (voir `withRecipeBases`). */
export const baseKey = (recipeId: string) => `recipe:${recipeId}`

/** Clé de ce que la ligne utilise dans `ingredientsById` : l'id de l'ingrédient, ou la clé virtuelle de la base. */
export const lineSourceKey = (line: SourcedLine): string | undefined => {
  const ingredientId = refId(line.ingredientRef)
  if (ingredientId) return ingredientId
  const baseId = refId(line.recipeRef)
  return baseId ? baseKey(baseId) : undefined
}

/** Id de la recette de base qu'utilise la ligne, `undefined` pour une ligne d'ingrédient. */
export const lineBaseId = (line: SourcedLine): string | undefined =>
  refId(line.ingredientRef) ? undefined : refId(line.recipeRef)

/** La ligne prend une partie d'une recette de base plutôt qu'un ingrédient du catalogue. */
export const isBaseLine = (line: SourcedLine) => !!lineBaseId(line)

/** Id de la recette de base derrière une clé de `ingredientsById`, `null` pour un ingrédient du catalogue. */
export const baseIdOfKey = (key: string | null | undefined): string | null =>
  key?.startsWith('recipe:') ? key.slice('recipe:'.length) : null
