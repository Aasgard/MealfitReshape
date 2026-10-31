<script setup lang="ts">
import { addDays, addWeeks, differenceInCalendarWeeks, isSameWeek, parseISO, startOfWeek, subWeeks } from 'date-fns'
import type { Meal, MealSource, MealType } from '~/types/meal'
import type { MenuEntry, MenuMemberRow, MenuPerson } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { DAILY_TARGETS } from '~/utils/dailyTargets'
import { buildDays, dayKeyOf, DAYS_PER_WEEK, formatWeekLabel, shortDayLabel, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'
import { usedSurplusMeals } from '~/utils/preparedDishes'
import { buildEntriesByDay, buildMemberDays, consumedOfDay, distributedRecipeMealIds, MENU_MEAL_TYPES, mealSourceOf, mealsOfWeek, summarizeMenuWeek, UNCOUNTED_MEAL_KEY } from '~/utils/menuEntries'

useSeoMeta({
  title: 'Dashboard - Menus de la semaine - Mealfit',
  description: 'Dashboard - Menus de la semaine - Mealfit',
})

/** Semaine réellement en cours (celle contenant aujourd'hui) : sert de référence pour "Cette semaine". */
const referenceWeekStart = startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON })
const selectedWeekStart = ref(referenceWeekStart)

const isReferenceWeekSelected = computed(() =>
  isSameWeek(selectedWeekStart.value, referenceWeekStart, { weekStartsOn: WEEK_STARTS_ON })
)

const weekLabel = computed(() => formatWeekLabel(selectedWeekStart.value, addDays(selectedWeekStart.value, 6)))
const weekLabelShort = computed(() => formatWeekLabel(selectedWeekStart.value, addDays(selectedWeekStart.value, 6), { short: true }))

/**
 * Mobile, tablette (sous `lg:`) : le calendrier défile d'une semaine à l'autre (voir MenuWeekCalendar). Au-delà, les
 * 7 jours tiennent à l'écran et on change de semaine par les flèches, avec un glissement.
 * PC avec une barre latérale large : si la place manque pour la grille (`min-w-220` du calendrier), mode continu aussi.
 * La grille du PC ne défile ainsi jamais en largeur, ce qui laisse sa ligne des jours et ses bandes coller à la page.
 */
const CONTINUOUS_QUERY = '(max-width: 63.999rem)'
const MIN_GRID_WIDTH_PX = 55 * 16
const isSmallScreen = ref(window.matchMedia(CONTINUOUS_QUERY).matches)
const onContinuousChange = (event: MediaQueryListEvent) => { isSmallScreen.value = event.matches }
onMounted(() => window.matchMedia(CONTINUOUS_QUERY).addEventListener('change', onContinuousChange))
onBeforeUnmount(() => window.matchMedia(CONTINUOUS_QUERY).removeEventListener('change', onContinuousChange))

const pageBody = useTemplateRef<HTMLElement>('pageBody')
const isGridTooWide = ref(false)
const pageBodyObserver = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver(([entry]) => {
      if (entry) isGridTooWide.value = entry.contentRect.width < MIN_GRID_WIDTH_PX
    })
watch(pageBody, (element) => {
  pageBodyObserver?.disconnect()
  if (element) pageBodyObserver?.observe(element)
})
onBeforeUnmount(() => pageBodyObserver?.disconnect())

const isContinuous = computed(() => isSmallScreen.value || isGridTooWide.value)

const calendar = useTemplateRef<{ scrollByWeeks: (delta: number) => void }>('calendar')

/** Sens du dernier changement de semaine (PC), pour faire glisser le calendrier du bon côté. */
const slideDirection = ref<'previous' | 'next'>('next')

const goToWeek = (date: Date) => {
  const weekStart = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })
  const offset = differenceInCalendarWeeks(weekStart, selectedWeekStart.value, { weekStartsOn: WEEK_STARTS_ON })
  if (!offset) return
  slideDirection.value = offset > 0 ? 'next' : 'previous'
  selectedWeekStart.value = weekStart
}

