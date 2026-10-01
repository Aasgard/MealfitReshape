/** Texte comparable pour une recherche : sans accents ni majuscules, ligatures dépliées (« Pâte » → « pate », « Œuf » → « oeuf »). */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .trim()
}

/** Vrai si `text` contient `query`, sans tenir compte des accents ni des majuscules ; une recherche vide correspond à tout. */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalizeForSearch(query)
  return !q || normalizeForSearch(text).includes(q)
}
