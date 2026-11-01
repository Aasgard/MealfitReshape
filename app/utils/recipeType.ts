/** Type de recette, stocké tel quel côté Firestore (`recipes.type`). */
export type RecipeType = 'BREAKFAST' | 'STARTER' | 'MAIN DISH' | 'DESSERT' | 'BASE'

export const RECIPE_TYPES: RecipeType[] = ['BREAKFAST', 'STARTER', 'MAIN DISH', 'DESSERT', 'BASE']

/** Types qu'on sert en repas : une base (pickles, sauce) n'entre dans les menus qu'à travers les plats qui l'utilisent. */
export const MEAL_RECIPE_TYPES: RecipeType[] = RECIPE_TYPES.filter(t => t !== 'BASE')

export const isBaseRecipe = (recipe: { type?: string } | null | undefined) => recipe?.type === 'BASE'

const RECIPE_TYPE_LABELS: Record<RecipeType, string> = {
  BREAKFAST: 'Petit-déjeuner',
  STARTER: 'Entrée',
  'MAIN DISH': 'Plat',
  DESSERT: 'Dessert',
  BASE: 'Base',
}

export function recipeTypeLabel(type: string | undefined | null): string {
  if (!type) return 'Non renseigné'
  return RECIPE_TYPE_LABELS[type as RecipeType] ?? type
}

const RECIPE_TYPE_ICONS: Record<RecipeType, string> = {
  BREAKFAST: 'i-lucide-coffee',
  STARTER: 'i-lucide-salad',
  'MAIN DISH': 'i-lucide-utensils-crossed',
  DESSERT: 'i-lucide-cake-slice',
  BASE: 'i-lucide-cooking-pot',
}

/** Icône du type de repas (colonne compacte du tableau des recettes) ; `null` si le type est absent ou inconnu. */
export function recipeTypeIcon(type: string | undefined | null): string | null {
  if (!type) return null
  return RECIPE_TYPE_ICONS[type as RecipeType] ?? null
}
