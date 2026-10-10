import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { IngredientCategory } from '~/types/ingredientCategory'
import type { ShoppingContribution, ShoppingItem, ShoppingItemStatus } from '~/types/shoppingList'
import { compareShoppingSources, formatShoppingQuantity, piecesFor, type ShoppingNeed } from './shoppingList'

/** Page « Liste de courses » : une ligne affichée par article de la collection `shoppingList`. */

/** Rayon des articles sans catégorie du catalogue (ajouts manuels, catégorie inconnue). */
export const MISC_AISLE: IngredientCategory = { id: 'misc', label: 'Divers', order: 99, icon: 'shopping-basket' }

/** Rayons des denrées fragiles (moins d'une semaine de conservation à l'achat). Les produits laitiers n'en sont pas. */
const FRAGILE_AISLE_IDS = new Set(['vegetables', 'fruits', 'meat', 'seafood'])

/**
 * Les œufs partagent le rayon « Viandes & Œuf » mais se gardent plusieurs semaines. Reconnus au mot entier « œuf(s) »
 * (ou « oeuf(s) ») : « Jaune d'œuf », « Œufs de caille », mais pas « Bœuf » ni « Viande de boeuf ».
 */
const EGG_WORD = /(?:^|[\s'’-])oeufs?(?![a-z])/
export const isEgg = (label: string) => EGG_WORD.test(label.toLowerCase().replaceAll('œ', 'oe'))

/** Une denrée fragile reste bonne jusqu'à J+2 après l'achat (samedi → lundi soir) ; au-delà, mieux vaut attendre ou congeler. */
export const FRAGILE_KEEP_DAYS = 2

/** Un besoin à venir aujourd'hui ou demain rend l'achat urgent. */
const URGENT_WITHIN_DAYS = 1

/** Un jour de besoin, prêt à afficher dans le détail d'un article. */
export interface GroceryNeedRow {
  date: string
  /** "aujourd'hui", "demain", sinon "mar. 14". */
  dayLabel: string
  quantityLabel: string
  sources: string[]
  /** Jour passé : plus attendu, n'entre dans aucun calcul. */
  isPast: boolean
  /** Fragile et attendu au-delà de J+2 : à acheter plus tard ou à congeler. */
  isTooEarly: boolean
}

export interface GroceryLine {
  id: string
  label: string
  aisle: IngredientCategory
  /** Quantité affichée : saisie à la main, sinon calculée ("4 pièces (600 g)") ; vide si aucune. */
  quantityLabel: string
  /** Quantité calculée depuis les menus ; vide pour un ajout manuel. */
  computedQuantityLabel: string
  /** La quantité affichée a été saisie à la main. */
  isQuantityEdited: boolean
  /** Recettes (ou « Hors recette ») qui demandent cet ingrédient. */
  sources: string[]
  manual: boolean
  status: ShoppingItemStatus
  /** Besoins jour par jour, passés compris, tirés des apports ; vides pour un ajout manuel. */
  needs: GroceryNeedRow[]
  /** "mar. 14 → sam. 18", "pour demain"... sur les besoins à venir ; vide s'il n'y en a pas. */
  rangeLabel: string
  /** Marqué urgent à la main. */
  isMarkedUrgent: boolean
  /** Prochain besoin aujourd'hui ou demain. */
  isDueSoon: boolean
  isUrgent: boolean
  isFragile: boolean
  /** Fragile avec au moins un besoin au-delà de J+2 : signalé par une horloge. */
  hasTooEarlyNeed: boolean
  item: ShoppingItem
}

/** Urgents en tête de leur rayon, puis par nom. */
export const compareGroceryLines = (a: GroceryLine, b: GroceryLine) =>
  a.aisle.order - b.aisle.order
  || a.aisle.label.localeCompare(b.aisle.label, 'fr')
  || Number(b.isUrgent) - Number(a.isUrgent)
  || a.label.localeCompare(b.label, 'fr')

const shortDay = (date: Date) => format(date, 'EEE d', { locale: fr })

function dayLabel(date: Date, today: Date) {
  const offset = differenceInCalendarDays(date, today)
  if (offset === 0) return 'aujourd\'hui'
  if (offset === 1) return 'demain'
  return shortDay(date)
}

/** Apports cumulés par jour (toutes recettes confondues), par date croissante. */
function needsFromContributions(contributions: ShoppingContribution[]): ShoppingNeed[] {
  const byDate = new Map<string, ShoppingNeed>()
  for (const c of contributions) {
    const need = byDate.get(c.date) ?? { date: c.date, grams: 0, milliliters: 0, sources: [] }
    need.grams += c.grams
    need.milliliters += c.milliliters
    if (!need.sources.includes(c.label)) need.sources.push(c.label)
    byDate.set(c.date, need)
  }
  return [...byDate.values()]
    .map(need => ({ ...need, sources: need.sources.sort(compareShoppingSources) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function needQuantityLabel(need: ShoppingNeed, gramsPerPiece?: number) {
  const pieces = gramsPerPiece && need.grams > 0 ? piecesFor(need.grams, gramsPerPiece) : undefined
  return formatShoppingQuantity({ grams: need.grams, milliliters: need.milliliters, pieces })
}

/** Ligne affichée d'un article à la date `today` ; `aisleOf` résout son rayon dans le catalogue des catégories. */
export function groceryLineFromItem(
  item: ShoppingItem,
  aisleOf: (categoryId?: string) => IngredientCategory,
  today: Date,
): GroceryLine {
  const aisle = aisleOf(item.categoryId)
  const totals = needsFromContributions(item.contributions ?? [])
  const grams = totals.reduce((sum, need) => sum + need.grams, 0)
  const milliliters = totals.reduce((sum, need) => sum + need.milliliters, 0)
  const pieces = item.gramsPerPiece && grams > 0 ? piecesFor(grams, item.gramsPerPiece) : undefined
  const computedQuantityLabel = grams > 0 || milliliters > 0 ? formatShoppingQuantity({ grams, milliliters, pieces }) : ''
  const isFragile = FRAGILE_AISLE_IDS.has(aisle.id) && !isEgg(item.label)

  const needs = totals.map((need): GroceryNeedRow => {
    const date = parseISO(need.date)
    const offset = differenceInCalendarDays(date, today)
    return {
      date: need.date,
      dayLabel: dayLabel(date, today),
      quantityLabel: needQuantityLabel(need, item.gramsPerPiece),
      sources: need.sources,
      isPast: offset < 0,
      isTooEarly: isFragile && offset > FRAGILE_KEEP_DAYS,
    }
  })

  const upcoming = needs.filter(need => !need.isPast)
  const first = upcoming.at(0)
  const last = upcoming.at(-1)
  const rangeLabel = !first || !last
    ? ''
    : first.date === last.date
      ? `pour ${first.dayLabel}`
      : `${first.dayLabel} → ${last.dayLabel}`

  const isMarkedUrgent = !!item.urgent
  const isDueSoon = !!first && parseISO(first.date) <= addDays(today, URGENT_WITHIN_DAYS)

  return {
    id: item.id,
    label: item.label,
    aisle,
    quantityLabel: item.quantity || computedQuantityLabel,
    computedQuantityLabel,
    isQuantityEdited: !!item.quantity,
    sources: [...new Set(totals.flatMap(need => need.sources))].sort(compareShoppingSources),
    manual: !item.ingredientId,
    status: item.status,
    needs,
    rangeLabel,
    isMarkedUrgent,
    isDueSoon,
    isUrgent: isMarkedUrgent || isDueSoon,
    isFragile,
    hasTooEarlyNeed: upcoming.some(need => need.isTooEarly),
    item,
  }
}
