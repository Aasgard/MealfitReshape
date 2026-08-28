/** Type de recette, stocké tel quel côté Firestore (`recipes.type`). */
export type RecipeType = 'BREAKFAST' | 'STARTER' | 'MAIN DISH' | 'DESSERT'

export const RECIPE_TYPES: RecipeType[] = ['BREAKFAST', 'STARTER', 'MAIN DISH', 'DESSERT']

const RECIPE_TYPE_LABELS: Record<RecipeType, string> = {
  BREAKFAST: 'Petit-déjeuner',
  STARTER: 'Entrée',
  'MAIN DISH': 'Plat',
  DESSERT: 'Dessert',
}

export function recipeTypeLabel(type: string | undefined | null): string {
  if (!type) return 'Non renseigné'
  return RECIPE_TYPE_LABELS[type as RecipeType] ?? type
}
