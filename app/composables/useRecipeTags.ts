import { collection, doc, updateDoc } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Recipe } from '~/types/recipe'
import { cleanRecipeTag, recipeTagKey, recipeTagVocabulary, renameInRecipeTags } from '~/utils/recipeTags'

/** Bilan d'un renommage : recettes modifiées, et celles que Firestore a refusées (recettes d'autres membres) ou ratées. */
export interface RecipeTagRenameResult {
  updated: number
  denied: number
  failed: number
  /** Remet les tags d'avant sur les recettes modifiées. */
  undo: () => Promise<void>
}

/**
 * Vocabulaire de tags commun à toutes les recettes visibles (le foyer partage une seule liste),
 * et renommage d'un tag sur toutes les recettes qui le portent.
 */
export function useRecipeTags() {
  const db = useFirestore()
  const user = useCurrentUser()

  const recipes = useCollection<Recipe>(() => (user.value ? collection(db, 'recipes') : null))

  const vocabulary = computed(() => recipeTagVocabulary(recipes.value ?? []))
  const loading = computed(() => !user.value || (recipes.pending.value && !recipes.value.length))

  /**
   * Renomme le tag `fromKey` en `to` sur chaque recette qui le porte. Si `to` est déjà un tag, les deux fusionnent :
   * toutes leurs orthographes deviennent `to`. Chaque recette est écrite à part, pour que celles qu'on n'a pas le droit
   * de modifier n'empêchent pas les autres.
   */
  async function rename(fromKey: string, to: string): Promise<RecipeTagRenameResult> {
    const label = cleanRecipeTag(to)
    if (!label) throw new Error('Le nouveau nom est vide.')
    const keys = new Set([fromKey, recipeTagKey(label)])

    const changes = (recipes.value ?? [])
      .map(r => ({ id: r.id, before: r.tags ?? [], tags: renameInRecipeTags(r.tags ?? [], keys, label) }))
      .filter((c): c is { id: string, before: string[], tags: string[] } => c.tags !== null)

    const results = await Promise.allSettled(changes.map(c => updateDoc(doc(db, 'recipes', c.id), { tags: c.tags })))
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    const denied = rejected.filter(r => (r.reason as { code?: string })?.code === 'permission-denied').length
    const done = changes.filter((_, i) => results[i]!.status === 'fulfilled')

    return {
      updated: done.length,
      denied,
      failed: rejected.length - denied,
      undo: async () => {
        await Promise.all(done.map(c => updateDoc(doc(db, 'recipes', c.id), { tags: c.before })))
      },
    }
  }

  return { vocabulary, loading, rename }
}
