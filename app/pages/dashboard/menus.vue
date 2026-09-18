<script setup lang="ts">
import { addDays, addWeeks, isBefore, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import { collection, or, query, where } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import type { MenuMealTypeRow } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import { buildWeekDays, buildWeekOptions, formatWeekLabel, parseWeekId, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'
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
const referenceWeek = computed(() => buildSampleWeek(recipes.value ?? [], ingredientsById.value))

const mealTypes = computed<MenuMealTypeRow[]>(() => {
  const averages = referenceWeek.value.mealAverages
  const avgLabel = (key: string) => averages[key] != null ? `~${averages[key]} kcal` : undefined
  return [
    { key: 'petit-dej', label: 'Petit déj', avgLabel: avgLabel('petit-dej') },
    { key: 'dejeuner', label: 'Déjeuner', avgLabel: avgLabel('dejeuner') },
    { key: 'diner', label: 'Diner', avgLabel: avgLabel('diner') },
    { key: 'collation', label: 'Collation', avgLabel: avgLabel('collation') },
    { key: 'en-plus', label: 'En plus', avgLabel: 'Hors plan' },
  ]
})

/** Bande des semaines sélectionnables, centrée sur la semaine actuellement affichée. */
const WEEK_PICKER_RADIUS = 3
const weekOptions = computed(() => buildWeekOptions(selectedWeekStart.value, WEEK_PICKER_RADIUS, referenceWeekStart))
const selectedWeekId = computed(() => weekId(selectedWeekStart.value))
const selectWeek = (id: string) => { selectedWeekStart.value = parseWeekId(id) }

/** Repas/aliments et total kcal affichés : ceux de la semaine de référence, vides sur toute autre semaine (pas encore de données réelles). */
const entries = computed(() => isReferenceWeekSelected.value ? referenceWeek.value.entries : {})
const dayTotals = computed(() => isReferenceWeekSelected.value ? referenceWeek.value.dayTotals : {})

const stats = computed(() => isReferenceWeekSelected.value
  ? referenceWeek.value.stats
  : { averageKcal: 0, overagePerDayKcal: 0, overageCount: 0, overageTotalKcal: 0, macros: { protein: 0, carbohydrates: 0, fat: 0 } })

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
          :average-kcal="stats.averageKcal"
          :target-kcal="1625"
          :overage-per-day-kcal="stats.overagePerDayKcal"
          :overage-count="stats.overageCount"
          :overage-total-kcal="stats.overageTotalKcal"
          :macros="stats.macros"
        />

        <MenuWeekCalendar
          :days="days"
          :meal-types="mealTypes"
          :entries="entries"
          :day-totals="dayTotals"
          @select-entry="selectEntry"
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
