export type SortDirection = 'asc' | 'desc'

export interface SortState<K extends string = string> {
  key: K
  direction: SortDirection
}

/** Critère de tri proposé à l'utilisateur ; `defaultDirection` = sens appliqué au premier clic (décroissant pour les nombres). */
export interface SortOption<K extends string = string> {
  key: K
  label: string
  defaultDirection: SortDirection
  /** Icône affichée devant le libellé dans le champ « Trier par ». */
  icon?: string
  /** Pastille de couleur à la place de l'icône (macros G/P/L, mêmes couleurs que la barre de composition). */
  dot?: string
}

/** `null`/`undefined` = valeur non renseignée : toujours rangée en fin de liste, quel que soit le sens. */
export type SortValue = string | number | null | undefined

/**
 * Trie une copie de `list` selon `value`. Les valeurs absentes restent en bas dans les deux sens,
 * et `tieBreak` (le nom, en général) départage les égalités par ordre alphabétique.
 */
export function sortList<T>(
  list: T[],
  value: (item: T) => SortValue,
  direction: SortDirection,
  tieBreak: (item: T) => string
): T[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const aMissing = va == null || va === ''
    const bMissing = vb == null || vb === ''
    if (aMissing !== bMissing) return aMissing ? 1 : -1

    let diff = 0
    if (!aMissing) {
      diff = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base', numeric: true })
    }
    return diff !== 0
      ? diff * sign
      : tieBreak(a).localeCompare(tieBreak(b), 'fr', { sensitivity: 'base' })
  })
}

/** Clic sur un critère : inverse le sens s'il est déjà actif, sinon l'active dans son sens par défaut. */
export function nextSort<K extends string>(current: SortState<K>, option: SortOption<K>): SortState<K> {
  if (current.key === option.key) {
    return { key: option.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { key: option.key, direction: option.defaultDirection }
}
