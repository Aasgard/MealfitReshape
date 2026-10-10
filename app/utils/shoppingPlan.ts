import type { Ingredient } from '~/types/ingredient'
import type { Recipe } from '~/types/recipe'
import type { ShoppingContribution, ShoppingItem, ShoppingMealInclusion } from '~/types/shoppingList'
import { ingredientAmount, OUTSIDE_RECIPE_SOURCE, recipeBatches } from './shoppingList'

/**
 * Liste de courses dynamique : les repas inclus (`shoppingMeals`) déterminent les apports des articles
 * (`shoppingList`). Chaque geste du panneau recalcule les regroupements touchés (`recipe:<id>`,
 * `ingredient:<id>:<unité>`) et n'écrit que les écarts.
 */

export interface ShoppingCatalog {
  recipesById: Map<string, Recipe>
  ingredientsById: Map<string, Ingredient>
}

const EPSILON = 1e-6

interface KeyTarget {
  /** Apports voulus, par ingrédient. */
  byIngredient: Map<string, ShoppingContribution[]>
  /**
   * Jours de fournées acquises (couvrant un repas déjà acheté) : leurs apports restants ne bougent plus, et rien ne
   * s'y ajoute. Pour un aliment seul, les jours des repas achetés.
   */
  frozenDays: Set<string>
  /** Jour dont dépend chaque inclusion : jour de cuisson de sa fournée, ou jour du repas. */
  dayOf: Map<string, string>
  skipped: string[]
}

function pushContribution(target: Map<string, ShoppingContribution[]>, ingredientId: string, contribution: ShoppingContribution) {
  const list = target.get(ingredientId) ?? []
  const same = list.find(c => c.date === contribution.date)
  if (same) {
    same.grams += contribution.grams
    same.milliliters += contribution.milliliters
  }
  else {
    list.push({ ...contribution })
  }
  target.set(ingredientId, list)
}

/** Apports voulus d'un regroupement d'après toutes ses inclusions (achetées comprises, pour situer les fournées). */
export function keyTarget(key: string, inclusions: ShoppingMealInclusion[], catalog: ShoppingCatalog): KeyTarget {
  const result: KeyTarget = { byIngredient: new Map(), frozenDays: new Set(), dayOf: new Map(), skipped: [] }
  const own = inclusions.filter(inclusion => inclusion.key === key)
  if (!own.length) return result
  const isBought = new Map(own.map(inclusion => [inclusion.id, inclusion.state === 'bought']))

  if (key.startsWith('recipe:')) {
    const recipe = own[0]!.recipeId ? catalog.recipesById.get(own[0]!.recipeId) : undefined
    if (!recipe) {
      result.skipped.push('Recette introuvable')
      return result
    }
    const persons = recipe.persons && recipe.persons > 0 ? recipe.persons : 1
    const batches = recipeBatches(own.map(inclusion => ({ id: inclusion.id, date: inclusion.date, parts: inclusion.parts ?? 0 })), persons)
    for (const batch of batches) {
      for (const id of batch.covers) result.dayOf.set(id, batch.day)
      if (batch.covers.some(id => isBought.get(id))) {
        result.frozenDays.add(batch.day)
        continue
      }
      for (const line of recipe.ingredients ?? []) {
        const ingredient = line.ingredientRef ? catalog.ingredientsById.get(line.ingredientRef.id) : undefined
        if (!ingredient || line.quantity <= 0) continue
        const amount = ingredientAmount(ingredient, line.unit ?? null, line.quantity)
        if (!amount) {
          result.skipped.push(`${ingredient.label} (unité introuvable)`)
          continue
        }
        pushContribution(result.byIngredient, ingredient.id, { key, date: batch.day, ...amount, label: recipe.title })
      }
    }
    return result
  }

  for (const inclusion of own) {
    result.dayOf.set(inclusion.id, inclusion.date)
    if (inclusion.state === 'bought') {
      result.frozenDays.add(inclusion.date)
      continue
    }
    const ingredient = inclusion.ingredientId ? catalog.ingredientsById.get(inclusion.ingredientId) : undefined
    if (!ingredient || !inclusion.quantity) continue
    const amount = ingredientAmount(ingredient, inclusion.unitId ?? null, inclusion.quantity)
    if (!amount) {
      result.skipped.push(`${ingredient.label} (unité introuvable)`)
      continue
    }
    pushContribution(result.byIngredient, ingredient.id, { key, date: inclusion.date, ...amount, label: OUTSIDE_RECIPE_SOURCE })
  }
  return result
}

export type ItemWrite =
  | { type: 'update', item: ShoppingItem, contributions: ShoppingContribution[] }
  | { type: 'delete', item: ShoppingItem }
  | { type: 'create', ingredientId: string, contributions: ShoppingContribution[] }

