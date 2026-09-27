<script setup lang="ts">
import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Ingredient } from '~/types/ingredient'
import type { MealSource, MealType } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import type { MealSlot, TodayCookingRecipe, TodayMealRow, TodayTrendDay } from '~/types/today'
import { DAILY_TARGETS, OUT_OF_PLAN_MEALS, PLANNED_MEALS } from '~/utils/dailyTargets'
import { buildDayEntries, summarizeDay } from '~/utils/menuEntries'
import { recipesToCook } from '~/utils/recipesToCook'
import { WEEK_STARTS_ON } from '~/utils/menuWeek'

useSeoMeta({
  title: 'Dashboard - Accueil - Mealfit',
  description: 'Dashboard - Accueil - Mealfit',
})

const toast = useToast()
const today = startOfDay(new Date())

const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()

// La semaine en cours et la précédente (chargées par useMeals) couvrent les 7 derniers jours.
const { meals, addMeal } = useMeals(ref(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON })))
watch(meals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas : ${error.message}`, color: 'error' })
})

/** Fenêtre "À cuisiner" : aujourd'hui et les 6 jours suivants. */
const COOKING_DAYS = 7
const cookingEnd = addDays(today, COOKING_DAYS - 1)

// Depuis le début de la semaine : une recette déjà mangée avant aujourd'hui est déjà cuisinée (ses repas suivants sont des restes).
const upcomingMeals = useMealsBetween({
  start: startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }),
  end: cookingEnd,
})
watch(upcomingMeals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas à venir : ${error.message}`, color: 'error' })
})

// Une erreur de chargement des repas (droits, index manquant...) est signalée par un toast ci-dessus, sans bloquer la page.
await Promise.all([
  recipes.promise.value,
  ingredients.promise.value,
  meals.promise.value.catch(() => undefined),
  upcomingMeals.promise.value.catch(() => undefined),
])

const entriesOfDay = (day: Date) => buildDayEntries(meals.value, day, recipesById.value, ingredientsById.value)

const todayEntries = computed(() => entriesOfDay(today))
const todaySummary = computed(() => summarizeDay(todayEntries.value))

const trendDays = computed<TodayTrendDay[]>(() =>
  Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 6)
    return {
      key: format(day, 'yyyy-MM-dd'),
      label: format(day, 'EEEEE', { locale: fr }).toUpperCase(),
      fullLabel: format(day, 'EEEE d MMMM', { locale: fr }),
      kcal: summarizeDay(entriesOfDay(day)).kcal,
      isToday: index === 6,
    }
  })
)

/** Les 4 repas du plan, puis "En plus" / "Non compté" seulement s'ils contiennent quelque chose. */
const mealRows = computed<TodayMealRow[]>(() => {
  const toRow = (slot: MealSlot): TodayMealRow => {
    const entries = todayEntries.value[slot.mealType] ?? []
    return { ...slot, kcal: entries.reduce((total, entry) => total + entry.kcal, 0), entries }
  }
  return [
    ...PLANNED_MEALS.map(toRow),
    ...OUT_OF_PLAN_MEALS.filter(slot => todayEntries.value[slot.mealType]?.length).map(toRow),
  ]
})

const ALL_MEAL_SLOTS = [...PLANNED_MEALS, ...OUT_OF_PLAN_MEALS]

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "aujourd'hui", "demain", puis le nom du jour : la fenêtre ne dure que 7 jours, il n'y a pas d'ambiguïté. */
const cookingDayLabel = (day: Date) => {
  const offset = differenceInCalendarDays(day, today)
  if (offset === 0) return "aujourd'hui"
  if (offset === 1) return 'demain'
  return format(day, 'EEEE', { locale: fr })
}

