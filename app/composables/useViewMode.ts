export type ViewMode = 'cards' | 'list'

const STORAGE_PREFIX = 'mealfit:view-mode:'

function readStoredMode(storageKey: string): ViewMode | null {
  if (!import.meta.client) return null
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === 'cards' || stored === 'list' ? stored : null
  } catch {
    // Stockage indisponible (navigation privée, données bloquées) : vue par défaut.
    return null
  }
}

/**
 * Vue (cartes ou liste) d'une page de catalogue, mémorisée par page dans le navigateur.
 * Les pages du dashboard sont rendues côté client (`ssr: false`) : la préférence est lue dès la création,
 * sans passer d'abord par les cartes.
 */
export function useViewMode(page: string) {
  const storageKey = `${STORAGE_PREFIX}${page}`
  const mode = ref<ViewMode>(readStoredMode(storageKey) ?? 'cards')

  watch(mode, (value) => {
    try {
      localStorage.setItem(storageKey, value)
    } catch {
      // Préférence non mémorisée, sans conséquence pour l'affichage.
    }
  })

  return mode
}
