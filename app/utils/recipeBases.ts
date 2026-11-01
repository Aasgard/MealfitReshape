import type { Ingredient } from '~/types/ingredient'
import type { Recipe, RecipeIngredientLine } from '~/types/recipe'
import type { IngredientMacros } from './ingredientNutrition'
import { gramsForUnit } from './ingredientNutrition'
import { macrosForRecipe } from './recipeNutrition'
import { baseKey, isBaseLine, lineBaseId, lineSourceKey, refId } from './recipeLineSource'
import { isBaseRecipe } from './recipeType'

/** Catégorie affichée pour l'ingrédient virtuel d'une base (jamais écrite). */
const BASE_CATEGORY = { id: 'base', label: 'Bases maison', order: 999, icon: 'i-lucide-cooking-pot' }

const hasAnyMacro = (m: IngredientMacros) => m.calories > 0 || m.protein > 0 || m.carbohydrates > 0 || m.fat > 0

/** Rendement exploitable d'une base, `null` s'il n'est pas renseigné. */
export const baseYield = (recipe: Pick<Recipe, 'yieldGrams'> | null | undefined): number | null =>
  recipe?.yieldGrams && recipe.yieldGrams > 0 ? recipe.yieldGrams : null

/**
 * Catalogue d'ingrédients complété d'un ingrédient virtuel par recette de base (clé `recipe:<id>`) : nom de la base,
 * ses unités, et des valeurs pour 100 g tirées de ses lignes et de son rendement. Une ligne de plat qui pointe vers la
 * base se résout donc comme un ingrédient : les macros suivent toute modification de la base (lien vivant).
 * Les bases imbriquées se résolvent d'abord ; une boucle (A dans B dans A) est ignorée plutôt que de tourner sans fin.
 * Sans rendement, ou sans aucune valeur, la base n'a pas de `valuesBy100` : « à compléter », comme un ingrédient.
 */
export function withRecipeBases(ingredients: Ingredient[], recipes: Recipe[]): Map<string, Ingredient> {
  const map = new Map<string, Ingredient>(ingredients.map(i => [i.id, i]))
  const basesById = new Map(recipes.filter(isBaseRecipe).map(r => [r.id, r]))
  const resolving = new Set<string>()

  const resolve = (recipe: Recipe) => {
    if (map.has(baseKey(recipe.id)) || resolving.has(recipe.id)) return
    resolving.add(recipe.id)
    for (const line of recipe.ingredients ?? []) {
      const subId = lineBaseId(line)
      const sub = subId ? basesById.get(subId) : undefined
      if (sub) resolve(sub)
    }
    resolving.delete(recipe.id)

    const yieldGrams = baseYield(recipe)
    const total = macrosForRecipe(recipe.ingredients, map, 1)
    const per100 = yieldGrams && hasAnyMacro(total)
      ? {
          calories: (total.calories * 100) / yieldGrams,
          protein: (total.protein * 100) / yieldGrams,
          carbohydrates: (total.carbohydrates * 100) / yieldGrams,
          fat: (total.fat * 100) / yieldGrams,
        }
      : undefined

    map.set(baseKey(recipe.id), {
      id: baseKey(recipe.id),
      label: recipe.title,
      owner: recipe.owner ?? null,
      activeMonths: [],
      category: BASE_CATEGORY,
      comment: '',
      createdAt: recipe.createdAt!,
      updatedAt: recipe.updatedAt!,
      ...(recipe.units ? { units: recipe.units } : {}),
      ...(per100 ? { valuesBy100: per100 } : {}),
      baseRecipe: recipe,
    })
  }

  for (const base of basesById.values()) resolve(base)
  return map
}

/**
 * Poids total des lignes, en grammes : c'est le rendement proposé d'une base (avant réduction ou égouttage).
 * `complete` est faux si une ligne n'a pas de poids connu (unité en ml sans densité, ingrédient introuvable…).
 */
export function linesGrams(
  lines: Pick<RecipeIngredientLine, 'ingredientRef' | 'recipeRef' | 'unit' | 'quantity'>[],
  ingredientsById: Map<string, Ingredient>
): { grams: number; complete: boolean } {
  let grams = 0
  let complete = true
  for (const line of lines) {
    if (!(line.quantity > 0)) continue
    if (!line.unit) {
      grams += line.quantity
      continue
    }
    const key = lineSourceKey(line)
    const ingredient = key ? ingredientsById.get(key) : undefined
    const unitGrams = ingredient ? gramsForUnit(ingredient, line.unit) : null
    if (unitGrams == null) complete = false
    else grams += unitGrams * line.quantity
  }
  return { grams, complete }
}

