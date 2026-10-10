import type { InjectionKey } from 'vue'
import { getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'
import { useDocumentVisibility } from '@vueuse/core'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import type { IngredientCategory } from '~/types/ingredientCategory'
import type { DayRange } from '~/composables/useMeals'
import type { InclusionDraft } from '~/composables/useShoppingList'
import type { Meal } from '~/types/meal'
import type { ShoppingMealInclusion } from '~/types/shoppingList'
import { compareGroceryLines, groceryLineFromItem, MISC_AISLE, type GroceryLine } from '~/utils/groceryList'
import { groupPlannedMeals, plannedMealKey, type PlannedMealRow } from '~/utils/plannedMealRows'
import { mealDay } from '~/utils/shoppingList'
import type { ShoppingCatalog } from '~/utils/shoppingPlan'

export type GroceryMode = 'prepare' | 'store'

/** Une ligne de repas de la fenêtre, avec sa présence dans la liste. */
export interface GroceryMealRow extends PlannedMealRow {
  /** Repas de la fenêtre regroupés sur cette ligne. */
  meals: Meal[]
  /** Parts planifiées dans les menus, pour une recette. */
  plannedParts?: number
  /** Les parts retenues diffèrent de celles des menus. */
  isPartsEdited: boolean
  /** Tous les repas de la ligne sont dans la liste. */
  isChecked: boolean
  /** Une partie seulement (ex. la période s'est étendue à un nouveau repas de la recette). */
  isIndeterminate: boolean
  /** Au moins un repas déjà acheté : ses parts ne se modifient plus. */
  hasBought: boolean
  /** Tous achetés : la ligne est verrouillée. */
  isLocked: boolean
}

/** Repas inclus dans la fenêtre mais disparus des menus depuis. */
export interface GroceryOrphanRow {
  key: string
  label: string
  inclusions: ShoppingMealInclusion[]
  isBought: boolean
}

export interface GroceryAisleGroup {
  aisle: IngredientCategory
  pending: GroceryLine[]
  done: GroceryLine[]
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

/**
 * État de la page « Liste de courses », partagé par les modes « Lister » et « Acheter » : les articles de la
 * collection `shoppingList` et les repas planifiés d'une période, cochés s'ils sont dans la liste. Cocher, décocher ou
 * changer des parts met la liste à jour aussitôt (voir `planItemWrites`). Le mode et la période restent locaux.
 */
export function useGroceryList() {
  const toast = useToast()
  const shoppingList = useShoppingList()
  const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()
  const categoriesStore = useIngredientCategoriesStore()

  const mode = ref<GroceryMode>('prepare')
  const completionDismissed = ref(false)

  /** Jour courant (minuit) : urgence et fragilité en dépendent. Remis à jour au retour sur l'onglet, la page pouvant rester ouverte d'un jour à l'autre. */
  const today = shallowRef(startOfDay(new Date()))
  const visibility = useDocumentVisibility()
  watch(visibility, (state) => {
    const now = startOfDay(new Date())
    if (state === 'visible' && !isSameDay(now, today.value)) today.value = now
  })

  const fail = (action: string) => (error: any) => {
    toast.add({ title: 'Erreur', description: `${action} : ${error?.message || 'une erreur est survenue'}.`, color: 'error' })
  }

  // --- Rayons ---

  const aisleOf = (categoryId?: string) => (categoryId && categoriesStore.getCategoryById(categoryId)) || MISC_AISLE

  /** Rayons proposés pour un ajout manuel : « Divers », puis le catalogue dans son ordre. */
  const aisleOptions = computed(() => [
    MISC_AISLE,
    ...[...categoriesStore.categories].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fr')),
  ])

  // --- Source : repas planifiés sur la période, reflétés dans la liste ---

  const toDateValue = (date: Date) => parseDate(format(date, 'yyyy-MM-dd'))
  // Par défaut, les 7 prochains jours à partir d'aujourd'hui : les repas déjà passés n'ont plus rien à acheter.
  const firstDay = today.value
  const dateRange = shallowRef<{ start: DateValue | undefined, end: DateValue | undefined }>({
    start: toDateValue(firstDay),
    end: toDateValue(addDays(firstDay, 6)),
  })

  /** `null` tant que la plage n'est pas complète ou si la fin précède le début. */
  const range = computed<DayRange | null>(() => {
    const { start, end } = dateRange.value ?? {}
    if (!start || !end || start.compare(end) > 0) return null
    return { start: start.toDate(getLocalTimeZone()), end: end.toDate(getLocalTimeZone()) }
  })
  const rangeDays = computed(() => (range.value
    ? { start: format(range.value.start, 'yyyy-MM-dd'), end: format(range.value.end, 'yyyy-MM-dd') }
    : null))

  const meals = useMealsBetween(range)
  watch(meals.error, (error) => {
    if (error) fail('Impossible de charger les repas')(error)
  })

  const rangeMeals = computed(() => (range.value ? meals.value : []))
  const inclusionByMealId = computed(() => new Map(shoppingList.inclusions.value.map(inclusion => [inclusion.mealId, inclusion])))

  /** Sans recettes ni ingrédients chargés, un recalcul viderait la liste : les gestes attendent le catalogue. */
  const isCatalogReady = computed(() => !recipes.pending.value && !ingredients.pending.value)
  const catalog = (): ShoppingCatalog => ({ recipesById: recipesById.value, ingredientsById: ingredientsById.value })

  const formatParts = (parts: number) => `${parts.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} part${parts > 1 ? 's' : ''}`

  /** La fenêtre (la période) montre ses repas, cochés s'ils sont dans la liste ; la changer ne retire rien de la liste. */
  const mealRows = computed<GroceryMealRow[]>(() => {
    const mealsByKey = new Map<string, Meal[]>()
    for (const meal of rangeMeals.value) {
      const key = plannedMealKey(meal)
      mealsByKey.set(key, [...(mealsByKey.get(key) ?? []), meal])
    }
    return groupPlannedMeals(rangeMeals.value, recipesById.value, ingredientsById.value).map((row) => {
      const rowMeals = mealsByKey.get(row.key) ?? []
      const rowInclusions = rowMeals.map(meal => inclusionByMealId.value.get(meal.id))
      const includedCount = rowInclusions.filter(Boolean).length
      const boughtCount = rowInclusions.filter(inclusion => inclusion?.state === 'bought').length
      const isRecipe = row.key.startsWith('recipe:')
      const parts = isRecipe
        ? rowMeals.reduce((sum, meal, i) => sum + (rowInclusions[i]?.parts ?? (meal.category === 'RECIPE' ? meal.value : 0)), 0)
        : undefined
      const isPartsEdited = isRecipe && rowMeals.some((meal, i) => {
        const included = rowInclusions[i]?.parts
        return meal.category === 'RECIPE' && included != null && Math.abs(included - meal.value) > 1e-6
      })
      return {
        ...row,
        ...(parts != null ? { parts, quantityLabel: formatParts(parts) } : {}),
        meals: rowMeals,
        plannedParts: row.parts,
        isPartsEdited,
        isChecked: row.isSelectable && rowMeals.length > 0 && includedCount === rowMeals.length,
        isIndeterminate: includedCount > 0 && includedCount < rowMeals.length,
        hasBought: boughtCount > 0,
        isLocked: boughtCount > 0 && boughtCount === rowMeals.length,
      }
    })
  })
  const selectableMealRows = computed(() => mealRows.value.filter(row => row.isSelectable))
  const includedRowCount = computed(() => mealRows.value.filter(row => row.isChecked || row.isIndeterminate).length)

  /** Repas inclus dans la fenêtre mais disparus des menus depuis : à retirer de la liste à la main. */
  const orphanRows = computed<GroceryOrphanRow[]>(() => {
    const days = rangeDays.value
    if (!days || meals.pending.value) return []
    const windowMealIds = new Set(rangeMeals.value.map(meal => meal.id))
    const byKey = new Map<string, ShoppingMealInclusion[]>()
    for (const inclusion of shoppingList.inclusions.value) {
      if (inclusion.date < days.start || inclusion.date > days.end || windowMealIds.has(inclusion.mealId)) continue
      byKey.set(inclusion.key, [...(byKey.get(inclusion.key) ?? []), inclusion])
    }
    return [...byKey].map(([key, inclusions]) => {
      const first = inclusions[0]!
      const label = first.recipeId
        ? recipesById.value.get(first.recipeId)?.title ?? 'Recette introuvable'
        : ingredientsById.value.get(first.ingredientId ?? '')?.label ?? 'Aliment introuvable'
      return { key, label, inclusions, isBought: inclusions.every(inclusion => inclusion.state === 'bought') }
    })
  })

  /** Ce qu'un repas apporte à la liste ; `parts` remplace les parts planifiées d'une recette. */
  function draftFor(meal: Meal, parts?: number): InclusionDraft | null {
    const base = { mealId: meal.id, date: mealDay(meal), key: plannedMealKey(meal), state: 'listed' as const }
    switch (meal.category) {
      case 'RECIPE': return { ...base, recipeId: meal.recipeId, parts: parts ?? meal.value }
      case 'INGREDIENT': return { ...base, ingredientId: meal.ingredientId, quantity: meal.quantity, unitId: meal.unitId ?? null }
      case 'RAW': return null
    }
  }

  /**
   * Les gestes s'enchaînent dans l'ordre : chacun calcule ses écarts sur l'état laissé par le précédent. On attend son
   * écriture, ou au plus 400 ms (hors ligne, l'écriture n'aboutit qu'à la synchronisation mais s'affiche tout de suite).
   */
  let queue: Promise<unknown> = Promise.resolve()
  /** Ajoute une tâche à la file ; un échec ne bloque pas les suivantes. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task)
    queue = run.catch(() => {})
    return run
  }

  function plan(action: string, change: () => { upserts: InclusionDraft[], removals: ShoppingMealInclusion[] }) {
    if (!isCatalogReady.value) return
    void enqueue(async () => {
      try {
        const { upserts, removals } = change()
        if (!upserts.length && !removals.length) return
        const write = shoppingList.applyInclusions(upserts, removals, catalog())
        write.then((skipped) => {
          if (skipped.length) toast.add({ title: 'Non compté', description: `${skipped.join(', ')}.`, color: 'warning', icon: 'i-lucide-info' })
        }).catch(fail(action))
        await Promise.race([write.catch(() => {}), new Promise(resolve => setTimeout(resolve, 400))])
      }
      catch (error) {
        fail(action)(error)
      }
    })
  }

  const listedOf = (rowMeals: Meal[]) => rowMeals.flatMap((meal) => {
    const inclusion = inclusionByMealId.value.get(meal.id)
    return inclusion?.state === 'listed' ? [inclusion] : []
  })
  const missingDrafts = (rowMeals: Meal[]) => rowMeals.flatMap((meal) => {
    const draft = inclusionByMealId.value.has(meal.id) ? null : draftFor(meal)
    return draft ? [draft] : []
  })

  /** Coché (ou en partie) : ajoute les repas manquants ; coché en entier : retire ceux qui ne sont pas encore achetés. */
  function toggleRow(row: GroceryMealRow) {
    if (!row.isSelectable || row.isLocked) return
    const isChecked = row.isChecked
    plan('La liste n\'a pas pu être mise à jour', () => isChecked
      ? { upserts: [], removals: listedOf(row.meals) }
      : { upserts: missingDrafts(row.meals), removals: [] })
  }

  const areAllMealsIncluded = computed(() => selectableMealRows.value.length > 0 && selectableMealRows.value.every(row => row.isChecked))
  function toggleAllMeals() {
    const rows = selectableMealRows.value
    const allIncluded = areAllMealsIncluded.value
    plan('La liste n\'a pas pu être mise à jour', () => allIncluded
      ? { upserts: [], removals: rows.flatMap(row => listedOf(row.meals)) }
      : { upserts: rows.flatMap(row => missingDrafts(row.meals)), removals: [] })
  }

  /**
   * Parts d'une recette pour toute la fenêtre : chaque repas garde sa proportion du total, donc ses jours ; la recette
   * est incluse au passage. `null` revient aux parts des menus.
   */
  function setRowParts(row: GroceryMealRow, parts: number | null) {
    if (!row.key.startsWith('recipe:') || row.hasBought || !row.plannedParts) return
    const planned = row.plannedParts
    plan('Les parts n\'ont pas pu être modifiées', () => ({
      upserts: row.meals.flatMap((meal) => {
        if (meal.category !== 'RECIPE') return []
        const draft = draftFor(meal, parts == null ? meal.value : meal.value * parts / planned)
        return draft ? [draft] : []
      }),
      removals: [],
    }))
  }

  function removeOrphans(row: GroceryOrphanRow) {
    plan('La liste n\'a pas pu être mise à jour', () => ({
      upserts: [],
      removals: row.inclusions.filter(inclusion => inclusion.state === 'listed'),
    }))
  }

  /** Les inclusions des repas passés depuis plus de 2 jours ne servent plus : supprimées une fois chargées. */
  const stopPrune = watch(() => shoppingList.inclusions.pending.value, (pending) => {
    if (pending) return
    shoppingList.pruneInclusions(format(addDays(today.value, -2), 'yyyy-MM-dd')).catch(() => {})
    queueMicrotask(() => stopPrune())
  }, { immediate: true })

  // --- Liste ---

  const isLoading = computed(() => shoppingList.items.pending.value && !shoppingList.items.value.length)
  const lines = computed(() => shoppingList.items.value.map(item => groceryLineFromItem(item, aisleOf, today.value)).sort(compareGroceryLines))
  /** À acheter, panier compris : les articles cochés en magasin restent dans la liste jusqu'à la fin des courses. */
  const toBuy = computed(() => lines.value.filter(line => line.status !== 'atHome'))
  const atHomeLines = computed(() => lines.value.filter(line => line.status === 'atHome'))

  const aisles = computed(() => {
    const groups: GroceryAisleGroup[] = []
    for (const line of toBuy.value) {
      let group = groups.at(-1)
      if (group?.aisle.id !== line.aisle.id) {
        group = { aisle: line.aisle, pending: [], done: [] }
        groups.push(group)
      }
      if (line.status === 'inCart') group.done.push(line)
      else group.pending.push(line)
    }
    return groups
  })

  const doneCount = computed(() => toBuy.value.filter(line => line.status === 'inCart').length)
  const isComplete = computed(() => toBuy.value.length > 0 && doneCount.value === toBuy.value.length)

  function toggleAtHome(line: GroceryLine) {
    shoppingList.setStatus(line.item, line.status === 'atHome' ? 'toBuy' : 'atHome')
      .catch(fail(`« ${line.label} » n'a pas pu être modifié`))
  }

  function toggleInCart(line: GroceryLine) {
    completionDismissed.value = false
    shoppingList.setStatus(line.item, line.status === 'inCart' ? 'toBuy' : 'inCart')
      .catch(fail(`« ${line.label} » n'a pas pu être modifié`))
  }

  /** Modale d'ajout manuel, ouverte depuis les deux modes. */
  const isAddItemOpen = ref(false)

  function addManual(label: string, aisle: IngredientCategory = MISC_AISLE, quantity = '') {
    const trimmed = label.trim()
    if (!trimmed) return false
    shoppingList.addManual(
      trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
      aisle.id === MISC_AISLE.id ? undefined : aisle.id,
      quantity.trim() || undefined,
    ).catch(fail(`« ${trimmed} » n'a pas pu être ajouté`))
    return true
  }

  /** Enregistre la quantité saisie ; vide ou identique au calcul : revient à la quantité calculée. */
  function toggleUrgent(line: GroceryLine) {
    shoppingList.setUrgent(line.item, !line.isMarkedUrgent).catch(fail(`« ${line.label} » n'a pas pu être modifié`))
  }

  function setQuantity(line: GroceryLine, value: string | null) {
    const trimmed = value?.trim() ?? ''
    const quantity = trimmed && trimmed !== line.computedQuantityLabel ? trimmed : null
    if (quantity === (line.item.quantity ?? null)) return
    shoppingList.setQuantity(line.item, quantity).catch(fail(`La quantité de « ${line.label} » n'a pas pu être modifiée`))
  }

  /** Retire un ajout manuel ; un article venu des menus se retire en décochant ses repas. */
  function removeManual(line: GroceryLine) {
    if (!line.manual) return
    shoppingList.removeManual(line.item).catch(fail(`« ${line.label} » n'a pas pu être retiré`))
  }

  /**
   * Fin des courses : les articles du panier et ceux déjà à la maison quittent la liste, leurs repas sont marqués
   * achetés. Passe par la file des gestes, pour ne pas croiser un recalcul en cours.
   */
  async function finishShopping() {
    try {
      const count = await enqueue(() => shoppingList.finishShopping(catalog()))
      completionDismissed.value = false
      mode.value = 'prepare'
      const left = toBuy.value.length
      toast.add({
        title: 'Courses terminées',
        description: `${plural(count, 'article')} retiré${count > 1 ? 's' : ''} de la liste${left ? `, ${plural(left, 'article')} encore à acheter` : ''}.`,
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    catch (error) {
      fail('Les courses n\'ont pas pu être terminées')(error)
    }
  }

  /** Repartir de zéro : tous les articles retirés et les repas décochés ; ce qui a été acheté reste mémorisé. */
  async function clearAll() {
    try {
      const count = await enqueue(() => shoppingList.clearAll())
      completionDismissed.value = false
      toast.add({ title: 'Liste remise à zéro', description: `${plural(count, 'article')} retiré${count > 1 ? 's' : ''}, repas décochés.`, color: 'neutral', icon: 'i-lucide-check' })
      return true
    }
    catch (error) {
      fail('La liste n\'a pas pu être remise à zéro')(error)
      return false
    }
  }

  return reactive({
    mode,
    isLoading,
    isLoadingMeals: computed(() => meals.pending.value),
    dateRange,
    range,
    mealRows,
    selectableMealRows,
    includedRowCount,
    orphanRows,
    areAllMealsIncluded,
    isCatalogReady,
    aisleOptions,
    lines,
    toBuy,
    atHomeLines,
    aisles,
    doneCount,
    isComplete,
    completionDismissed,
    toggleRow,
    setRowParts,
    toggleAllMeals,
    removeOrphans,
    toggleAtHome,
    toggleInCart,
    isAddItemOpen,
    addManual,
    setQuantity,
    toggleUrgent,
    removeManual,
    finishShopping,
    clearAll,
  })
}

export type GroceryListState = ReturnType<typeof useGroceryList>

/** La page fournit l'état, les vues des deux modes le récupèrent. */
export const GROCERY_LIST_KEY: InjectionKey<GroceryListState> = Symbol('groceryList')

export function useInjectedGroceryList(): GroceryListState {
  const list = inject(GROCERY_LIST_KEY)
  if (!list) throw new Error('useInjectedGroceryList doit être appelé sous la page Liste de courses')
  return list
}

/** Gestes du détail d'un article (`GroceryLineName`) : fournis par la page Liste de courses, ou par l'accueil. */
export type GroceryLineActions = Pick<GroceryListState, 'toggleUrgent' | 'removeManual'>

export const GROCERY_LINE_ACTIONS_KEY: InjectionKey<GroceryLineActions> = Symbol('groceryLineActions')

export function useInjectedGroceryLineActions(): GroceryLineActions {
  const actions = inject(GROCERY_LINE_ACTIONS_KEY)
  if (!actions) throw new Error('useInjectedGroceryLineActions doit être appelé sous une page qui fournit les gestes d\'un article')
  return actions
}
