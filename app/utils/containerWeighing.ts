const gramsFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Grammes arrondis à l'entier, séparateur de milliers français. Ex : 1248 → "1 248". */
export function formatGramsValue(grams: number): string {
  return gramsFormatter.format(Math.round(grams))
}

export type Weighing =
  | { status: 'empty' }
  /** Le poids plein ne dépasse pas la tare : saisie incohérente, pas de résultat. */
  | { status: 'invalid' }
  | { status: 'ok'; net: number; perPart: number }

/** Pesée d'un meal prep : poids plein − tare = net cuit, réparti en `parts` parts égales. */
export function computeWeighing(fullWeight: number | null, tare: number, parts: number): Weighing {
  if (fullWeight === null) return { status: 'empty' }
  const net = fullWeight - tare
  if (net <= 0) return { status: 'invalid' }
  return { status: 'ok', net, perPart: net / Math.max(1, parts) }
}