/** En mode continu, les flèches font défiler le calendrier : la semaine change quand il s'arrête (`visible-week`). */
const goToAdjacentWeek = (delta: 1 | -1) => {
  if (isContinuous.value && calendar.value) calendar.value.scrollByWeeks(delta)
  else goToWeek(addWeeks(selectedWeekStart.value, delta))
}
const goToPreviousWeek = () => goToAdjacentWeek(-1)
const goToNextWeek = () => goToAdjacentWeek(1)
const goToCurrentWeek = () => goToWeek(referenceWeekStart)

/** Jours du calendrier : la semaine affichée, encadrée de la précédente et de la suivante en mode continu. */
const days = computed(() => isContinuous.value
  ? buildDays(subWeeks(selectedWeekStart.value, 1), 3)
  : buildDays(selectedWeekStart.value))

const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()
const toast = useToast()

/**
 * Repas enregistrés (collection `meals`) de la semaine affichée, de la précédente et de la suivante : celles que le
 * calendrier continu montre de part et d'autre, chargées avant qu'on y arrive. `meals` : ceux du compte connecté ;
 * `householdMeals` : ceux des autres membres du foyer, sur leurs propres lignes.
 */
const { meals, householdMeals, addMeal, moveMeal, updateMealSource, replaceMeals } = useMeals(selectedWeekStart, { weeksAhead: 1, withHousehold: true })
watch([meals.error, householdMeals.error], ([error, householdError]) => {
  const failed = error ?? householdError
  if (!failed) return
  const what = error ? 'les repas' : 'les repas du foyer'
  toast.add({ title: 'Erreur', description: `Impossible de charger ${what} : ${failed.message}`, color: 'error' })
})

/** Autres membres du foyer enregistré (pas ceux de la démo, qui n'ont pas de repas), dans l'ordre de la page Foyer. */
const { household, householdId } = useHousehold()
const otherMembers = computed(() => household.value && householdId.value
  ? sortedMembers(household.value).filter(member => !member.isSelf)
  : [])
const memberNameOf = (id: string) => otherMembers.value.find(member => member.id === id)?.name
/** Compte connecté tel que le foyer le connaît : nomme son propre bloc dans le calendrier. */
const selfMember = computed<MenuPerson | undefined>(() => {
  const self = household.value && householdId.value ? sortedMembers(household.value).find(member => member.isSelf) : undefined
  return self ? { id: self.id, name: self.name, photoUrl: self.photoUrl } : undefined
})

// Une erreur de chargement des repas (droits, index manquant...) est signalée par le toast ci-dessus, sans bloquer la page.
await Promise.all([recipes.promise.value, ingredients.promise.value, meals.promise.value.catch(() => undefined)])

const mealTypes = MENU_MEAL_TYPES

const weekMeals = computed(() => mealsOfWeek(meals.value, selectedWeekStart.value))
const isWeekEmpty = computed(() => !weekMeals.value.length)

/**
 * Repas de recette dont les fournées sont entièrement réparties dans le foyer (surplus prévus pour le stock compris, tant
 * que ses parts sont au stock ou dans des repas) : leur carte n'affiche pas les parts de la recette (« 1 part » plutôt que « 1 part /4 »).
 */
const { dishes } = usePreparedDishes()
const distributedMealIds = computed(() => {
  const allMeals = [...meals.value, ...householdMeals.value]
  return distributedRecipeMealIds([...allMeals, ...usedSurplusMeals(dishes.value, allMeals)], recipesById.value)
})

/** Repas de toutes les semaines chargées, par jour (date ISO) : le calendrier continu en montre trois. */
const entries = computed(() => buildEntriesByDay(meals.value, recipesById.value, ingredientsById.value, distributedMealIds.value))
/** Moyennes par jour complet de la semaine affichée (voir `summarizeMenuWeek`). */
const summary = computed(() =>
  summarizeMenuWeek(entries.value, buildDays(selectedWeekStart.value).map(day => day.key))
)

