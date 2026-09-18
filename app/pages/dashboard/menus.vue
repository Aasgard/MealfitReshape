<script setup lang="ts">
import { addDays, addWeeks, isBefore, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import type { MenuEntry, MenuMealTypeRow } from '~/types/menu'
import { buildWeekDays, buildWeekOptions, formatWeekLabel, parseWeekId, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'

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

const mealTypes: MenuMealTypeRow[] = [
  { key: 'petit-dej', label: 'Petit déj', avgLabel: '~488 kcal' },
  { key: 'dejeuner', label: 'Déjeuner', avgLabel: '~650 kcal' },
  { key: 'diner', label: 'Diner', avgLabel: '~406 kcal' },
  { key: 'collation', label: 'Collation', avgLabel: '~81 kcal' },
  { key: 'en-plus', label: 'En plus', avgLabel: 'Hors plan' },
]

let nextEntryId = 0
const entry = (label: string, kcal: number): MenuEntry => ({ id: `entry-${nextEntryId++}`, label, kcal })

/** Repas/aliments de la semaine en cours (référence pour la démo, le temps que la page soit branchée à Firestore). */
const referenceEntries: Record<string, Record<string, MenuEntry[]>> = {
  lun: {
    'petit-dej': [entry('Omelette aux champignons', 389)],
    dejeuner: [entry('Pâtes de courgettes, poulet, amandes', 433)],
    diner: [entry('Saumon, légumes rôtis', 430)],
    collation: [entry('Poignée d’amandes', 180)],
  },
  mar: {
    'petit-dej': [entry('Porridge avoine-banane', 320)],
    dejeuner: [entry('Buddha bowl quinoa-pois chiches', 520)],
    diner: [entry('Curry de pois chiches', 400)],
    collation: [entry('Yaourt grec et miel', 150)],
  },
  mer: {
    'petit-dej': [entry('Skyr, fruits rouges, amandes', 265)],
    dejeuner: [entry('Soupe de lentilles corail', 390)],
    diner: [entry('Risotto aux champignons', 470), entry('Omelette et salade verte', 350)],
    'en-plus': [entry('Carré de chocolat', 110)],
  },
  jeu: {
    'petit-dej': [entry('Omelette aux champignons', 389)],
    dejeuner: [entry('Pâtes de courgettes, poulet, amandes', 433)],
    diner: [entry('Omelette et salade verte', 350)],
    collation: [entry('Poignée d’amandes', 180)],
  },
  ven: {
    'petit-dej': [entry('Porridge avoine-banane', 320)],
    dejeuner: [entry('Wrap thon-crudités', 480)],
    diner: [entry('Saumon, légumes rôtis', 430)],
    'en-plus': [entry('Verre de vin', 125), entry('Poignée de chips', 150)],
  },
  sam: {
    'petit-dej': [entry('Pancakes à l’avoine', 410)],
    dejeuner: [entry('Buddha bowl quinoa-pois chiches', 520), entry('Soupe de lentilles corail', 390)],
    collation: [entry('Pomme, beurre de cacahuète', 230)],
    'en-plus': [entry('Cookie', 180)],
  },
  dim: {
    'petit-dej': [entry('Skyr, fruits rouges, amandes', 265)],
    diner: [entry('Curry de pois chiches', 400)],
  },
}

const referenceDayTotals: Record<string, number> = {
  lun: 1432,
  mar: 1390,
  mer: 1585,
  jeu: 1352,
  ven: 1505,
  sam: 1730,
  dim: 665,
}

/** Bande des semaines sélectionnables, centrée sur la semaine actuellement affichée. */
const WEEK_PICKER_RADIUS = 3
const weekOptions = computed(() => buildWeekOptions(selectedWeekStart.value, WEEK_PICKER_RADIUS, referenceWeekStart))
const selectedWeekId = computed(() => weekId(selectedWeekStart.value))
const selectWeek = (id: string) => { selectedWeekStart.value = parseWeekId(id) }

/** Repas/aliments et total kcal affichés : ceux de la semaine de référence, vides sur toute autre semaine (pas encore de données réelles). */
const entries = computed(() => isReferenceWeekSelected.value ? referenceEntries : {})
const dayTotals = computed(() => isReferenceWeekSelected.value ? referenceDayTotals : {})

const stats = computed(() => isReferenceWeekSelected.value
  ? { averageKcal: 1380, overagePerDayKcal: 81, overageCount: 4, overageTotalKcal: 565, macros: { protein: 74, carbohydrates: 113, fat: 59 } }
  : { averageKcal: 0, overagePerDayKcal: 0, overageCount: 0, overageTotalKcal: 0, macros: { protein: 0, carbohydrates: 0, fat: 0 } })
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
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
