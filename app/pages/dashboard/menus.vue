<script setup lang="ts">
import { addDays, addWeeks, differenceInCalendarWeeks, isSameWeek, parseISO, startOfWeek, subWeeks } from 'date-fns'
import type { Meal, MealSource, MealType } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { DAILY_TARGETS } from '~/utils/dailyTargets'
import { buildDays, DAYS_PER_WEEK, formatWeekLabel, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'
import { buildEntriesByDay, consumedOfDay, MENU_MEAL_TYPES, mealSourceOf, mealsOfWeek, summarizeMenuWeek, UNCOUNTED_MEAL_KEY } from '~/utils/menuEntries'

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
 */
const CONTINUOUS_QUERY = '(max-width: 63.999rem)'
const isContinuous = ref(window.matchMedia(CONTINUOUS_QUERY).matches)
const onContinuousChange = (event: MediaQueryListEvent) => { isContinuous.value = event.matches }
onMounted(() => window.matchMedia(CONTINUOUS_QUERY).addEventListener('change', onContinuousChange))
onBeforeUnmount(() => window.matchMedia(CONTINUOUS_QUERY).removeEventListener('change', onContinuousChange))

/** Résumé de la semaine replié par défaut sur mobile (même seuil que `sm:`), pour laisser la place au calendrier. */
const summaryOpenByDefault = window.matchMedia('(min-width: 40rem)').matches

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
const { settings } = useAppSettings()

/**
 * Repas enregistrés (collection `meals`) de la semaine affichée, de la précédente et de la suivante : celles que le
 * calendrier continu montre de part et d'autre, chargées avant qu'on y arrive.
 */
const { meals, addMeal, moveMeal, updateMealSource, replaceMeals } = useMeals(selectedWeekStart, { weeksAhead: 1 })
watch(meals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas : ${error.message}`, color: 'error' })
})

// Une erreur de chargement des repas (droits, index manquant...) est signalée par le toast ci-dessus, sans bloquer la page.
await Promise.all([recipes.promise.value, ingredients.promise.value, meals.promise.value.catch(() => undefined)])

const mealTypes = MENU_MEAL_TYPES

const weekMeals = computed(() => mealsOfWeek(meals.value, selectedWeekStart.value))
const isWeekEmpty = computed(() => !weekMeals.value.length)

/** Repas de toutes les semaines chargées, par jour (date ISO) : le calendrier continu en montre trois. */
const entries = computed(() => buildEntriesByDay(meals.value, recipesById.value, ingredientsById.value))
/** Moyennes par jour complet de la semaine affichée (voir `summarizeMenuWeek`). */
const summary = computed(() =>
  summarizeMenuWeek(entries.value, buildDays(selectedWeekStart.value).map(day => day.key))
)

/** Repas chargé, quelle que soit sa semaine (le calendrier continu permet d'agir sur les semaines voisines). */
const findMeal = (entryId: string) => meals.value.find(m => m.id === entryId)

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

/** Lance une écriture Firestore ; en cas d'échec (droits, réseau...), prévient l'utilisateur. Renvoie `true` si elle a réussi. */
const runWrite = async (write: () => Promise<void>, failureMessage: string) => {
  try {
    await write()
    return true
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `${failureMessage} : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
    return false
  }
}

/** Jour d'une case : sa clé est sa date ISO (voir `dayKeyOf`). */
const dateOfDay = (dayKey: string) => parseISO(dayKey)

const saveMeal = (dayKey: string, mealType: MealType, source: MealSource) =>
  runWrite(() => addMeal({ date: dateOfDay(dayKey), mealType, source }), 'Le repas n\'a pas pu être enregistré')

/** Case pour laquelle la modale d'ajout est ouverte. */
const addModalOpen = ref(false)
const addTarget = ref<{ dayKey: string, mealTypeKey: MealType } | null>(null)
/** Repas modifié via la même modale ; `null` = ajout d'un nouveau repas dans `addTarget`. */
const editingMeal = ref<Meal | null>(null)
const editingSource = computed(() => editingMeal.value ? mealSourceOf(editingMeal.value) : null)

/** Contenu du jour visé et objectifs, pour le filtre « Dans mes objectifs » ; aucun pour la ligne « Non compté ». */
const addDayBudget = computed(() => {
  const target = addTarget.value
  if (!target || target.mealTypeKey === UNCOUNTED_MEAL_KEY) return null
  return { consumed: consumedOfDay(entries.value[target.dayKey] ?? {}, editingMeal.value?.id), targets: DAILY_TARGETS }
})

