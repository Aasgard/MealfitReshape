<script setup lang="ts">
import { addDays, addWeeks, isBefore, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import type { Meal, MealSource, MealType } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { DAILY_TARGETS } from '~/utils/dailyTargets'
import { buildWeekDays, buildWeekOptions, formatWeekLabel, parseWeekId, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'
import { buildWeekEntries, MENU_MEAL_TYPES, mealSourceOf, mealsOfWeek, summarizeMenuWeek } from '~/utils/menuEntries'

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
const weekStatusLabel = computed(() => {
  if (isReferenceWeekSelected.value) return 'Semaine en cours'
  return isBefore(selectedWeekStart.value, referenceWeekStart) ? 'Semaine passée' : 'Semaine à venir'
})

const goToPreviousWeek = () => { selectedWeekStart.value = subWeeks(selectedWeekStart.value, 1) }
const goToNextWeek = () => { selectedWeekStart.value = addWeeks(selectedWeekStart.value, 1) }
const goToCurrentWeek = () => { selectedWeekStart.value = referenceWeekStart }

const days = computed(() => buildWeekDays(selectedWeekStart.value))

const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()
const toast = useToast()

/** Repas enregistrés (collection `meals`) de la semaine affichée et de la précédente. */
const { meals, addMeal, moveMeal, updateMealSource, replaceMeals } = useMeals(selectedWeekStart)
watch(meals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas : ${error.message}`, color: 'error' })
})

// Une erreur de chargement des repas (droits, index manquant...) est signalée par le toast ci-dessus, sans bloquer la page.
await Promise.all([recipes.promise.value, ingredients.promise.value, meals.promise.value.catch(() => undefined)])

const mealTypes = MENU_MEAL_TYPES

/** Bande des semaines sélectionnables, centrée sur la semaine actuellement affichée. */
const WEEK_PICKER_RADIUS = 3
const weekOptions = computed(() => buildWeekOptions(selectedWeekStart.value, WEEK_PICKER_RADIUS, referenceWeekStart))
const selectedWeekId = computed(() => weekId(selectedWeekStart.value))
const selectWeek = (id: string) => { selectedWeekStart.value = parseWeekId(id) }

const weekMeals = computed(() => mealsOfWeek(meals.value, selectedWeekStart.value))
const previousWeekMeals = computed(() => mealsOfWeek(meals.value, subWeeks(selectedWeekStart.value, 1)))
const isWeekEmpty = computed(() => !weekMeals.value.length)
const isPreviousWeekEmpty = computed(() => !previousWeekMeals.value.length)

const entries = computed(() => buildWeekEntries(weekMeals.value, selectedWeekStart.value, recipesById.value, ingredientsById.value))
const summary = computed(() => summarizeMenuWeek(entries.value))
const dayTotals = computed(() => summary.value.dayTotals)

/** Repas copié via l'icône des tuiles : le prochain clic sur un "+" en ajoute un exemplaire dans cette case. */
const copiedMeal = ref<{ id: string, source: MealSource } | null>(null)

const toggleCopyEntry = (entryId: string) => {
  if (copiedMeal.value?.id === entryId) {
    copiedMeal.value = null
    return
  }
  const meal = weekMeals.value.find(m => m.id === entryId)
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

const dateOfDay = (dayKey: string) => addDays(selectedWeekStart.value, days.value.findIndex(d => d.key === dayKey))

const saveMeal = (dayKey: string, mealType: MealType, source: MealSource) =>
  runWrite(() => addMeal({ date: dateOfDay(dayKey), mealType, source }), 'Le repas n\'a pas pu être enregistré')

/** Case pour laquelle la modale d'ajout est ouverte. */
const addModalOpen = ref(false)
const addTarget = ref<{ dayKey: string, mealTypeKey: MealType } | null>(null)
/** Repas modifié via la même modale ; `null` = ajout d'un nouveau repas dans `addTarget`. */
const editingMeal = ref<Meal | null>(null)
const editingSource = computed(() => editingMeal.value ? mealSourceOf(editingMeal.value) : null)

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
  const meal = weekMeals.value.find(m => m.id === entryId)
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
  const meal = weekMeals.value.find(m => m.id === entryId)
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
  const meal = weekMeals.value.find(m => m.id === entryId)
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

const copyPreviousDialogOpen = ref(false)

/** Recopie les repas de la semaine précédente (+ 7 jours) dans la semaine affichée, dont les repas actuels sont remplacés. */
const copyPreviousWeek = async () => {
  copyPreviousDialogOpen.value = false
  copiedMeal.value = null

  const copies = previousWeekMeals.value.map(meal => ({
    date: addWeeks(meal.date.toDate(), 1),
    mealType: meal.mealType,
    source: mealSourceOf(meal),
  }))
  const isCopied = await runWrite(() => replaceMeals(weekMeals.value, copies), 'La semaine n\'a pas pu être copiée')
  if (isCopied) toast.add({ title: 'Semaine copiée', description: 'Les repas de la semaine précédente ont été recopiés.', color: 'success' })
}

/** Copie directement si la semaine affichée est vide ; sinon demande confirmation avant de remplacer ses repas. */
const requestCopyPreviousWeek = () => {
  if (isWeekEmpty.value) copyPreviousWeek()
  else copyPreviousDialogOpen.value = true
}

const shoppingListOpen = ref(false)
/** Plage proposée à l'ouverture de la liste de courses : la semaine affichée. */
const shoppingListRange = computed(() => ({ start: selectedWeekStart.value, end: addDays(selectedWeekStart.value, 6) }))

const slideoverOpen = ref(false)
const selectedRecipe = ref<Recipe | null>(null)

const findEntry = (entryId: string) => Object.values(entries.value)
  .flatMap(meals => Object.values(meals).flat())
  .find(e => e.id === entryId)

/** Ouvre la fiche de la recette dont provient le repas. */
const openEntryRecipe = (entry: MenuEntry | undefined) => {
  const recipe = recipes.value.find(r => r.id === entry?.recipeId)
  if (!recipe) return

  selectedRecipe.value = recipe
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
      <div class="flex flex-col gap-6 p-4 sm:p-6">
        <MenuWeekHeader
          :week-label="weekLabel"
          :week-label-short="weekLabelShort"
          :week-status-label="weekStatusLabel"
          :is-current-week="isReferenceWeekSelected"
          :clear-disabled="isWeekEmpty"
          :copy-previous-disabled="isPreviousWeekEmpty"
          @previous="goToPreviousWeek"
          @next="goToNextWeek"
          @this-week="goToCurrentWeek"
          @clear="clearDialogOpen = true"
          @copy-previous="requestCopyPreviousWeek"
          @shopping-list="shoppingListOpen = true"
        />

        <MenuWeekPicker :model-value="selectedWeekId" :weeks="weekOptions" @update:model-value="selectWeek" />

        <MenuWeekStats
          :average-kcal="summary.averageKcal"
          :target-kcal="DAILY_TARGETS.calories"
          :overage-per-day-kcal="summary.overagePerDayKcal"
          :overage-count="summary.overageCount"
          :overage-total-kcal="summary.overageTotalKcal"
          :macros="summary.macros"
        />

        <MenuWeekCalendar
          :key="calendarKey"
          :days="days"
          :meal-types="mealTypes"
          :entries="entries"
          :day-totals="dayTotals"
          :copied-entry-id="copiedMeal?.id"
          @select-entry="selectEntry"
          @edit-entry="editEntry"
          @copy-entry="toggleCopyEntry"
          @delete-entry="deleteEntry"
          @move-entry="moveEntry"
          @add="addEntry"
        />
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

  <ConfirmDialog
    v-model:open="copyPreviousDialogOpen"
    title="Copier la semaine précédente ?"
    description="Les repas de cette semaine seront remplacés par ceux de la semaine précédente."
    confirm-label="Remplacer"
    confirm-color="warning"
    confirm-icon="i-lucide-copy"
    @confirm="copyPreviousWeek"
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
  />
</template>
