import type { InjectionKey } from 'vue'
import { parseDate, type DateValue } from '@internationalized/date'
import { addDays, format, startOfWeek } from 'date-fns'
import type { IngredientCategory } from '~/types/ingredientCategory'
import type { GroceryLine, ManualItem, PlannedMeal } from '~/utils/groceryList'
import { formatShoppingListText } from '~/utils/shoppingList'

export type GroceryMode = 'prepare' | 'store'
export type GroceryScenario = 'week' | 'in-progress' | 'no-meals' | 'empty'

export const GROCERY_SCENARIO_LABELS: Record<GroceryScenario, string> = {
  'week': 'Semaine complète',
  'in-progress': 'Courses en cours',
  'no-meals': 'Aucun repas planifié',
  'empty': 'Liste vide',
}

export interface GroceryAisleGroup {
  aisle: IngredientCategory
  pending: GroceryLine[]
  done: GroceryLine[]
}

/**
 * État de la liste de courses, partagé par les modes « Préparer » et « En magasin ».
 * Maquette en mémoire : les repas viennent d'une semaine d'exemple, pas encore de Firestore.
 */
export function useGroceryList() {
  const toast = useToast()

  const mode = ref<GroceryMode>('prepare')
  const scenario = ref<GroceryScenario>('week')

  const plannedMeals = ref<PlannedMeal[]>([])
  const manualItems = ref<ManualItem[]>([])
  /** Repas décochés dans la colonne source : leurs ingrédients sortent de la liste. */
  const excludedMealKeys = ref(new Set<string>())
  /** Articles déjà à la maison : retirés de la liste à acheter, réaffichables. */
  const atHome = ref(new Set<string>())
  /** Articles mis dans le panier (mode magasin). */
  const inCart = ref(new Set<string>())
  /** Articles achetés puis vidés de la liste. */
  const cleared = ref(new Set<string>())
  const completionDismissed = ref(false)

  const toDateValue = (date: Date) => parseDate(format(date, 'yyyy-MM-dd'))
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const dateRange = shallowRef<{ start: DateValue | undefined, end: DateValue | undefined }>({
    start: toDateValue(monday),
    end: toDateValue(addDays(monday, 6)),
  })

  const range = computed(() => {
    const { start, end } = dateRange.value ?? {}
    if (!start || !end || start.compare(end) > 0) return null
    return { start: start.toString(), end: end.toString() }
  })

  function loadScenario(value: GroceryScenario) {
    scenario.value = value
    plannedMeals.value = value === 'week' || value === 'in-progress' ? buildSamplePlannedMeals() : []
    manualItems.value = value === 'empty' ? [] : [...SAMPLE_MANUAL_ITEMS]
    excludedMealKeys.value = new Set()
    atHome.value = new Set(value === 'in-progress' ? SAMPLE_AT_HOME_IN_PROGRESS : value === 'week' ? SAMPLE_AT_HOME : [])
    inCart.value = new Set(value === 'in-progress' ? SAMPLE_IN_CART : [])
    cleared.value = new Set()
    completionDismissed.value = false
    mode.value = value === 'in-progress' ? 'store' : 'prepare'
  }

  // --- Source : repas planifiés sur la période ---

  const mealsInRange = computed(() => {
    const r = range.value
    return r ? plannedMeals.value.filter(m => m.date >= r.start && m.date <= r.end) : []
  })
  const mealRows = computed(() => groupPlannedMeals(mealsInRange.value))
  const selectableMealRows = computed(() => mealRows.value.filter(row => row.selectable))
  const includedMeals = computed(() => mealsInRange.value.filter(m => !excludedMealKeys.value.has(plannedMealKey(m))))
  const generated = computed(() => buildGeneratedLines(includedMeals.value))

  const toggled = (set: Set<string>, id: string, keep?: boolean) => {
    const next = new Set(set)
    if (keep ?? !next.has(id)) next.add(id)
    else next.delete(id)
    return next
  }

  function setMealIncluded(key: string, included: boolean) {
    excludedMealKeys.value = toggled(excludedMealKeys.value, key, !included)
  }

  const areAllMealsIncluded = computed(() => selectableMealRows.value.every(row => !excludedMealKeys.value.has(row.key)))
  function toggleAllMeals() {
    excludedMealKeys.value = areAllMealsIncluded.value ? new Set(selectableMealRows.value.map(row => row.key)) : new Set()
  }

  // --- Liste ---

  const lines = computed(() =>
    [...generated.value.lines, ...manualItems.value.map(manualGroceryLine)]
      .filter(line => !cleared.value.has(line.id))
      .sort(compareGroceryLines),
  )
  const toBuy = computed(() => lines.value.filter(line => !atHome.value.has(line.id)))
  const atHomeLines = computed(() => lines.value.filter(line => atHome.value.has(line.id)))

  function groupByAisle(list: GroceryLine[]): GroceryAisleGroup[] {
    const groups: GroceryAisleGroup[] = []
    for (const line of list) {
      let group = groups.at(-1)
      if (group?.aisle.id !== line.aisle.id) {
        group = { aisle: line.aisle, pending: [], done: [] }
        groups.push(group)
      }
      if (inCart.value.has(line.id)) group.done.push(line)
      else group.pending.push(line)
    }
    return groups
  }

  const aisles = computed(() => groupByAisle(toBuy.value))
  const doneCount = computed(() => toBuy.value.filter(line => inCart.value.has(line.id)).length)
  const isComplete = computed(() => toBuy.value.length > 0 && doneCount.value === toBuy.value.length)

  function toggleAtHome(id: string) {
    atHome.value = toggled(atHome.value, id)
    inCart.value = toggled(inCart.value, id, false)
  }

  function toggleInCart(id: string) {
    inCart.value = toggled(inCart.value, id)
    completionDismissed.value = false
  }

  function addManual(label: string, aisle: IngredientCategory = MISC_AISLE) {
    const trimmed = label.trim()
    if (!trimmed) return false
    const id = `manual-${Date.now()}`
    manualItems.value = [...manualItems.value, { id, label: trimmed.charAt(0).toUpperCase() + trimmed.slice(1), aisle }]
    return true
  }

  function removeManual(id: string) {
    manualItems.value = manualItems.value.filter(item => item.id !== id)
  }

  /** Retire de la liste tout ce qui est dans le panier : les ajouts manuels disparaissent, les ingrédients sont masqués. */
  function clearCart() {
    const ids = [...inCart.value]
    manualItems.value = manualItems.value.filter(item => !inCart.value.has(item.id))
    cleared.value = new Set([...cleared.value, ...ids])
    inCart.value = new Set()
    completionDismissed.value = false
    toast.add({ title: 'Liste vidée', description: `${ids.length} article${ids.length > 1 ? 's' : ''} retiré${ids.length > 1 ? 's' : ''} de la liste.`, color: 'neutral', icon: 'i-lucide-check' })
  }

  /** Recalcule la liste depuis les menus (les ajouts manuels encore présents sont conservés). */
  function regenerate() {
    cleared.value = new Set()
    inCart.value = new Set()
  }

  async function copyForTodoist() {
    const generatedText = formatShoppingListText(toBuy.value.filter(line => line.item).map(line => line.item!))
    const manualText = toBuy.value.filter(line => line.manual).map(line => line.label).join('\n')
    try {
      await navigator.clipboard.writeText([generatedText, manualText].filter(Boolean).join('\n'))
      const count = toBuy.value.length
      toast.add({ title: 'Liste copiée', description: `${count} article${count > 1 ? 's' : ''} à coller dans Todoist.`, color: 'success', icon: 'i-lucide-clipboard-check' })
    }
    catch (error: any) {
      toast.add({ title: 'Erreur', description: `La liste n'a pas pu être copiée : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
    }
  }

  loadScenario('week')

  return reactive({
    mode,
    scenario,
    dateRange,
    range,
    mealRows,
    selectableMealRows,
    excludedMealKeys,
    areAllMealsIncluded,
    skipped: computed(() => generated.value.skipped),
    lines,
    toBuy,
    atHomeLines,
    aisles,
    doneCount,
    isComplete,
    completionDismissed,
    inCart,
    loadScenario,
    setMealIncluded,
    toggleAllMeals,
    toggleAtHome,
    toggleInCart,
    addManual,
    removeManual,
    clearCart,
    regenerate,
    copyForTodoist,
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
