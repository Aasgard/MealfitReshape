/** Sous-ensemble d'une fiche produit Open Food Facts lu pour les valeurs nutritionnelles. */
export type OffNutritionSource = {
  nutriments?: Record<string, unknown>
  nutrition_data_per?: string
  product_quantity_unit?: string
}

export type NutrientReading =
  | { kind: 'missing' }
  | { kind: 'value', value: number, prefix: string, note?: string }

/** Préfixes Open Food Facts (`<key>_modifier`) : `~` = valeur estimée par OFF, les autres sont des bornes déclarées. */
const MODIFIER_PREFIX: Record<string, string> = { '~': '≈', '<': '<', '>': '>', '<=': '≤', '>=': '≥' }

function numberAt(nutriments: Record<string, unknown>, key: string): number | null {
  const raw = nutriments[key]
  const value = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Une clé absente reste « non renseignée » ; un 0 explicite est un vrai zéro. */
export function readNutrient(nutriments: Record<string, unknown>, key: string): NutrientReading {
  const value = numberAt(nutriments, `${key}_100g`)
  if (value == null) return { kind: 'missing' }
  const modifier = nutriments[`${key}_modifier`]
  const prefix = typeof modifier === 'string' ? MODIFIER_PREFIX[modifier] ?? '' : ''
  return { kind: 'value', value, prefix, note: modifier === '~' ? 'Estimée par Open Food Facts' : undefined }
}

/** Les kcal d'abord ; à défaut, la valeur en kJ de l'étiquette convertie (1 kcal = 4,184 kJ). */
export function readEnergy(nutriments: Record<string, unknown>): NutrientReading {
  const kcal = readNutrient(nutriments, 'energy-kcal')
  if (kcal.kind === 'value') return kcal
  const kj = readNutrient(nutriments, 'energy-kj')
  if (kj.kind === 'missing') return kj
  const kjLabel = kj.value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  return { ...kj, value: kj.value / 4.184, note: kj.note ?? `Convertie depuis ${kjLabel} kJ` }
}

/** Open Food Facts stocke tout en `_100g`, mais une boisson se lit pour 100 ml. */
export function isPer100Ml(product: OffNutritionSource): boolean {
  const per = product.nutrition_data_per?.toLowerCase() ?? ''
  const unit = product.product_quantity_unit?.toLowerCase() ?? ''
  return per.includes('ml') || ['ml', 'cl', 'l'].includes(unit)
}

export type OffProduct = OffNutritionSource & {
  product_name?: string
  product_name_fr?: string
  brands?: string
}

/** Champs du formulaire d'ingrédient préremplis depuis un produit scanné (chaînes, comme les saisies). */
export type IngredientPrefill = {
  label: string
  calories: string
  carbohydrates: string
  fat: string
  protein: string
  density: string
  comment: string
}

/** Arrondi pour la saisie : `String` garde le point décimal, que les champs acceptent comme la virgule. */
function prefillValue(reading: NutrientReading, digits: number): string {
  if (reading.kind === 'missing') return ''
  const factor = 10 ** digits
  return String(Math.round(reading.value * factor) / factor)
}

/**
 * Nom « Produit — Marque », valeurs pour 100 telles qu'OFF les donne (une borne `<0,5` donne 0.5),
 * densité 1 pour un produit lu pour 100 ml, et l'EAN en commentaire. Une valeur absente reste vide, jamais 0.
 */
export function ingredientPrefillFromOff(code: string, product: OffProduct): IngredientPrefill {
  const name = (product.product_name_fr || product.product_name || '').trim()
  const brand = product.brands?.split(',')[0]?.trim() ?? ''
  const nutriments = product.nutriments ?? {}
  return {
    label: name && brand ? `${name} — ${brand}` : name || brand,
    calories: prefillValue(readEnergy(nutriments), 0),
    carbohydrates: prefillValue(readNutrient(nutriments, 'carbohydrates'), 1),
    fat: prefillValue(readNutrient(nutriments, 'fat'), 1),
    protein: prefillValue(readNutrient(nutriments, 'proteins'), 1),
    density: isPer100Ml(product) ? '1' : '',
    comment: `EAN ${code}`,
  }
}
