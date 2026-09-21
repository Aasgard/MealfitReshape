<script setup lang="ts">
import { addDays, addWeeks, isBefore, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import { collection, or, query, where } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import type { MealSource, MealType } from '~/types/meal'
import type { MenuMealTypeRow } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { buildWeekDays, buildWeekOptions, formatWeekLabel, parseWeekId, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'
import { buildWeekEntries, EXTRA_MEAL_KEY, mealSourceOf, mealsOfWeek, summarizeMenuWeek, UNCOUNTED_MEAL_KEY } from '~/utils/menuEntries'

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
const weekStatusLabel = computed(() => {
  if (isReferenceWeekSelected.value) return 'Semaine en cours'
  return isBefore(selectedWeekStart.value, referenceWeekStart) ? 'Semaine passée' : 'Semaine à venir'
})

const goToPreviousWeek = () => { selectedWeekStart.value = subWeeks(selectedWeekStart.value, 1) }
const goToNextWeek = () => { selectedWeekStart.value = addWeeks(selectedWeekStart.value, 1) }
const goToCurrentWeek = () => { selectedWeekStart.value = referenceWeekStart }

const days = computed(() => buildWeekDays(selectedWeekStart.value))

const db = useFirestore()
const user = useCurrentUser()

const recipes = useCollection<Recipe>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'recipes'),
    or(
      where('owner', '==', uid),
      where('owner', '==', null)
    )
  )
})

/** Catalogue d'ingrédients (privés de l'utilisateur + publics) pour calculer les kcal par part des recettes. */
const ingredients = useCollection<Ingredient>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', uid),
      where('owner', '==', null)
    )
  )
})
const toast = useToast()

/** Repas enregistrés (collection `meals`) de la semaine affichée et de la précédente. */
const { meals, addMeal, moveMeal, replaceMeals } = useMeals(selectedWeekStart)
watch(meals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas : ${error.message}`, color: 'error' })
})

// Une erreur de chargement des repas (droits, index manquant...) est signalée par le toast ci-dessus, sans bloquer la page.
await Promise.all([recipes.promise.value, ingredients.promise.value, meals.promise.value.catch(() => undefined)])

const recipesById = computed(() => new Map(recipes.value.map(r => [r.id, r])))
const ingredientsById = computed(() => new Map(ingredients.value.map(i => [i.id, i])))

const mealTypes: MenuMealTypeRow[] = [
  { key: 'BREAKFAST', label: 'Petit déj' },
  { key: 'LUNCH', label: 'Déjeuner' },
  { key: 'DINER', label: 'Diner' },
  { key: 'SNACK', label: 'Collation' },
  { key: EXTRA_MEAL_KEY, label: 'En plus', avgLabel: 'Hors plan' },
  { key: UNCOUNTED_MEAL_KEY, label: 'Non compté', avgLabel: 'Hors totaux' },
]

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
    addTarget.value = { dayKey, mealTypeKey }
    addModalOpen.value = true
    return
  }

  saveMeal(dayKey, mealTypeKey, copied.source)
  copiedMeal.value = null
}

const submitAddedEntry = (source: MealSource) => {
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

const slideoverOpen = ref(false)
const selectedRecipe = ref<Recipe | null>(null)

/** Ouvre la fiche de la recette dont provient le repas cliqué dans le calendrier. */
const selectEntry = (entryId: string) => {
  const recipeId = Object.values(entries.value)
    .flatMap(meals => Object.values(meals).flat())
    .find(e => e.id === entryId)?.recipeId
  const recipe = recipes.value.find(r => r.id === recipeId)
  if (!recipe) return

  selectedRecipe.value = recipe
  slideoverOpen.value = true
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
          :week-status-label="weekStatusLabel"
          :is-current-week="isReferenceWeekSelected"
          :clear-disabled="isWeekEmpty"
          :copy-previous-disabled="isPreviousWeekEmpty"
          @previous="goToPreviousWeek"
          @next="goToNextWeek"
          @this-week="goToCurrentWeek"
          @clear="clearDialogOpen = true"
          @copy-previous="requestCopyPreviousWeek"
        />

        <MenuWeekPicker :model-value="selectedWeekId" :weeks="weekOptions" @update:model-value="selectWeek" />

        <MenuWeekStats
          :average-kcal="summary.averageKcal"
          :target-kcal="1625"
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

  <RecipeDetailSlideover
    v-model:open="slideoverOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
  />
</template>
