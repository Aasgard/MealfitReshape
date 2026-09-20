<script setup lang="ts">
import { addDays, addWeeks, isBefore, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import { collection, or, query, where } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import type { MenuEntry, MenuMealTypeRow, MenuWeekEntries } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { buildWeekDays, buildWeekOptions, formatWeekLabel, parseWeekId, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'
import { mergeMenuEntries, summarizeMenuWeek } from '~/utils/menuEntries'
import { buildSampleWeek } from '~/utils/menuSample'

useSeoMeta({
  title: 'Dashboard - Menus de la semaine - Mealfit',
  description: 'Dashboard - Menus de la semaine - Mealfit',
})

/** Semaine réellement en cours (celle contenant aujourd'hui) : sert de référence pour "Cette semaine" et les données de démo. */
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
await Promise.all([recipes.promise.value, ingredients.promise.value])

const ingredientsById = computed(() => new Map(ingredients.value.map(i => [i.id, i])))

/** Semaine de démo bâtie à partir des recettes Firestore, le temps que la page lise/écrive de vrais menus. */
const referenceWeek = computed<MenuWeekEntries>(() => buildSampleWeek(recipes.value ?? [], ingredientsById.value))

const mealTypes: MenuMealTypeRow[] = [
  { key: 'petit-dej', label: 'Petit déj' },
  { key: 'dejeuner', label: 'Déjeuner' },
  { key: 'diner', label: 'Diner' },
  { key: 'collation', label: 'Collation' },
  { key: 'en-plus', label: 'En plus', avgLabel: 'Hors plan' },
]

/** Bande des semaines sélectionnables, centrée sur la semaine actuellement affichée. */
const WEEK_PICKER_RADIUS = 3
const weekOptions = computed(() => buildWeekOptions(selectedWeekStart.value, WEEK_PICKER_RADIUS, referenceWeekStart))
const selectedWeekId = computed(() => weekId(selectedWeekStart.value))
const selectWeek = (id: string) => { selectedWeekStart.value = parseWeekId(id) }

/** Repas ajoutés à la main (copier puis +), par semaine : addedEntries[weekId]. Locaux à la session, pas encore persistés. */
const addedEntries = ref<Record<string, MenuWeekEntries>>({})
let addedEntryCount = 0

/** Repas affichés : ceux de la semaine de référence (vides sur toute autre semaine, pas encore de données réelles) plus ceux ajoutés à la main. */
const entries = computed(() => mergeMenuEntries(
  isReferenceWeekSelected.value ? referenceWeek.value : {},
  addedEntries.value[selectedWeekId.value] ?? {}
))
const summary = computed(() => summarizeMenuWeek(entries.value))
const dayTotals = computed(() => summary.value.dayTotals)

/** Repas copié via l'icône des tuiles : le prochain clic sur un "+" en ajoute un exemplaire dans cette case. */
const copiedEntry = ref<MenuEntry | null>(null)

const toggleCopyEntry = (entryId: string) => {
  if (copiedEntry.value?.id === entryId) {
    copiedEntry.value = null
    return
  }
  copiedEntry.value = Object.values(entries.value)
    .flatMap(meals => Object.values(meals).flat())
    .find(e => e.id === entryId) ?? null
}

/** Un clic ailleurs que sur une icône "copier" ou un "+" (marqués `data-copy-control`) annule la copie en cours. */
const cancelCopyOnOutsideClick = (event: MouseEvent) => {
  if (!copiedEntry.value) return
  if (event.target instanceof Element && event.target.closest('[data-copy-control]')) return
  copiedEntry.value = null
}
onMounted(() => document.addEventListener('click', cancelCopyOnOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', cancelCopyOnOutsideClick))

const addEntry = (dayKey: string, mealTypeKey: string) => {
  const copied = copiedEntry.value
  if (!copied) return

  const week = addedEntries.value[selectedWeekId.value] ??= {}
  const day = week[dayKey] ??= {}
  ;(day[mealTypeKey] ??= []).push({ ...copied, id: `added-${++addedEntryCount}` })
  copiedEntry.value = null
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
          @previous="goToPreviousWeek"
          @next="goToNextWeek"
          @this-week="goToCurrentWeek"
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
          :days="days"
          :meal-types="mealTypes"
          :entries="entries"
          :day-totals="dayTotals"
          :copied-entry-id="copiedEntry?.id"
          @select-entry="selectEntry"
          @copy-entry="toggleCopyEntry"
          @add="addEntry"
        />
      </div>
    </template>
  </UDashboardPanel>

  <RecipeDetailSlideover
    v-model:open="slideoverOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
  />
</template>
