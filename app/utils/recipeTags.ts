import type { Recipe } from '~/types/recipe'
import { normalizeForSearch } from '~/utils/search'

/** Tag du vocabulaire commun : une orthographe retenue pour toutes celles qui se comparent pareil. */
export interface RecipeTag {
  /** Clé de comparaison (sans accents, majuscules ni espaces en trop). */
  key: string
  /** Orthographe retenue : la plus fréquente, la première rencontrée en cas d'égalité. */
  label: string
  /** Nombre de recettes portant ce tag. */
  count: number
  /** Autres orthographes rencontrées, de la plus à la moins fréquente. */
  variants: string[]
}

/** Clé de comparaison d'un tag : « Végé », « vege » et « végé » se confondent. */
export function recipeTagKey(tag: string): string {
  return normalizeForSearch(tag).replace(/\s+/g, ' ')
}

/** Nettoie une saisie de tag : espaces superflus retirés ; vide = pas un tag. */
export function cleanRecipeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ')
}

/** Vocabulaire commun aux recettes, du tag le plus utilisé au moins utilisé, puis par ordre alphabétique. */
export function recipeTagVocabulary(recipes: readonly Pick<Recipe, 'tags'>[]): RecipeTag[] {
  const byKey = new Map<string, { count: number, spellings: Map<string, number> }>()
  for (const recipe of recipes) {
    const seen = new Set<string>()
    for (const raw of recipe.tags ?? []) {
      const label = cleanRecipeTag(raw)
      const key = recipeTagKey(label)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const entry = byKey.get(key) ?? { count: 0, spellings: new Map<string, number>() }
      entry.count++
      entry.spellings.set(label, (entry.spellings.get(label) ?? 0) + 1)
      byKey.set(key, entry)
    }
  }

  return [...byKey].map(([key, { count, spellings }]) => {
    // Le tri est stable : à fréquence égale, l'orthographe rencontrée en premier reste devant.
    const ordered = [...spellings].sort((a, b) => b[1] - a[1]).map(([label]) => label)
    return { key, label: ordered[0]!, count, variants: ordered.slice(1) }
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
}

/** Aligne une saisie sur l'orthographe déjà retenue dans le vocabulaire ; sinon la garde telle quelle (nettoyée). */
export function canonicalRecipeTag(tag: string, vocabulary: readonly RecipeTag[]): string {
  const label = cleanRecipeTag(tag)
  const key = recipeTagKey(label)
  return vocabulary.find(t => t.key === key)?.label ?? label
}

/** Retire les tags vides et les doublons (à la comparaison près), en gardant la première occurrence. */
export function dedupeRecipeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const label = cleanRecipeTag(raw)
    const key = recipeTagKey(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(label)
  }
  return result
}

/**
 * Tags d'une recette après renommage : chaque tag dont la clé figure dans `fromKeys` devient `to`,
 * à la place du premier remplacé ; `null` quand la recette n'est pas concernée ou ne change pas.
 */
export function renameInRecipeTags(tags: readonly string[], fromKeys: ReadonlySet<string>, to: string): string[] | null {
  if (!tags.some(t => fromKeys.has(recipeTagKey(t)))) return null
  const next = dedupeRecipeTags(tags.map(t => (fromKeys.has(recipeTagKey(t)) ? to : t)))
  return next.length === tags.length && next.every((t, i) => t === tags[i]) ? null : next
}
