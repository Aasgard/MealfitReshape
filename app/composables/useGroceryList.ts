import type { InjectionKey } from 'vue'
import { getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'
import { useDocumentVisibility, useLocalStorage } from '@vueuse/core'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import type { IngredientCategory } from '~/types/ingredientCategory'
import { useCurrentUser } from 'vuefire'
import type { HouseholdMember } from '~/composables/useHousehold'
import type { DayRange } from '~/composables/useMeals'
import type { InclusionDraft } from '~/composables/useShoppingList'
import type { Meal } from '~/types/meal'
import type { ShoppingMealInclusion } from '~/types/shoppingList'
import { compareGroceryLines, groceryLineFromItem, MISC_AISLE, type GroceryLine } from '~/utils/groceryList'
import { groupPlannedMeals, isPlannedMeal, plannedMealKey, type PlannedMealRow } from '~/utils/plannedMealRows'
import { surplusMeals } from '~/utils/preparedDishes'
import { mealDay } from '~/utils/shoppingList'
import type { ShoppingCatalog } from '~/utils/shoppingPlan'
import { storeNameKey, type StoreColor } from '~/utils/stores'

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
  /** Autres membres du foyer qui ont prévu des repas de la ligne. */
  plannedBy: HouseholdMember[]
  /** Le compte connecté en a prévu aussi. */
  isPlannedBySelf: boolean
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

/** Une option du choix de magasin : « Tous » ou un magasin. */
export interface GroceryStoreChoice {
  value: string
  label: string
  /** Couleur d'enseigne d'un magasin (`STORE_COLORS`) ; absente pour « Tous ». */
  color?: StoreColor
  /** Articles qui restent à acheter dans ce choix. */
  count: number
}

/** Filtre du mode Lister et choix du mode Acheter : tous les articles. */
export const ALL_STORES = 'all'

/** Un article sans magasin s'achète partout : il est visible dans chaque magasin. */
export const isSoldAt = (line: GroceryLine, storeId: string) => !line.storeIds?.length || line.storeIds.includes(storeId)

/** État d'un magasin pour une sélection d'articles : tous l'ont, certains, ou aucun. */
export type StoreCheckState = boolean | 'indeterminate'

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

/**
 * État de la page « Liste de courses », partagé par les modes « Lister » et « Acheter » : les articles de la
 * collection `shoppingList` et les repas planifiés d'une période par tous les membres du foyer, cochés s'ils sont dans
 * la liste. Cocher, décocher ou changer des parts met la liste à jour aussitôt (voir `planItemWrites`). Le mode et la
 * période restent locaux.
 */
export function useGroceryList() {
  const toast = useToast()
  const user = useCurrentUser()
  const shoppingList = useShoppingList()
  const stores = shoppingList.stores
  const personal = usePersonalShoppingItems()
  const { household } = useHousehold()

  /** Autres membres du foyer, par id : leurs repas et leurs ajouts portent leur avatar. */
  const othersById = computed(() => new Map((household.value?.members ?? []).filter(m => !m.isSelf).map(m => [m.id, m])))
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

  const { meals, isLoading: isLoadingMeals } = useHouseholdMealsBetween(range)
  watch(meals.error, (error) => {
    if (error) fail('Impossible de charger les repas')(error)
  })

  /** Repas de la période, sans ceux pris dans le stock (rien à acheter), avec les surplus prévus des fournées du foyer. */
  const { dishes } = usePreparedDishes()
  const rangeMeals = computed(() => (range.value
    ? [...meals.value.filter(isPlannedMeal), ...surplusMeals(dishes.value, rangeDays.value)]
    : []))
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
        plannedBy: [...new Set(rowMeals.map(meal => meal.user))].flatMap(id => othersById.value.get(id) ?? []),
        isPlannedBySelf: rowMeals.some(meal => meal.user === user.value?.uid),
      }
    })
  })
  const selectableMealRows = computed(() => mealRows.value.filter(row => row.isSelectable))
  const includedRowCount = computed(() => mealRows.value.filter(row => row.isChecked || row.isIndeterminate).length)

  /** Repas inclus dans la fenêtre mais disparus des menus depuis : à retirer de la liste à la main. */
  const orphanRows = computed<GroceryOrphanRow[]>(() => {
    const days = rangeDays.value
    if (!days || isLoadingMeals.value) return []
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
      case 'RAW':
      case 'STOCK': return null
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

  /** Ingrédients qu'apportent des repas ajoutés à la liste. */
  function draftIngredientIds(drafts: InclusionDraft[]) {
    const ids = new Set<string>()
    for (const draft of drafts) {
      if (draft.ingredientId) ids.add(draft.ingredientId)
      const recipe = draft.recipeId ? recipesById.value.get(draft.recipeId) : undefined
      for (const line of recipe?.ingredients ?? []) {
        if (line.ingredientRef) ids.add(line.ingredientRef.id)
      }
    }
    return ids
  }

  /**
   * Un repas coché apporte un ingrédient qui a déjà un complément à acheter (« Vérifier un article ») : le complément
   * risque de faire doublon, on propose de le retirer.
   */
  function offerComplementRemoval(drafts: InclusionDraft[]) {
    const ids = draftIngredientIds(drafts)
    const complements = shoppingList.items.value.filter(item =>
      item.status === 'toBuy' && item.complementOf && ids.has(item.complementOf.ingredientId))
    for (const item of complements) {
      toast.add({
        title: `${item.label} : toujours utile ?`,
        description: 'Ce repas ajoute déjà cet ingrédient à la liste. Le complément risque de faire doublon.',
        color: 'neutral',
        icon: 'i-lucide-scale',
        duration: 10000,
        actions: [{
          label: 'Retirer le complément',
          color: 'neutral',
          variant: 'outline',
          onClick: () => {
            shoppingList.removeManual(item).catch(fail(`« ${item.label} » n'a pas pu être retiré`))
          },
        }],
      })
    }
  }

  function plan(action: string, change: () => { upserts: InclusionDraft[], removals: ShoppingMealInclusion[] }) {
    if (!isCatalogReady.value) return
    void enqueue(async () => {
      try {
        const { upserts, removals } = change()
        if (!upserts.length && !removals.length) return
        // Repas nouvellement inclus, ou recette dont les parts augmentent : la liste en demande davantage.
        const added = upserts.filter((draft) => {
          const previous = inclusionByMealId.value.get(draft.mealId)
          return !previous || (draft.parts ?? 0) > (previous.parts ?? 0) + 1e-6
        })
        const write = shoppingList.applyInclusions(upserts, removals, catalog())
        write.then((skipped) => {
          if (skipped.length) toast.add({ title: 'Non compté', description: `${skipped.join(', ')}.`, color: 'warning', icon: 'i-lucide-info' })
          if (added.length) offerComplementRemoval(added)
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

  const isLoading = computed(() => !shoppingList.scope.value || (shoppingList.items.pending.value && !shoppingList.items.value.length))
  const lines = computed(() => shoppingList.items.value
    .map(item => ({
      ...groceryLineFromItem(item, aisleOf, today.value),
      addedBy: item.addedBy ? othersById.value.get(item.addedBy) : undefined,
      storeIds: stores.knownStoreIds(item.storeIds),
    }))
    .sort(compareGroceryLines))
  /** À acheter, panier compris : les articles cochés en magasin restent dans la liste jusqu'à la fin des courses. */
  const toBuy = computed(() => lines.value.filter(line => line.status !== 'atHome'))
  const atHomeLines = computed(() => lines.value.filter(line => line.status === 'atHome'))

  // --- Magasins ---

  /** Sans magasin (Réglages › Magasins), la liste reste unique : ni filtre, ni choix de magasin, ni rattachement. */
  const hasStores = computed(() => stores.stores.value.length > 0)
  /** Magasins d'une liste d'ids, dans leur ordre ; les ids inconnus sont ignorés. */
  const storesOf = (ids: readonly string[] | undefined) => (ids ?? []).flatMap(id => stores.storesById.value.get(id) ?? [])
  /** « Biocoop, Picard » : pour les lecteurs d'écran et les messages. */
  const storeLabel = (ids: readonly string[] | undefined) => storesOf(ids).map(store => store.name).join(', ')

  /** Mode Lister : `ALL_STORES` ou l'id d'un magasin. */
  const listFilter = ref(ALL_STORES)
  const listFilterStoreId = computed(() => stores.storesById.value.has(listFilter.value) ? listFilter.value : null)

  /** Mode Lister : les articles à acheter que montre le filtre. */
  const filteredToBuy = computed(() => {
    const storeId = listFilterStoreId.value
    return storeId ? toBuy.value.filter(line => isSoldAt(line, storeId)) : toBuy.value
  })

  /** « Tous », puis les magasins où il y a quelque chose à acheter : un magasin sans article n'est pas proposé. */
  const listFilterChoices = computed<GroceryStoreChoice[]>(() => [
    { value: ALL_STORES, label: 'Tous', count: toBuy.value.length },
    ...stores.stores.value
      .map(store => ({ value: store.id, label: store.name, color: store.color, count: toBuy.value.filter(line => isSoldAt(line, store.id)).length }))
      .filter(choice => choice.count > 0),
  ])

  /** Le magasin filtré a été supprimé, ou n'a plus d'article : retour à « Tous ». */
  watch(listFilterChoices, (choices) => {
    if (!choices.some(choice => choice.value === listFilter.value)) listFilter.value = ALL_STORES
  })

  /**
   * Mode Acheter : le magasin où l'on est, retenu sur l'appareil ; vide (ou magasin supprimé) : « Tous », la liste
   * entière comme avant les magasins.
   */
  const shopChoice = useLocalStorage('grocery-shop-store', '')
  const shopStoreId = computed(() => stores.storesById.value.has(shopChoice.value) ? shopChoice.value : null)
  const shopStore = computed(() => (shopStoreId.value ? stores.storesById.value.get(shopStoreId.value) ?? null : null))
  const shopSelection = computed({
    get: () => shopStoreId.value ?? ALL_STORES,
    set: (value: string) => {
      shopChoice.value = value === ALL_STORES ? '' : value
      completionDismissed.value = false
    },
  })

  /**
   * Mode Acheter, dans le magasin `storeId` : ce qui s'y achète et n'est pas déjà dans un panier ailleurs, plus son
   * propre panier. `null` : tout, paniers compris.
   */
  function shopLinesAt(storeId: string | null) {
    if (!storeId) return toBuy.value
    return toBuy.value.filter(line => line.status === 'inCart'
      ? line.item.inCartAt === storeId
      : isSoldAt(line, storeId))
  }
  const shopLines = computed(() => shopLinesAt(shopStoreId.value))

  /**
   * Reste à acheter par magasin : choix du mode Acheter, et magasins proposés quand celui-ci est vide ou fini. Un
   * magasin sans rien à acheter n'est pas proposé, sauf celui où l'on est (il ne disparaît pas une fois fini).
   */
  const shopChoices = computed<GroceryStoreChoice[]>(() => {
    const pendingCount = (storeId: string | null) => shopLinesAt(storeId).filter(line => line.status === 'toBuy').length
    return [
      { value: ALL_STORES, label: 'Tous', count: pendingCount(null) },
      ...stores.stores.value
        .map(store => ({ value: store.id, label: store.name, color: store.color, count: pendingCount(store.id) }))
        .filter(choice => choice.count > 0 || choice.value === shopStoreId.value),
    ]
  })

  /** Mémoire du foyer touchée par un rattachement : cochée par défaut, retenue le temps de la page. */
  const rememberStores = ref(true)

  const ingredientIdOf = (line: GroceryLine) =>
    line.item.ingredientId ?? line.item.complementOf?.ingredientId ?? line.item.linkedIngredientId

  /** Pour chaque magasin, coché si tous les articles `targets` l'ont, en partie si certains seulement. */
  function storeStatesFor(targets: GroceryLine[]) {
    const states = new Map<string, StoreCheckState>()
    for (const store of stores.stores.value) {
      const count = targets.filter(line => line.storeIds?.includes(store.id)).length
      states.set(store.id, count === 0 ? false : count === targets.length ? true : 'indeterminate')
    }
    return states
  }

  /**
   * Ajoute (`on`) ou retire le magasin `storeId` des articles `targets`, et, si `rememberStores`, retient le résultat
   * pour leurs ingrédients. `announce` : message de confirmation (rattachement de plusieurs articles).
   */
  async function setStoreOn(targets: GroceryLine[], storeId: string, on: boolean, { announce = false } = {}) {
    const changed = targets.filter(line => !!line.storeIds?.includes(storeId) !== on)
    if (!changed.length) return
    const memory = new Map<string, string[]>()
    if (rememberStores.value) {
      for (const line of changed) {
        const ingredientId = ingredientIdOf(line)
        if (!ingredientId) continue
        const current = line.storeIds ?? []
        memory.set(ingredientId, on ? [...current, storeId] : current.filter(id => id !== storeId))
      }
    }
    try {
      await Promise.all([
        shoppingList.setItemsStore(changed.map(line => line.item), storeId, on),
        stores.setIngredientStores(memory),
      ])
      if (announce) {
        const name = stores.storesById.value.get(storeId)?.name ?? 'ce magasin'
        toast.add({
          title: on ? `Rattaché${changed.length > 1 ? 's' : ''} à ${name}` : `Retiré${changed.length > 1 ? 's' : ''} de ${name}`,
          description: plural(changed.length, 'article'),
          color: 'success',
          icon: 'i-lucide-store',
        })
      }
    }
    catch (error) {
      fail('Les magasins n\'ont pas pu être modifiés')(error)
    }
  }

  /** Crée un magasin (ou reprend celui du même nom) et y rattache `targets`. */
  async function createStoreFor(targets: GroceryLine[], name: string, options?: { announce?: boolean }) {
    const twin = stores.stores.value.find(store => storeNameKey(store.name) === storeNameKey(name))
    const error = twin ? undefined : stores.nameError(name)
    if (error) {
      toast.add({ title: 'Magasin non créé', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
      return null
    }
    try {
      const id = twin?.id ?? await stores.add(name)
      await setStoreOn(targets, id, true, options)
      return id
    }
    catch (error) {
      fail('Le magasin n\'a pas pu être créé')(error)
      return null
    }
  }

  // --- Sélection de plusieurs articles (mode Lister) ---

  const selecting = ref(false)
  const selectedIds = ref(new Set<string>())
  /** Articles sélectionnés encore à acheter (un article sorti de la liste entre-temps n'en fait plus partie). */
  const selectedLines = computed(() => toBuy.value.filter(line => selectedIds.value.has(line.id)))

  function startSelection(line?: GroceryLine) {
    selecting.value = true
    selectedIds.value = new Set(line ? [line.id] : [])
  }

  function stopSelection() {
    selecting.value = false
    selectedIds.value = new Set()
  }

  /** Sélectionne (`on`) ou désélectionne des articles ; sans `on`, inverse chacun. */
  function setSelected(targets: GroceryLine[], on?: boolean) {
    const next = new Set(selectedIds.value)
    for (const line of targets) {
      if (on ?? !next.has(line.id)) next.add(line.id)
      else next.delete(line.id)
    }
    selectedIds.value = next
  }

  watch(mode, () => stopSelection())

  const aisles = computed(() => {
    const groups: GroceryAisleGroup[] = []
    for (const line of shopLines.value) {
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

  /** Mode Acheter : dans le panier, sur ce que montre le magasin choisi. */
  const doneCount = computed(() => shopLines.value.filter(line => line.status === 'inCart').length)
  const isComplete = computed(() => shopLines.value.length > 0 && doneCount.value === shopLines.value.length)

  function toggleAtHome(line: GroceryLine) {
    shoppingList.setStatus(line.item, line.status === 'atHome' ? 'toBuy' : 'atHome')
      .catch(fail(`« ${line.label} » n'a pas pu être modifié`))
  }

  function toggleInCart(line: GroceryLine) {
    completionDismissed.value = false
    shoppingList.setStatus(line.item, line.status === 'inCart' ? 'toBuy' : 'inCart', shopStoreId.value)
      .catch(fail(`« ${line.label} » n'a pas pu être modifié`))
  }

  /** Modale d'ajout manuel, ouverte depuis les deux modes. */
  const isAddItemOpen = ref(false)

  /** Panneau « Vérifier un article », ouvert depuis la barre d'outils des deux modes. */
  const isStockCheckOpen = ref(false)

  /** Ajoute ce qui manquera d'un ingrédient (voir `addComplement`), dans la file des gestes. */
  function addComplement(...args: Parameters<typeof shoppingList.addComplement>) {
    return enqueue(async () => {
      const write = shoppingList.addComplement(...args)
      write.catch(fail(`Le complément de « ${args[0].label} » n'a pas pu être ajouté`))
      await Promise.race([write.catch(() => {}), new Promise(resolve => setTimeout(resolve, 400))])
    })
  }

  /**
   * `neededBy` : jour où l'article est nécessaire (`yyyy-MM-dd`), vide si aucun ; `linkedIngredientId` : ingrédient du
   * catalogue choisi à la saisie ; `storeIds` vide : partout.
   */
  function addManual(label: string, aisle: IngredientCategory = MISC_AISLE, quantity = '', urgent = false, neededBy = '', linkedIngredientId?: string, storeIds: string[] = []) {
    const trimmed = label.trim()
    if (!trimmed) return false
    shoppingList.addManual(trimmed.charAt(0).toUpperCase() + trimmed.slice(1), {
      categoryId: aisle.id === MISC_AISLE.id ? undefined : aisle.id,
      quantity: quantity.trim() || undefined,
      urgent,
      neededBy: neededBy || undefined,
      linkedIngredientId,
      storeIds,
    }).catch(fail(`« ${trimmed} » n'a pas pu être ajouté`))
    return true
  }

  /** Magasins proposés d'office pour un ajout manuel : celui où l'on est (Acheter), ou celui que filtre la liste (Lister). */
  const addItemStoreIds = computed(() => {
    const storeId = mode.value === 'store' ? shopStoreId.value : listFilterStoreId.value
    return storeId ? [storeId] : []
  })

  function toggleUrgent(line: GroceryLine) {
    shoppingList.setUrgent(line.item, !line.isMarkedUrgent).catch(fail(`« ${line.label} » n'a pas pu être modifié`))
  }

  /** Échéance d'un ajout manuel ; vide la retire. */
  function setNeededBy(line: GroceryLine, neededBy: string) {
    if (!line.manual || (neededBy || undefined) === line.item.neededBy) return
    shoppingList.setNeededBy(line.item, neededBy || null).catch(fail(`« ${line.label} » n'a pas pu être modifié`))
  }

  /** Enregistre la quantité saisie ; vide ou identique au calcul : revient à la quantité calculée. */
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
   * achetés. Dans un magasin, seul son panier est soldé. Passe par la file des gestes, pour ne pas croiser un recalcul
   * en cours.
   */
  async function finishShopping() {
    const store = shopStore.value
    try {
      const count = await enqueue(() => shoppingList.finishShopping(catalog(), store?.id))
      completionDismissed.value = false
      mode.value = 'prepare'
      const left = toBuy.value.length
      toast.add({
        title: store ? `Courses terminées chez ${store.name}` : 'Courses terminées',
        description: `${plural(count, 'article')} retiré${count > 1 ? 's' : ''} de la liste${left ? `, ${plural(left, 'article')} encore à acheter` : ''}.`,
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    catch (error) {
      fail('Les courses n\'ont pas pu être terminées')(error)
    }
  }

  /** Reprend dans la liste du foyer les ajouts manuels de la liste perso. */
  async function adoptPersonalItems() {
    const count = personal.offered.value.length
    try {
      await personal.adopt()
      toast.add({ title: 'Articles repris', description: `${plural(count, 'article')} ajouté${count > 1 ? 's' : ''} à la liste du foyer.`, color: 'success', icon: 'i-lucide-check' })
    }
    catch (error) {
      fail('Vos articles n\'ont pas pu être repris')(error)
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
    isLoadingMeals,
    personalItems: personal.offered,
    adoptPersonalItems,
    dismissPersonalItems: personal.dismiss,
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
    ingredients,
    hasStores,
    stores: stores.stores,
    storesById: stores.storesById,
    storesOf,
    storeLabel,
    listFilter,
    listFilterStoreId,
    filteredToBuy,
    listFilterChoices,
    shopSelection,
    shopStore,
    shopLines,
    shopChoices,
    rememberStores,
    ingredientIdOf,
    storeStatesFor,
    setStoreOn,
    createStoreFor,
    storesForIngredient: stores.storesForIngredient,
    selecting,
    selectedIds,
    selectedLines,
    startSelection,
    stopSelection,
    setSelected,
    addItemStoreIds,
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
    isStockCheckOpen,
    addComplement,
    today,
    rangeDays,
    items: shoppingList.items,
    inclusionByMealId,
    addManual,
    setQuantity,
    toggleUrgent,
    setNeededBy,
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
export type GroceryLineActions = Pick<GroceryListState, 'toggleUrgent' | 'setNeededBy' | 'removeManual'>

export const GROCERY_LINE_ACTIONS_KEY: InjectionKey<GroceryLineActions> = Symbol('groceryLineActions')

export function useInjectedGroceryLineActions(): GroceryLineActions {
  const actions = inject(GROCERY_LINE_ACTIONS_KEY)
  if (!actions) throw new Error('useInjectedGroceryLineActions doit être appelé sous une page qui fournit les gestes d\'un article')
  return actions
}
