/** Parse une saisie utilisateur (virgule ou point) en nombre strictement positif, ou `null` si invalide/vide. */
export function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Comme `parsePositiveNumber`, mais accepte `0` (ex. une macro nulle) tout en refusant les négatifs et le vide. */
export function parseNonNegativeNumber(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function formatGrams(grams: number): string {
  if (!Number.isFinite(grams) || grams < 0) return '0 g'
  return `${Math.round(grams)} g`
}
