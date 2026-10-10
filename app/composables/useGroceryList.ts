import type { InjectionKey } from 'vue'
import { getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'
import { useDocumentVisibility } from '@vueuse/core'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import type { IngredientCategory } from '~/types/ingredientCategory'
import type { DayRange } from '~/composables/useMeals'
import { compareGroceryLines, groceryLineFromItem, MISC_AISLE, type GroceryLine } from '~/utils/groceryList'
import { groupPlannedMeals, mealHasIngredients, plannedMealKey, type PlannedMealRow } from '~/utils/plannedMealRows'
import { buildShoppingList } from '~/utils/shoppingList'

export type GroceryMode = 'prepare' | 'store'

/** Une ligne de repas planifiés, avec ses parts saisies à la main le cas échéant. */
export interface GroceryMealRow extends PlannedMealRow {
  /** Parts planifiées dans les menus, pour une recette. */
  plannedParts?: number
  /** Les parts affichées ont été saisies à la main. */
  isPartsEdited: boolean
}

export interface GroceryAisleGroup {
  aisle: IngredientCategory
  pending: GroceryLine[]
  done: GroceryLine[]
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

/**
 * État de la page « Liste de courses », partagé par les modes « Lister » et « Acheter » : les articles de la
 * collection `shoppingList` et, pour en ajouter, les repas planifiés sur une période (ingrédients cumulés comme dans
 * `buildShoppingList`). Le mode, la période et les repas décochés restent locaux.
 */
export function useGroceryList() {
  const toast = useToast()
  const shoppingList = useShoppingList()
  const { recipesById, ingredientsById } = useFoodCatalog()
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

  // --- Source : repas planifiés sur la période ---

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

  const meals = useMealsBetween(range)
  watch(meals.error, (error) => {
    if (error) fail('Impossible de charger les repas')(error)
  })

  const rangeMeals = computed(() => (range.value ? meals.value : []))
  const plannedRows = computed(() => groupPlannedMeals(rangeMeals.value, recipesById.value, ingredientsById.value))

  /**
   * Parts de recette saisies à la main, par ligne (`recipe:<id>`), à la place des parts planifiées (invités, restes à
   * prévoir...). Remises à zéro au changement de période.
   */
  const partsOverrides = ref(new Map<string, number>())
  watch(range, () => {
    if (partsOverrides.value.size) partsOverrides.value = new Map()
  })

  /** Repas de la période aux parts saisies : chaque repas de la recette garde sa proportion du total, donc ses jours. */
  const adjustedMeals = computed(() => {
    if (!partsOverrides.value.size) return rangeMeals.value
    const plannedParts = new Map(plannedRows.value.map(row => [row.key, row.parts]))
    return rangeMeals.value.map((meal) => {
      if (meal.category !== 'RECIPE') return meal
      const key = plannedMealKey(meal)
      const override = partsOverrides.value.get(key)
      const planned = plannedParts.get(key)
      return override != null && planned ? { ...meal, value: meal.value * override / planned } : meal
    })
  })

  const mealRows = computed<GroceryMealRow[]>(() => {
    const plannedParts = new Map(plannedRows.value.map(row => [row.key, row.parts]))
    return groupPlannedMeals(adjustedMeals.value, recipesById.value, ingredientsById.value).map(row => ({
      ...row,
      plannedParts: plannedParts.get(row.key),
      isPartsEdited: partsOverrides.value.has(row.key),
    }))
  })
  const selectableMealRows = computed(() => mealRows.value.filter(row => row.isSelectable))

  /** Parts d'une recette saisies à la main ; `null`, ou les parts planifiées, reviennent aux menus. */
  function setMealParts(row: GroceryMealRow, parts: number | null) {
    const next = new Map(partsOverrides.value)
    if (parts == null || !(parts > 0) || parts === row.plannedParts) next.delete(row.key)
    else next.set(row.key, parts)
    partsOverrides.value = next
  }

  /** Recettes / aliments décochés (mangés dehors, déjà cuisinés...) : leurs ingrédients ne sont pas ajoutés. */
  const excludedMealKeys = ref(new Set<string>())

  const includedMeals = computed(() =>
    adjustedMeals.value.filter(meal => mealHasIngredients(meal) && !excludedMealKeys.value.has(plannedMealKey(meal))))
  const fromMenus = computed(() => buildShoppingList(includedMeals.value, recipesById.value, ingredientsById.value))

  function setMealIncluded(key: string, included: boolean) {
    const next = new Set(excludedMealKeys.value)
    if (included) next.delete(key)
    else next.add(key)
    excludedMealKeys.value = next
  }

  const areAllMealsIncluded = computed(() => selectableMealRows.value.every(row => !excludedMealKeys.value.has(row.key)))
  function toggleAllMeals() {
    excludedMealKeys.value = areAllMealsIncluded.value ? new Set(selectableMealRows.value.map(row => row.key)) : new Set()
  }

  /**
   * Sélection (période, repas décochés, parts saisies) déjà ajoutée à la liste : le bouton passe à « Ajouté » jusqu'au
   * prochain changement, pour ne pas cumuler deux fois les mêmes quantités par un double clic.
   */
  const selectionKey = computed(() => [
    range.value?.start.getTime(),
    range.value?.end.getTime(),
    [...excludedMealKeys.value].sort().join('|'),
    [...partsOverrides.value].map(([key, parts]) => `${key}=${parts}`).sort().join('|'),
  ].join('-'))
  const addedSelectionKey = ref<string | null>(null)
  const isSelectionAdded = computed(() => addedSelectionKey.value === selectionKey.value)
  const isAddingFromMenus = ref(false)

  async function addFromMenus() {
    const toAdd = fromMenus.value.items
    if (!toAdd.length || isAddingFromMenus.value) return
    isAddingFromMenus.value = true
    try {
      const { created, merged } = await shoppingList.addFromMenus(toAdd, ingredientsById.value)
      addedSelectionKey.value = selectionKey.value
      const details = [
        created ? `${plural(created, 'article')} ajouté${created > 1 ? 's' : ''}` : null,
        merged ? `${plural(merged, 'quantité')} complétée${merged > 1 ? 's' : ''}` : null,
      ].filter(Boolean).join(', ')
      toast.add({ title: 'Liste mise à jour', description: `${details}.`, color: 'success', icon: 'i-lucide-check' })
    }
    catch (error) {
      fail('Les ingrédients n\'ont pas pu être ajoutés')(error)
    }
    finally {
      isAddingFromMenus.value = false
    }
  }

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


  /** Fin des courses : les articles du panier et ceux déjà à la maison quittent la liste. */
  async function finishShopping() {
    try {
      const count = await shoppingList.finishShopping()
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

  async function clearAll() {
    try {
      const count = await shoppingList.clearAll()
      addedSelectionKey.value = null
      completionDismissed.value = false
      toast.add({ title: 'Liste vidée', description: `${plural(count, 'article')} supprimé${count > 1 ? 's' : ''}.`, color: 'neutral', icon: 'i-lucide-check' })
      return true
    }
    catch (error) {
      fail('La liste n\'a pas pu être vidée')(error)
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
    excludedMealKeys,
    areAllMealsIncluded,
    fromMenus,
    isSelectionAdded,
    isAddingFromMenus,
    skipped: computed(() => fromMenus.value.skipped),
    aisleOptions,
    lines,
    toBuy,
    atHomeLines,
    aisles,
    doneCount,
    isComplete,
    completionDismissed,
    setMealIncluded,
    setMealParts,
    toggleAllMeals,
    addFromMenus,
    toggleAtHome,
    toggleInCart,
    isAddItemOpen,
    addManual,
    setQuantity,
    toggleUrgent,
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
