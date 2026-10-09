import type { ScannedProduct } from '~/types/meal'
import type { IngredientMacros } from '~/utils/ingredientNutrition'

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

/** Fiche produit telle que la renvoie l'API Open Food Facts (sous-ensemble lu par l'app). */
export type OffProductDetails = OffProduct & {
  nutriscore_grade?: string
  image_front_url?: string
  image_front_small_url?: string
  image_url?: string
  image_small_url?: string
  serving_quantity?: number | string
  product_quantity?: number | string
}

export type OffResponse = {
  code?: string
  status?: number
  status_verbose?: string
  product?: OffProductDetails
}

/** Valeurs pour 100 d'un produit scanné ; `null` = non renseignée par Open Food Facts (jamais remplacée par 0). */
export type Per100Readings = Record<keyof IngredientMacros, number | null>

/** Produit scanné avant le choix de la quantité : des valeurs peuvent encore manquer. */
export type ScannedProductDraft = Omit<ScannedProduct, 'per100' | 'quantity'> & { per100: Per100Readings }

function positiveAt(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined
}

const readingValue = (reading: NutrientReading, digits: number) =>
  reading.kind === 'value' ? Math.round(reading.value * 10 ** digits) / 10 ** digits : null

/** Libellé de repas d'un produit : « Produit — Marque », comme le nom d'ingrédient créé depuis le scanner. */
export function scannedProductLabel(product: Pick<ScannedProduct, 'name' | 'brand'>): string {
  return product.name && product.brand ? `${product.name} — ${product.brand}` : product.name || product.brand || ''
}

/** Ce qu'un repas garde d'une fiche Open Food Facts. Les champs absents sont omis (Firestore refuse `undefined`). */
export function scannedProductFromOff(code: string, product: OffProductDetails): ScannedProductDraft {
  const nutriments = product.nutriments ?? {}
  const brand = product.brands?.split(',')[0]?.trim()
  const imageUrl = product.image_front_small_url || product.image_small_url || product.image_front_url || product.image_url
  const serving = positiveAt(product.serving_quantity)
  const pack = positiveAt(product.product_quantity)
  return {
    ean: code,
    name: (product.product_name_fr || product.product_name || '').trim(),
    ...(brand ? { brand } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    unit: isPer100Ml(product) ? 'ml' : 'g',
    per100: {
      calories: readingValue(readEnergy(nutriments), 0),
      carbohydrates: readingValue(readNutrient(nutriments, 'carbohydrates'), 1),
      protein: readingValue(readNutrient(nutriments, 'proteins'), 1),
      fat: readingValue(readNutrient(nutriments, 'fat'), 1),
    },
    ...(serving ? { serving } : {}),
    // Un emballage d'une seule portion ne donne pas un second raccourci identique.
    ...(pack && pack !== serving ? { package: pack } : {}),
  }
}

/** Valeurs pour `quantity` (en g ou ml) d'un produit, à 0,1 près ; une valeur non renseignée reste `null`. */
export function readingsForQuantity(per100: Per100Readings, quantity: number): Per100Readings {
  const scale = (n: number | null) => (n == null ? null : Math.round((n * quantity) / 10) / 10)
  return {
    calories: scale(per100.calories),
    carbohydrates: scale(per100.carbohydrates),
    protein: scale(per100.protein),
    fat: scale(per100.fat),
  }
}

/** Les quatre valeurs sont connues : le produit peut servir de repas tel quel. */
export function isCompletePer100(per100: Per100Readings): per100 is IngredientMacros {
  return Object.values(per100).every(v => v != null)
}
