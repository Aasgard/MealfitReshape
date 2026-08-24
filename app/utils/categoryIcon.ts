/**
 * `ingredientCategories.icon` est stocké en base sous forme de nom Lucide nu (ex. "carrot"),
 * seedé par `scripts/seed-data/ingredientCategories.cjs`. `UIcon`/Nuxt Icon attend un
 * identifiant complet ("i-lucide-carrot") comme partout ailleurs dans l'app.
 */
export function categoryIconName(icon: string | undefined | null): string | undefined {
  if (!icon) return undefined
  return icon.startsWith('i-') ? icon : `i-lucide-${icon}`
}
