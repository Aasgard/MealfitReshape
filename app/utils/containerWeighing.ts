const gramsFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Grammes arrondis à l'entier, séparateur de milliers français. Ex : 1248 → "1 248". */
export function formatGramsValue(grams: number): string {
  return gramsFormatter.format(Math.round(grams))
}

export type Weighing =
  | { status: 'empty' }
  /** Le poids plein ne dépasse pas la tare : saisie incohérente, pas de résultat. */
  | { status: 'invalid' }
  /** `portionWeights` : poids de chaque boîte, dans l'ordre de `portions`. */
  | { status: 'ok'; net: number; perPart: number; portionWeights: number[] }

/**
 * Pesée d'un meal prep : poids plein − tare = net, réparti entre des boîtes de tailles différentes.
 * Chaque boîte reçoit le net au prorata de ses parts (ex. 1 + 1,5 + 0,5 parts de 1 200 g → 400, 600 et 200 g).
 */
export function computeWeighing(fullWeight: number | null, tare: number, portions: number[]): Weighing {
  if (fullWeight === null) return { status: 'empty' }
  const net = fullWeight - tare
  if (net <= 0) return { status: 'invalid' }
  const totalParts = portions.reduce((sum, parts) => sum + parts, 0)
  const perPart = totalParts > 0 ? net / totalParts : net
  return { status: 'ok', net, perPart, portionWeights: portions.map(parts => parts * perPart) }
}