/** Recettes à préparer en une fois pour la fenêtre, parts cumulées ; les recettes supprimées depuis sont ignorées. */
const cookingRecipes = computed<TodayCookingRecipe[]>(() =>
  recipesToCook(upcomingMeals.value, today, cookingEnd).flatMap((item) => {
    const recipe = recipesById.value.get(item.recipeId)
    if (!recipe) return []
    return [{
      recipeId: recipe.id,
      title: recipe.title,
      daysLabel: capitalize(item.days.map(cookingDayLabel).join(', ')),
      parts: item.parts,
    }]
  })
)

/** Fiche de la recette ou de l'aliment d'un repas, ouverte au clic sur celui-ci. */
const recipeDetailOpen = ref(false)
const selectedRecipe = ref<Recipe | null>(null)
/** Parts du repas cliqué : la fiche recalcule les quantités d'ingrédients pour ce nombre de parts. */
const selectedRecipeParts = ref<number | null>(null)
const ingredientDetailOpen = ref(false)
const selectedIngredient = ref<Ingredient | null>(null)

const openRecipeDetail = (recipeId: string, parts?: number) => {
  const recipe = recipesById.value.get(recipeId)
  if (!recipe) return false
  selectedRecipe.value = recipe
  selectedRecipeParts.value = parts ?? null
  recipeDetailOpen.value = true
  return true
}

const openEntryDetail = (entry: MenuEntry) => {
  if (entry.recipeId && openRecipeDetail(entry.recipeId, entry.parts)) return
  const ingredient = entry.ingredientId ? ingredientsById.value.get(entry.ingredientId) : undefined
  if (ingredient) {
    selectedIngredient.value = ingredient
    ingredientDetailOpen.value = true
  }
}

/** Repas pour lequel la fenêtre d'ajout est ouverte (toujours à la date du jour). */
const addModalOpen = ref(false)
const addTarget = ref<MealSlot | null>(null)

const openAddModal = (mealType: MealType) => {
  addTarget.value = ALL_MEAL_SLOTS.find(slot => slot.mealType === mealType) ?? null
  addModalOpen.value = true
}

const addContextLabel = computed(() => addTarget.value ? `Aujourd'hui · ${addTarget.value.label}` : '')

const submitAddedMeal = async (source: MealSource) => {
  if (!addTarget.value) return
  try {
    await addMeal({ date: today, mealType: addTarget.value.mealType, source })
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: `Le repas n'a pas pu être enregistré : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  }
}
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Accueil">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6 p-4 sm:p-6">
        <div class="flex items-baseline justify-between gap-3">
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">
            Aujourd'hui
          </h1>
          <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
            Détails
          </NuxtLink>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <TodayCalorieSummary
            :targets="DAILY_TARGETS"
            :eaten-kcal="todaySummary.kcal"
            :extra-kcal="todaySummary.extraKcal"
            :macros="todaySummary.macros"
          />
          <TodayWeekTrend :days="trendDays" :target-kcal="DAILY_TARGETS.calories" />
        </div>

        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-lg font-bold tracking-tight text-highlighted">
            Alimentation
          </h2>
          <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
            Plus
          </NuxtLink>
        </div>

        <TodayMeals :rows="mealRows" @add="openAddModal" @open="openEntryDetail" />

        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-lg font-bold tracking-tight text-highlighted">
            À cuisiner
          </h2>
          <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
            Plus
          </NuxtLink>
        </div>

        <TodayCooking :recipes="cookingRecipes" @open="openRecipeDetail" />
      </div>
    </template>
  </UDashboardPanel>

  <MenuAddEntryModal
    v-model:open="addModalOpen"
    :recipes="recipes"
    :ingredients="ingredients"
    :ingredients-by-id="ingredientsById"
    :context-label="addContextLabel"
    @submit="submitAddedMeal"
  />

  <RecipeDetailSlideover
    v-model:open="recipeDetailOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
    :parts="selectedRecipeParts"
  />

  <IngredientDetailSlideover v-model:open="ingredientDetailOpen" :ingredient="selectedIngredient" />
</template>