const sortContributions = (list: ShoppingContribution[]) =>
  list.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))

const sameContributions = (a: ShoppingContribution[], b: ShoppingContribution[]) =>
  JSON.stringify(sortContributions([...a])) === JSON.stringify(sortContributions([...b]))

/**
 * Écarts à écrire pour que les articles reflètent les inclusions des regroupements `keys` :
 * - un article dans le panier est figé : ses apports comptent comme déjà couverts (pas de baisse) ;
 * - sinon l'apport va à l'article qui le portait déjà (même « à la maison »), à défaut à l'article à acheter de
 *   l'ingrédient, à défaut à un nouvel article ;
 * - un article venu des menus qui n'a plus d'apport est supprimé.
 */
export function planItemWrites(
  keys: Iterable<string>,
  inclusions: ShoppingMealInclusion[],
  items: ShoppingItem[],
  catalog: ShoppingCatalog,
): { writes: ItemWrite[], skipped: string[] } {
  const working = new Map(items.map(item => [item.id, [...(item.contributions ?? [])]]))
  const created = new Map<string, ShoppingContribution[]>()
  const skipped = new Set<string>()

  for (const key of new Set(keys)) {
    const target = keyTarget(key, inclusions, catalog)
    target.skipped.forEach(s => skipped.add(s))

    const ingredientIds = new Set(target.byIngredient.keys())
    for (const item of items) {
      if (item.ingredientId && item.contributions?.some(c => c.key === key)) ingredientIds.add(item.ingredientId)
    }

    for (const ingredientId of ingredientIds) {
      const forIngredient = items.filter(item => item.ingredientId === ingredientId)
      const mutable = forIngredient.filter(item => item.status !== 'inCart')

      // Déjà dans le panier, par jour : couvert.
      const inCart = new Map<string, { grams: number, milliliters: number }>()
      for (const item of forIngredient.filter(item => item.status === 'inCart')) {
        for (const c of item.contributions ?? []) {
          if (c.key !== key) continue
          const covered = inCart.get(c.date) ?? { grams: 0, milliliters: 0 }
          covered.grams += c.grams
          covered.milliliters += c.milliliters
          inCart.set(c.date, covered)
        }
      }

      const host = mutable.find(item => item.contributions?.some(c => c.key === key && !target.frozenDays.has(c.date)))
        ?? mutable.find(item => item.status === 'toBuy')

      for (const item of mutable) {
        working.set(item.id, working.get(item.id)!.filter(c => c.key !== key || target.frozenDays.has(c.date)))
      }

      const desired = (target.byIngredient.get(ingredientId) ?? []).flatMap((c) => {
        const covered = inCart.get(c.date)
        const grams = Math.max(0, c.grams - (covered?.grams ?? 0))
        const milliliters = Math.max(0, c.milliliters - (covered?.milliliters ?? 0))
        return grams > EPSILON || milliliters > EPSILON ? [{ ...c, grams, milliliters }] : []
      })
      if (!desired.length) continue

      if (host) working.set(host.id, [...working.get(host.id)!, ...desired])
      else created.set(ingredientId, [...(created.get(ingredientId) ?? []), ...desired])
    }
  }

  const writes: ItemWrite[] = []
  for (const item of items) {
    const next = working.get(item.id)!
    if (sameContributions(next, item.contributions ?? [])) continue
    if (!next.length && item.ingredientId) writes.push({ type: 'delete', item })
    else writes.push({ type: 'update', item, contributions: sortContributions(next) })
  }
  for (const [ingredientId, contributions] of created) {
    writes.push({ type: 'create', ingredientId, contributions: sortContributions(contributions) })
  }
  return { writes, skipped: [...skipped] }
}

/**
 * Fin des courses : les articles du panier et ceux déjà à la maison sont supprimés ; les inclusions listées dont la
 * fournée (ou le jour) avait un apport dans ces articles passent à « acheté ».
 */
export function planFinish(items: ShoppingItem[], inclusions: ShoppingMealInclusion[], catalog: ShoppingCatalog) {
  const removed = items.filter(item => item.status !== 'toBuy')
  const acquired = new Set(removed.flatMap(item => (item.contributions ?? []).map(c => `${c.key}|${c.date}`)))

  const dayOf = new Map<string, string>()
  for (const key of new Set(inclusions.map(inclusion => inclusion.key))) {
    for (const [id, day] of keyTarget(key, inclusions, catalog).dayOf) dayOf.set(id, day)
  }

  const bought = inclusions.filter((inclusion) => {
    if (inclusion.state !== 'listed') return false
    const day = dayOf.get(inclusion.id)
    return !!day && acquired.has(`${inclusion.key}|${day}`)
  })
  return { removed, bought }
}
