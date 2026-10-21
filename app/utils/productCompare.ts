import type { Ingredient } from '~/types/ingredient'
import type { IngredientMacros } from '~/utils/ingredientNutrition'
import { isPer100Ml, readEnergy, readNutrient } from '~/utils/offNutrition'
import type { NutrientReading, OffProduct, OffProductDetails } from '~/utils/offNutrition'

export type CompareKey = keyof IngredientMacros

/** Valeur pour 100 ; `null` = non renseignée (jamais remplacée par 0). `prefix` : ≈, <, ≤… d'Open Food Facts. */
export type CompareValue = { value: number, prefix: string } | null

/**
 * Un côté du duel : produit scanné ou ingrédient du catalogue, réduit à ce que le tableau compare.
 * Assez léger pour tenir dans le stockage de session.
 */
export type CompareItem = {
  source: 'scan' | 'catalog'
  /** EAN pour un scan, id Firestore pour un ingrédient. */
  id: string
  name: string
  brand?: string
  imageUrl?: string
  /** Base des valeurs : 100 g, ou 100 ml pour une boisson scannée. Le catalogue est toujours pour 100 g. */
  base: 'g' | 'ml'
  /** Densité en g/ml, connue seulement pour un ingrédient du catalogue. */
  density?: number
  values: Record<CompareKey, CompareValue>
  /** Fiche Open Food Facts réduite, pour créer l'ingrédient depuis la colonne. */
  off?: OffProduct
}

export const COMPARE_ROWS = [
  { key: 'calories', label: 'Énergie', unit: 'kcal', digits: 0, colorClass: null },
  { key: 'carbohydrates', label: 'Glucides', unit: 'g', digits: 1, colorClass: 'bg-green-500' },
  { key: 'protein', label: 'Protéines', unit: 'g', digits: 1, colorClass: 'bg-red-700' },
  { key: 'fat', label: 'Lipides', unit: 'g', digits: 1, colorClass: 'bg-amber-500' },
] as const

const toValue = (reading: NutrientReading): CompareValue =>
  reading.kind === 'value' ? { value: reading.value, prefix: reading.prefix } : null

export function compareItemFromOff(code: string, product: OffProductDetails): CompareItem {
  const nutriments = product.nutriments ?? {}
  const brand = product.brands?.split(',')[0]?.trim()
  const imageUrl = product.image_front_small_url || product.image_small_url || product.image_front_url || product.image_url
  return {
    source: 'scan',
    id: code,
    name: (product.product_name_fr || product.product_name || '').trim(),
    ...(brand ? { brand } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    base: isPer100Ml(product) ? 'ml' : 'g',
    values: {
      calories: toValue(readEnergy(nutriments)),
      carbohydrates: toValue(readNutrient(nutriments, 'carbohydrates')),
      protein: toValue(readNutrient(nutriments, 'proteins')),
      fat: toValue(readNutrient(nutriments, 'fat')),
    },
    off: {
      product_name: product.product_name,
      product_name_fr: product.product_name_fr,
      brands: product.brands,
      nutriments,
      nutrition_data_per: product.nutrition_data_per,
      product_quantity_unit: product.product_quantity_unit,
    },
  }
}

/** Un ingrédient sans valeurs pour 100 g ne se compare pas : `null`. */
export function compareItemFromIngredient(ingredient: Ingredient): CompareItem | null {
  const v = ingredient.valuesBy100
  if (!v) return null
  const at = (n: number): CompareValue => (Number.isFinite(n) ? { value: n, prefix: '' } : null)
  return {
    source: 'catalog',
    id: ingredient.id,
    name: ingredient.label,
    ...(ingredient.imageUrl ? { imageUrl: ingredient.imageUrl } : {}),
    base: 'g',
    ...(ingredient.density && ingredient.density > 0 ? { density: ingredient.density } : {}),
    values: { calories: at(v.calories), carbohydrates: at(v.carbohydrates), protein: at(v.protein), fat: at(v.fat) },
  }
}

export type CompareBasis =
  | { kind: 'same', base: 'g' | 'ml' }
  /** Le côté `side` (pour 100 g) a été ramené à 100 ml par sa densité. */
  | { kind: 'converted', base: 'ml', side: 'a' | 'b', density: number }
  /** 100 g contre 100 ml sans densité : pas d'écart calculé. */
  | { kind: 'mismatch' }

/** Ramène les deux côtés à une même base quand c'est possible (100 g × densité = 100 ml). */
export function resolveBasis(a: CompareItem, b: CompareItem): CompareBasis {
  if (a.base === b.base) return { kind: 'same', base: a.base }
  const [gramSide, gramItem] = a.base === 'g' ? (['a', a] as const) : (['b', b] as const)
  if (gramItem.density) return { kind: 'converted', base: 'ml', side: gramSide, density: gramItem.density }
  return { kind: 'mismatch' }
}

/** Valeurs d'un côté dans la base commune. */
export function valuesOnBasis(item: CompareItem, side: 'a' | 'b', basis: CompareBasis): Record<CompareKey, CompareValue> {
  if (basis.kind !== 'converted' || basis.side !== side) return item.values
  const scale = (v: CompareValue): CompareValue => (v ? { ...v, value: v.value * basis.density } : null)
  return {
    calories: scale(item.values.calories),
    carbohydrates: scale(item.values.carbohydrates),
    protein: scale(item.values.protein),
    fat: scale(item.values.fat),
  }
}