const addContextLabel = computed(() => {
  const target = addTarget.value
  if (!target) return ''
  const day = days.value.find(d => d.key === target.dayKey)
  const mealType = mealTypes.find(m => m.key === target.mealTypeKey)
  return `${day?.dayLabel} ${day?.dateLabel} · ${mealType?.label}`
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

/** Ouvre la modale pré-remplie avec le contenu du repas ; son jour et sa ligne ne changent pas (le glisser-déposer s'en charge). */
const editEntry = (entryId: string) => {
  const meal = findMeal(entryId)
  const dayKey = Object.entries(entries.value)
    .find(([, byMealType]) => byMealType[meal?.mealType ?? '']?.some(e => e.id === entryId))?.[0]
  if (!meal || !dayKey) return

  editingMeal.value = meal
  addTarget.value = { dayKey, mealTypeKey: meal.mealType }
  addModalOpen.value = true
}

const submitAddedEntry = (source: MealSource) => {
  const meal = editingMeal.value
  if (meal) {
    runWrite(() => updateMealSource(meal, source), 'Le repas n\'a pas pu être modifié')
    return
  }
  if (!addTarget.value) return
  saveMeal(addTarget.value.dayKey, addTarget.value.mealTypeKey, source)
}

const deleteEntry = (entryId: string) => {
  const meal = findMeal(entryId)
  if (!meal) return
  runWrite(() => replaceMeals([meal], []), 'Le repas n\'a pas pu être supprimé')
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
    () => moveMeal(meal.id, { date: dateOfDay(dayKey), mealType }),
    'Le repas n\'a pas pu être déplacé'
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
 * repas actuels sont remplacés.
 */
const copyWeek = async (sourceWeekStart: Date, sourceMeals: Meal[]) => {
  copiedMeal.value = null
  const shift = differenceInCalendarWeeks(selectedWeekStart.value, sourceWeekStart, { weekStartsOn: WEEK_STARTS_ON })
  const copies = sourceMeals.map(meal => ({
    date: addWeeks(meal.date.toDate(), shift),
    mealType: meal.mealType,
    source: mealSourceOf(meal),
  }))
  const isCopied = await runWrite(() => replaceMeals(weekMeals.value, copies), 'La semaine n\'a pas pu être copiée')
  if (isCopied) {
    const label = formatWeekLabel(sourceWeekStart, addDays(sourceWeekStart, DAYS_PER_WEEK - 1))
    toast.add({ title: 'Semaine copiée', description: `Les repas de la semaine du ${label} ont été recopiés.`, color: 'success' })
  }
}

const shoppingListOpen = ref(false)
/**
 * Plage proposée à l'ouverture de la liste de courses : 7 jours à partir du jour de courses (Réglages) de la semaine
 * affichée, ex. du vendredi au jeudi suivant.
 */
const shoppingListRange = computed(() => {
  const start = addDays(selectedWeekStart.value, settings.value.shoppingDay)
  return { start, end: addDays(start, DAYS_PER_WEEK - 1) }
})

const slideoverOpen = ref(false)
const selectedRecipe = ref<Recipe | null>(null)
/** Parts du repas cliqué : la fiche recalcule les quantités d'ingrédients pour ce nombre de parts. */
const selectedRecipeParts = ref<number | null>(null)

const findEntry = (entryId: string) => Object.values(entries.value)
  .flatMap(meals => Object.values(meals).flat())
  .find(e => e.id === entryId)

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
  addModalOpen.value || clearDialogOpen.value || copyWeekOpen.value || shoppingListOpen.value
  || slideoverOpen.value || actionsOpen.value
)

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isOverlayOpen.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
  if (event.key === 'ArrowLeft') goToPreviousWeek()
  else goToNextWeek()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <UDashboardPanel id="menus">
    <template #header>
      <UDashboardNavbar title="Menus de la semaine">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!--
        Mobile, tablette : le calendrier garde sa hauteur naturelle tant qu'elle tient, sinon il se limite à la place
        restante (24rem au moins) et défile à l'intérieur, ligne des jours figée. PC : hauteur naturelle, la page défile.
        L'en-tête et le résumé ne rétrécissent pas.
      -->
      <div class="flex flex-1 flex-col gap-4 overflow-x-clip p-4 max-lg:min-h-0 sm:gap-6 sm:p-6">
        <MenuWeekHeader
          class="shrink-0"
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
          @shopping-list="shoppingListOpen = true"
        />

        <!-- Moyenne par jour complet de la semaine, dans la forme du résumé de l'accueil ; repliée par défaut sur mobile. -->
        <CalorieSummary
          class="shrink-0"
          title="Moyenne / jour"
          state-key="menus-week-summary-open"
          :default-open="summaryOpenByDefault"
          :targets="DAILY_TARGETS"
          :eaten-kcal="summary.averageKcal"
          :extra-kcal="summary.averageExtraKcal"
          :macros="summary.macros"
          :complete-days="summary.completeDays"
        />

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
            class="max-lg:min-h-96 lg:shrink-0"
            ref="calendar"
            :key="isContinuous ? `continuous-${calendarKey}` : `${weekId(selectedWeekStart)}-${calendarKey}`"
            :days="days"
            :meal-types="mealTypes"
            :entries="entries"
            :targets="DAILY_TARGETS"
            :copied-entry-id="copiedMeal?.id"
            :continuous="isContinuous"
            @select-entry="selectEntry"
            @edit-entry="editEntry"
            @copy-entry="toggleCopyEntry"
            @delete-entry="deleteEntry"
            @move-entry="moveEntry"
            @add="addEntry"
            @visible-week="selectedWeekStart = $event"
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
    :description="[actionsEntry?.quantityLabel, actionsEntry ? `${actionsEntry.kcal} kcal` : null].filter(Boolean).join(' · ')"
  >
    <template #body>
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

  <ShoppingListSlideover
    v-model:open="shoppingListOpen"
    :recipes-by-id="recipesById"
    :ingredients-by-id="ingredientsById"
    :initial-range="shoppingListRange"
  />

  <RecipeDetailSlideover
    v-model:open="slideoverOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
    :parts="selectedRecipeParts"
  />
</template>