/** Une ligne par autre membre : tous ses repas de chaque jour, et ses kcal du jour. */
const memberRows = computed<MenuMemberRow[]>(() => otherMembers.value.map(member => ({
  id: member.id,
  name: member.name,
  photoUrl: member.photoUrl,
  ...buildMemberDays(householdMeals.value.filter(meal => meal.user === member.id), recipesById.value, ingredientsById.value, distributedMealIds.value),
})))

/** Repas chargé, quelle que soit sa semaine (le calendrier continu permet d'agir sur les semaines voisines) ou son membre. */
const findMeal = (entryId: string) =>
  meals.value.find(m => m.id === entryId) ?? householdMeals.value.find(m => m.id === entryId)

/** Membre (autre que le compte connecté) auquel appartient un repas ; `undefined` pour les siens. */
const memberOfMeal = (meal: Meal | undefined) =>
  meal && householdMeals.value.some(m => m.id === meal.id) ? meal.user : undefined

/** Repas copié via l'icône des tuiles : le prochain clic sur un "+" en ajoute un exemplaire dans cette case. */
const copiedMeal = ref<{ id: string, source: MealSource } | null>(null)

const toggleCopyEntry = (entryId: string) => {
  if (copiedMeal.value?.id === entryId) {
    copiedMeal.value = null
    return
  }
  const meal = findMeal(entryId)
  copiedMeal.value = meal ? { id: meal.id, source: mealSourceOf(meal) } : null
}

