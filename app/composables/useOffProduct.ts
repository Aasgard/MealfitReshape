import type { OffResponse } from '~/utils/offNutrition'

const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/'

export type OffLookupState =
  | { kind: 'idle' }
  | { kind: 'loading', code: string }
  | { kind: 'error', code: string }
  /** `text` : la réponse brute, pour l'afficher ou la copier telle quelle. Produit inconnu : `data.status` vaut 0. */
  | { kind: 'done', code: string, data: OffResponse, text: string }

/**
 * Recherche d'un code-barres dans Open Food Facts. Une nouvelle recherche annule la précédente,
 * comme le démontage du composant.
 */
export function useOffProduct() {
  const state = shallowRef<OffLookupState>({ kind: 'idle' })
  let controller: AbortController | null = null

  async function lookup(code: string) {
    controller?.abort()
    const current = new AbortController()
    controller = current
    state.value = { kind: 'loading', code }

    try {
      const response = await fetch(`${OFF_PRODUCT_URL}${code}.json`, { signal: current.signal })
      const text = await response.text()
      // Produit inconnu : Open Food Facts répond 404 avec un JSON `status: 0`, traité comme une réponse.
      state.value = { kind: 'done', code, data: JSON.parse(text) as OffResponse, text }
    } catch (error) {
      if (current.signal.aborted) return
      console.error('Recherche Open Food Facts impossible', error)
      state.value = { kind: 'error', code }
    }
  }

  function retry() {
    if (state.value.kind === 'error') lookup(state.value.code)
  }

  function reset() {
    controller?.abort()
    state.value = { kind: 'idle' }
  }

  onBeforeUnmount(() => controller?.abort())

  return { state, lookup, retry, reset }
}
