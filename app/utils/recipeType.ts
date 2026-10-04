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

const RECIPE_TYPE_ICONS: Record<RecipeType, string> = {
  BREAKFAST: 'i-lucide-coffee',
  STARTER: 'i-lucide-salad',
  'MAIN DISH': 'i-lucide-utensils-crossed',
  DESSERT: 'i-lucide-cake-slice',
}

/** Icône du type de repas (colonne compacte du tableau des recettes) ; `null` si le type est absent ou inconnu. */
export function recipeTypeIcon(type: string | undefined | null): string | null {
  if (!type) return null
  return RECIPE_TYPE_ICONS[type as RecipeType] ?? null
}