/** Un clic ailleurs que sur une icône "copier" ou un "+" (marqués `data-copy-control`) annule la copie en cours. */
const cancelCopyOnOutsideClick = (event: MouseEvent) => {
  if (!copiedMeal.value) return
  if (event.target instanceof Element && event.target.closest('[data-copy-control]')) return
  copiedMeal.value = null
}
onMounted(() => document.addEventListener('click', cancelCopyOnOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', cancelCopyOnOutsideClick))

/**
 * Lance une écriture Firestore ; en cas d'échec (droits, réseau...), prévient l'utilisateur. Renvoie `true` si elle a réussi.
 * `memberId` : repas d'un autre membre, dont les règles peuvent refuser l'écriture ; le message le dit.
 */
const runWrite = async (write: () => Promise<void>, failureMessage: string, memberId?: string) => {
  try {
    await write()
    return true
  } catch (error: any) {
    const memberName = memberId ? memberNameOf(memberId) : undefined
    const reason = error?.code === 'permission-denied' && memberName
      ? `vos droits Firestore ne permettent pas de modifier les repas de ${memberName}`
      : error.message || 'une erreur est survenue'
    toast.add({ title: 'Erreur', description: `${failureMessage} : ${reason}.`, color: 'error' })
    return false
  }
}

/** Jour d'une case : sa clé est sa date ISO (voir `dayKeyOf`). */
const dateOfDay = (dayKey: string) => parseISO(dayKey)

const saveMeal = (dayKey: string, mealType: MealType, source: MealSource, memberId?: string) =>
  runWrite(() => addMeal({ date: dateOfDay(dayKey), mealType, source, user: memberId }), 'Le repas n\'a pas pu être enregistré', memberId)

/** Case pour laquelle la modale d'ajout est ouverte ; `memberId` : sur la ligne d'un autre membre. */
const addModalOpen = ref(false)
const addTarget = ref<{ dayKey: string, mealTypeKey: MealType, memberId?: string } | null>(null)
/** Repas modifié via la même modale ; `null` = ajout d'un nouveau repas dans `addTarget`. */
const editingMeal = ref<Meal | null>(null)
const editingSource = computed(() => editingMeal.value ? mealSourceOf(editingMeal.value) : null)

/**
 * Contenu du jour visé et objectifs, pour le filtre « Dans mes objectifs » ; aucun pour la ligne « Non compté », ni
 * pour un autre membre (les objectifs sont ceux du compte connecté).
 */
const addDayBudget = computed(() => {
  const target = addTarget.value
  if (!target || target.memberId || target.mealTypeKey === UNCOUNTED_MEAL_KEY) return null
  return { consumed: consumedOfDay(entries.value[target.dayKey] ?? {}, editingMeal.value?.id), targets: DAILY_TARGETS }
})

const addContextLabel = computed(() => {
  const target = addTarget.value
  if (!target) return ''
  const day = days.value.find(d => d.key === target.dayKey)
  const mealType = mealTypes.find(m => m.key === target.mealTypeKey)
  const memberName = target.memberId ? memberNameOf(target.memberId) : undefined
  return [day ? shortDayLabel(day.date) : '', mealType?.label, memberName].filter(Boolean).join(' · ')
})

/** Colle le repas copié dans la case ; sans copie en cours, ouvre la modale d'ajout pour cette case. */
const addEntry = (dayKey: string, mealTypeKey: MealType) => {
  const copied = copiedMeal.value
  if (!copied) {
    editingMeal.value = null
    addTarget.value = { dayKey, mealTypeKey }
    addModalOpen.value = true
    return
  }

  saveMeal(dayKey, mealTypeKey, copied.source)
  copiedMeal.value = null
}

/** "+" de la ligne d'un autre membre, ligne du calendrier choisie : comme `addEntry`, le repas lui revient. */
const addEntryForMember = (memberId: string, dayKey: string, mealTypeKey: MealType) => {
  const copied = copiedMeal.value
  if (!copied) {
    editingMeal.value = null
    addTarget.value = { dayKey, mealTypeKey, memberId }
    addModalOpen.value = true
    return
  }

  saveMeal(dayKey, mealTypeKey, copied.source, memberId)
  copiedMeal.value = null
}

/** Ouvre la modale pré-remplie avec le contenu du repas ; son jour et sa ligne ne changent pas (le glisser-déposer s'en charge). */
const editEntry = (entryId: string) => {
  const meal = findMeal(entryId)
  if (!meal) return

  editingMeal.value = meal
  addTarget.value = { dayKey: dayKeyOf(meal.date.toDate()), mealTypeKey: meal.mealType, memberId: memberOfMeal(meal) }
  addModalOpen.value = true
}

const submitAddedEntry = (source: MealSource) => {
  const meal = editingMeal.value
  if (meal) {
    runWrite(() => updateMealSource(meal, source), 'Le repas n\'a pas pu être modifié', memberOfMeal(meal))
    return
  }
  if (!addTarget.value) return
  saveMeal(addTarget.value.dayKey, addTarget.value.mealTypeKey, source, addTarget.value.memberId)
}

/** « Mettre au stock » (panneau d'actions) : le repas quitte le menu, ses parts rejoignent le surplus de sa fournée. */
const sendToStock = useSendToStock(() => meals.value)

const deleteEntry = (entryId: string) => {
  const meal = findMeal(entryId)
  if (!meal) return
  runWrite(() => replaceMeals([meal], []), 'Le repas n\'a pas pu être supprimé', memberOfMeal(meal))
}

/** Change la clé du calendrier pour le recréer, et réafficher les cartes telles que les données les décrivent. */
const calendarKey = ref(0)

/**
 * Enregistre le déplacement d'une carte vers un autre jour / une autre ligne (glisser-déposer). Le calendrier l'a déjà
 * déplacée à l'écran ; les totaux et les statistiques suivent dès que Firestore renvoie le repas à sa nouvelle place.
 */
const moveEntry = async (entryId: string, dayKey: string, mealType: MealType) => {
  const meal = findMeal(entryId)
  const isMoved = !!meal && await runWrite(
    () => moveMeal(meal, { date: dateOfDay(dayKey), mealType }),
    'Le repas n\'a pas pu être déplacé',
    memberOfMeal(meal)
  )
  if (!isMoved) calendarKey.value++
}

const clearDialogOpen = ref(false)

const confirmClearWeek = () => {
  clearDialogOpen.value = false
  copiedMeal.value = null
  runWrite(() => replaceMeals(weekMeals.value, []), 'La semaine n\'a pas pu être vidée')
}

const copyWeekOpen = ref(false)

/**
 * Recopie les repas d'une autre semaine (lundi `sourceWeekStart`) jour pour jour dans la semaine affichée, dont les
 * repas actuels sont remplacés. Les repas pris dans le stock ne sont pas recopiés : leurs parts ont déjà été mangées.
 */
const copyWeek = async (sourceWeekStart: Date, sourceMeals: Meal[]) => {
  copiedMeal.value = null
  const shift = differenceInCalendarWeeks(selectedWeekStart.value, sourceWeekStart, { weekStartsOn: WEEK_STARTS_ON })
  const stockCount = sourceMeals.filter(meal => meal.category === 'STOCK').length
  const copies = sourceMeals.filter(meal => meal.category !== 'STOCK').map(meal => ({
    date: addWeeks(meal.date.toDate(), shift),
    mealType: meal.mealType,
    source: mealSourceOf(meal),
  }))
  const isCopied = await runWrite(() => replaceMeals(weekMeals.value, copies), 'La semaine n\'a pas pu être copiée')
  if (isCopied) {
    const label = formatWeekLabel(sourceWeekStart, addDays(sourceWeekStart, DAYS_PER_WEEK - 1))
    const skipped = stockCount > 1
      ? ` Les ${stockCount} repas pris dans le stock n'ont pas été recopiés.`
      : stockCount ? ' Le repas pris dans le stock n\'a pas été recopié.' : ''
    toast.add({
      title: 'Semaine copiée',
      description: `Les repas de la semaine du ${label} ont été recopiés.${skipped}`,
      // Orange quand des repas du stock ont été écartés : la copie n'est pas complète.
      color: stockCount ? 'warning' : 'success',
      ...(stockCount ? { icon: 'i-lucide-archive-x' } : {}),
    })
  }
}

const slideoverOpen = ref(false)
const selectedRecipe = ref<Recipe | null>(null)
/** Parts du repas cliqué : la fiche recalcule les quantités d'ingrédients pour ce nombre de parts. */
const selectedRecipeParts = ref<number | null>(null)

const findEntry = (entryId: string) => [
  ...Object.values(entries.value).flatMap(meals => Object.values(meals).flat()),
  ...memberRows.value.flatMap(member => Object.values(member.entries).flatMap(meals => Object.values(meals).flat())),
].find(e => e.id === entryId)

/** Ouvre la fiche de la recette dont provient le repas. */
const openEntryRecipe = (entry: MenuEntry | undefined) => {
  const recipe = recipes.value.find(r => r.id === entry?.recipeId)
  if (!recipe) return

  selectedRecipe.value = recipe
  selectedRecipeParts.value = entry?.parts ?? null
  slideoverOpen.value = true
}

/** Repas dont le panneau d'actions (mobile) est ouvert. */
const actionsEntry = ref<MenuEntry | null>(null)
const actionsOpen = ref(false)
/** Membre auquel appartient ce repas, nommé dans le panneau ; « Mettre au stock » reste réservé à ses propres repas. */
const actionsMemberName = computed(() => {
  const memberId = actionsEntry.value ? memberOfMeal(findMeal(actionsEntry.value.id)) : undefined
  return memberId ? memberNameOf(memberId) : undefined
})

/**
 * Sur mobile, les cartes n'affichent pas leurs icônes d'action (place réservée au texte) : un appui ouvre un panneau
 * avec ces actions. Au-delà, un clic ouvre directement la fiche recette. Même seuil que `sm:` (Tailwind) dans MenuWeekCell.
 */
const selectEntry = (entryId: string) => {
  const entry = findEntry(entryId)
  if (!entry) return

  if (!window.matchMedia('(min-width: 40rem)').matches) {
    actionsEntry.value = entry
    actionsOpen.value = true
    return
  }
  openEntryRecipe(entry)
}

/** Ferme le panneau d'actions puis lance l'action choisie sur son repas. */
const runEntryAction = (action: (entryId: string) => void) => {
  const entry = actionsEntry.value
  actionsOpen.value = false
  if (entry) action(entry.id)
}

/** Flèches ← / → du clavier : semaine précédente / suivante, sauf pendant une saisie ou quand une fenêtre est ouverte. */
const isOverlayOpen = computed(() =>
  addModalOpen.value || clearDialogOpen.value || copyWeekOpen.value
  || slideoverOpen.value || actionsOpen.value || sendToStock.isOpen.value
)

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isOverlayOpen.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
  if (event.key === 'ArrowLeft') goToPreviousWeek()
  else goToNextWeek()
}

/**
 * PC : un balayage horizontal change aussi de semaine (en mode continu, le calendrier défile déjà sous le doigt). Il ne
 * compte pas quand il fait défiler un élément qui peut encore aller dans ce sens (grille plus large que l'écran).
 */
const SWIPE_MIN_DISTANCE = 60

const canScrollHorizontally = (target: EventTarget | null, boundary: EventTarget | null, deltaX: number) => {
  for (let el = target instanceof Element ? target : null; el && el !== boundary; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth || !/auto|scroll/.test(getComputedStyle(el).overflowX)) continue
    if (deltaX > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true
  }
  return false
}

/**
 * Écran tactile : comme le balayage des jours de l'accueil. Annulé si le geste devient un glisser-déposer de repas, et
 * ignoré là où le doigt glisse pour autre chose (`data-no-week-swipe` : survol des barres du graphique des semaines).
 */
let swipeStart: { x: number, y: number } | null = null
const cancelSwipe = () => { swipeStart = null }

const onTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0]
  const isExcluded = event.target instanceof Element && event.target.closest('[data-no-week-swipe]')
  swipeStart = !isContinuous.value && !isExcluded && event.touches.length === 1 && touch
    ? { x: touch.clientX, y: touch.clientY }
    : null
}