/** Grammes de base qu'une ligne utilise, `null` si son unité n'existe plus sur la base. */
function baseLineGrams(line: RecipeIngredientLine, base: Recipe): number | null {
  if (!line.unit) return line.quantity
  const unit = base.units?.[line.unit]
  return unit && unit.value > 0 ? unit.value * line.quantity : null
}

/**
 * Lignes d'ingrédients du catalogue seulement : chaque ligne de base est remplacée par les lignes de la base, au
 * prorata de la part de son rendement utilisée (30 g d'un bocal de 450 g = 1/15 de chaque ingrédient), en dépliant
 * les bases imbriquées. Sert à ce qu'il faut acheter et cuisiner. Une base sans rendement ne peut pas être partagée :
 * elle est signalée dans `skipped` et ne compte pas.
 * `coveredFraction` : part de chaque base (de la recette elle-même, pas des bases imbriquées) déjà couverte par le
 * stock ; seul le reste se déplie.
 */
export function expandRecipeLines(
  lines: RecipeIngredientLine[] | undefined,
  recipesById: Map<string, Recipe>,
  skipped?: { add: (label: string) => void } | string[],
  coveredFraction?: (baseId: string) => number,
  path: Set<string> = new Set()
): RecipeIngredientLine[] {
  const report = (label: string) => {
    if (!skipped) return
    if (Array.isArray(skipped)) { if (!skipped.includes(label)) skipped.push(label) } else skipped.add(label)
  }
  const result: RecipeIngredientLine[] = []
  for (const line of lines ?? []) {
    if (!isBaseLine(line)) {
      if (line.ingredientRef) result.push(line)
      continue
    }
    const id = lineBaseId(line)!
    const base = recipesById.get(id)
    if (!base) {
      report('Base introuvable')
      continue
    }
    if (path.has(id)) continue
    const yieldGrams = baseYield(base)
    const grams = baseLineGrams(line, base)
    if (!yieldGrams || grams == null) {
      report(`${base.title} (${yieldGrams ? 'unité introuvable' : 'rendement à compléter'})`)
      continue
    }
    const ratio = (grams / yieldGrams) * (1 - Math.min(1, Math.max(0, coveredFraction?.(id) ?? 0)))
    if (ratio <= 1e-9) continue
    const nested = expandRecipeLines(base.ingredients, recipesById, skipped, undefined, new Set([...path, id]))
    for (const sub of nested) result.push({ ...sub, quantity: sub.quantity * ratio })
  }
  return result
}

/** Ids des ingrédients du catalogue d'une recette, ceux de ses bases compris (filtres « contient… »). */
export function recipeIngredientIds(recipe: Recipe, recipesById: Map<string, Recipe>, path: Set<string> = new Set()): Set<string> {
  const ids = new Set<string>()
  for (const line of recipe.ingredients ?? []) {
    const ingredientId = refId(line.ingredientRef)
    if (ingredientId) ids.add(ingredientId)
    const baseId = lineBaseId(line)
    const base = baseId ? recipesById.get(baseId) : undefined
    if (base && !path.has(base.id) && base.id !== recipe.id) {
      for (const id of recipeIngredientIds(base, recipesById, new Set([...path, recipe.id]))) ids.add(id)
    }
  }
  return ids
}

/** Recettes qui utilisent directement la base. */
export const recipesUsingBase = (recipes: Recipe[], baseId: string): Recipe[] =>
  recipes.filter(r => r.id !== baseId && (r.ingredients ?? []).some(line => lineBaseId(line) === baseId))

/**
 * Bases qu'on ne peut pas mettre dans `baseId` sans créer de boucle : elle-même, et toutes celles qui la contiennent,
 * directement ou à travers d'autres bases.
 */
export function basesContaining(recipes: Recipe[], baseId: string): Set<string> {
  const blocked = new Set([baseId])
  let grew = true
  while (grew) {
    grew = false
    for (const r of recipes) {
      if (blocked.has(r.id) || !isBaseRecipe(r)) continue
      if ((r.ingredients ?? []).some((line) => { const id = lineBaseId(line); return !!id && blocked.has(id) })) {
        blocked.add(r.id)
        grew = true
      }
    }
  }
  return blocked
}