const onTouchEnd = (event: TouchEvent) => {
  const touch = event.changedTouches[0]
  if (!swipeStart || !touch) return
  const dx = touch.clientX - swipeStart.x
  const dy = touch.clientY - swipeStart.y
  swipeStart = null
  // Un geste surtout vertical est un défilement de la page, pas un changement de semaine.
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return
  if (canScrollHorizontally(event.target, event.currentTarget, -dx)) return
  if (dx < 0) goToNextWeek()
  else goToPreviousWeek()
}

/**
 * Pavé tactile (deux doigts) : les `wheel` horizontaux s'additionnent jusqu'au seuil. Un geste ne change qu'une
 * semaine : la suite et l'inertie sont ignorées jusqu'à un court silence, après lequel un nouveau geste est accepté.
 */
const WHEEL_GESTURE_END_MS = 200
const WHEEL_LINE_HEIGHT = 16
let wheelDeltaX = 0
let wheelSwipeDone = false
let wheelGestureTimeout: ReturnType<typeof setTimeout> | undefined

const onWheel = (event: WheelEvent) => {
  if (isContinuous.value || event.ctrlKey || isOverlayOpen.value) return
  const deltaX = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaX * WHEEL_LINE_HEIGHT : event.deltaX
  if (Math.abs(deltaX) <= Math.abs(event.deltaY)) return
  if (canScrollHorizontally(event.target, event.currentTarget, deltaX)) return
  // Sinon le navigateur peut y voir un « page précédente / suivante ».
  event.preventDefault()
  clearTimeout(wheelGestureTimeout)
  wheelGestureTimeout = setTimeout(() => {
    wheelDeltaX = 0
    wheelSwipeDone = false
  }, WHEEL_GESTURE_END_MS)
  if (wheelSwipeDone) return
  wheelDeltaX += deltaX
  if (Math.abs(wheelDeltaX) < SWIPE_MIN_DISTANCE) return
  wheelSwipeDone = true
  if (wheelDeltaX > 0) goToNextWeek()
  else goToPreviousWeek()
}
onBeforeUnmount(() => clearTimeout(wheelGestureTimeout))

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Pas de marge en haut de la zone qui défile : la ligne des jours (mobile) s'y colle sans laisser voir le défilement au-dessus. -->
  <UDashboardPanel id="menus" :ui="{ body: 'pt-0 sm:pt-0' }">
    <template #header>
      <UDashboardNavbar title="Menus de la semaine">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <!-- Dans l'en-tête du panneau (hors de la zone qui défile), comme la ligne du jour de l'accueil : la barre ne bouge pas. -->
      <MenuWeekHeader
        class="border-b border-default bg-default px-4 py-2 sm:px-6"
        :week-label="weekLabel"
        :week-label-short="weekLabelShort"
        :week-start-key="weekId(selectedWeekStart)"
        :is-current-week="isReferenceWeekSelected"
        :clear-disabled="isWeekEmpty"
        @previous="goToPreviousWeek"
        @next="goToNextWeek"
        @this-week="goToCurrentWeek"
        @select-date="goToWeek"
        @clear="clearDialogOpen = true"
        @copy-week="copyWeekOpen = true"
      />
    </template>

    <template #body>
      <!--
        Mobile, tablette : la ligne des jours du calendrier remonte avec la page puis se colle sous l'en-tête du panneau.
        PC : elle colle en haut de la page, dans le calendrier.
      -->
      <div
        ref="pageBody"
        class="flex flex-1 flex-col gap-4 overflow-x-clip p-4 sm:gap-6 sm:p-6"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
        @wheel="onWheel"
      >
        <!-- Moyenne par jour complet de la semaine, dans la forme du résumé de l'accueil ; ouverte par défaut. -->
        <CalorieSummary
          class="shrink-0"
          title="Moyenne / jour"
          state-key="menus-week-summary-open"
          :targets="DAILY_TARGETS"
          :eaten-kcal="summary.averageKcal"
          :extra-kcal="summary.averageExtraKcal"
          :macros="summary.macros"
          :complete-days="summary.completeDays"
        />

        <!-- Semaines jusqu'à celle affichée : macros empilées et kcal moyennes, repliées par défaut. -->
        <MenuWeeksMacroChart :selected-week-start="selectedWeekStart" @select-week="goToWeek" />

        <!--
          PC : le calendrier glisse du côté de la semaine demandée. Mode continu : une seule instance, qui défile d'une
          semaine à l'autre et annonce celle où elle s'arrête (`visible-week`).
        -->
        <Transition
          mode="out-in"
          enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
          leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
          :enter-from-class="slideDirection === 'next' ? 'opacity-0 translate-x-8' : 'opacity-0 -translate-x-8'"
          :leave-to-class="slideDirection === 'next' ? 'opacity-0 -translate-x-8' : 'opacity-0 translate-x-8'"
        >
          <MenuWeekCalendar
            class="shrink-0"
            ref="calendar"
            :key="isContinuous ? `continuous-${calendarKey}` : `${weekId(selectedWeekStart)}-${calendarKey}`"
            :days="days"
            :meal-types="mealTypes"
            :entries="entries"
            :targets="DAILY_TARGETS"
            :copied-entry-id="copiedMeal?.id"
            :continuous="isContinuous"
            :members="memberRows"
            :self="selfMember"
            @select-entry="selectEntry"
            @edit-entry="editEntry"
            @copy-entry="toggleCopyEntry"
            @delete-entry="deleteEntry"
            @move-entry="moveEntry"
            @add="addEntry"
            @add-for-member="addEntryForMember"
            @visible-week="selectedWeekStart = $event"
            @drag-start="cancelSwipe"
          />
        </Transition>
      </div>
    </template>
  </UDashboardPanel>

  <MenuAddEntryModal
    v-model:open="addModalOpen"
    :recipes="recipes"
    :ingredients="ingredients"
    :ingredients-by-id="ingredientsById"
    :context-label="addContextLabel"
    :day-key="addTarget?.dayKey ?? ''"
    :initial-source="editingSource"
    :day-budget="addDayBudget"
    @submit="submitAddedEntry"
  />

  <ConfirmDialog
    v-model:open="clearDialogOpen"
    title="Vider la semaine ?"
    :description="`Tous les repas de la semaine du ${weekLabel} seront retirés.`"
    confirm-label="Vider"
    confirm-color="error"
    confirm-icon="i-lucide-eraser"
    @confirm="confirmClearWeek"
  />

  <MenuCopyWeekModal
    v-model:open="copyWeekOpen"
    :target-week-start="selectedWeekStart"
    :target-meal-count="weekMeals.length"
    @copy="copyWeek"
  />

  <UDrawer
    v-model:open="actionsOpen"
    :title="actionsEntry?.label"
    :description="[actionsMemberName, actionsEntry?.quantityLabel, actionsEntry ? `${actionsEntry.kcal} kcal` : null].filter(Boolean).join(' · ')"
  >
    <template #body>
      <p v-if="actionsEntry?.comment" class="mb-3 flex items-start gap-1.5 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
        <UIcon name="i-lucide-message-square-text" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {{ actionsEntry.comment }}
      </p>
      <div class="flex flex-col gap-1">
        <UButton
          v-if="actionsEntry?.recipeId"
          label="Voir la recette"
          icon="i-lucide-chef-hat"
          color="neutral"
          variant="ghost"
          size="lg"
          block
          class="justify-start"
          @click="runEntryAction(id => openEntryRecipe(findEntry(id)))"
        />
        <UButton
          label="Modifier"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="lg"
          block
          class="justify-start"
          @click="runEntryAction(editEntry)"
        />
        <UButton
          v-if="actionsEntry?.recipeId && !actionsEntry.storage && !actionsMemberName"
          label="Mettre au stock"
          icon="i-lucide-archive"
          color="neutral"
          variant="ghost"
          size="lg"
          block
          class="justify-start"
          @click="runEntryAction(id => sendToStock.open(findMeal(id)))"
        />
        <!-- `data-copy-control` : sans lui, ce clic annulerait aussitôt la copie (voir cancelCopyOnOutsideClick). -->
        <UButton
          data-copy-control
          :label="actionsEntry?.id === copiedMeal?.id ? 'Annuler la copie' : 'Copier (puis appuyer sur un +)'"
          icon="i-lucide-copy"
          color="neutral"
          variant="ghost"
          size="lg"
          block
          class="justify-start"
          @click="runEntryAction(toggleCopyEntry)"
        />
        <UButton
          label="Supprimer"
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="lg"
          block
          class="justify-start"
          @click="runEntryAction(deleteEntry)"
        />
      </div>
    </template>
  </UDrawer>

  <SendToStockModal
    v-model:open="sendToStock.isOpen.value"
    :label="sendToStock.label.value"
    :parts="sendToStock.meal.value?.value ?? 0"
    :cook-day="sendToStock.cookDay.value"
    :is-cooked="sendToStock.isCooked.value"
    :existing-storage="sendToStock.surplus.value?.storage"
    :saving="sendToStock.isSaving.value"
    @confirm="sendToStock.confirm"
  />

  <RecipeDetailSlideover
    v-model:open="slideoverOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
    :parts="selectedRecipeParts"
  />
</template>
