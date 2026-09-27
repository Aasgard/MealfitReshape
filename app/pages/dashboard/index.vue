<script setup lang="ts">
import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Ingredient } from '~/types/ingredient'
import type { MealSource, MealType } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import type { MealSlot, TodayCookingRecipe, TodayMealRow } from '~/types/today'
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Jour affiché : aujourd'hui à l'ouverture, puis jours précédents / suivants (balayage, boutons, flèches du clavier). */
const selectedDay = ref(today)
/** Sens du dernier changement de jour, pour faire glisser le contenu du bon côté. */
const slideDirection = ref<'previous' | 'next'>('next')

const goToDay = (day: Date) => {
  const offset = differenceInCalendarDays(day, selectedDay.value)
  if (!offset) return
  slideDirection.value = offset > 0 ? 'next' : 'previous'
  selectedDay.value = day
}
const goToPreviousDay = () => goToDay(addDays(selectedDay.value, -1))
const goToNextDay = () => goToDay(addDays(selectedDay.value, 1))

const selectedDayKey = computed(() => format(selectedDay.value, 'yyyy-MM-dd'))
const isTodaySelected = computed(() => differenceInCalendarDays(selectedDay.value, today) === 0)

/** "Aujourd'hui", "Hier", "Demain", sinon "Lundi 28 septembre". */
const selectedDayTitle = computed(() => {
  const offset = differenceInCalendarDays(selectedDay.value, today)
  if (offset === 0) return "Aujourd'hui"
  if (offset === -1) return 'Hier'
  if (offset === 1) return 'Demain'
  return capitalize(format(selectedDay.value, 'EEEE d MMMM', { locale: fr }))
})
/** Date complète sous un titre relatif ("Aujourd'hui" → "dimanche 27 septembre"). */
const selectedDaySubtitle = computed(() =>
  Math.abs(differenceInCalendarDays(selectedDay.value, today)) <= 1 ? format(selectedDay.value, 'EEEE d MMMM', { locale: fr }) : ''
)

const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()

const selectedWeekStart = computed(() => startOfWeek(selectedDay.value, { weekStartsOn: WEEK_STARTS_ON }))

// Semaine du jour affiché (et la précédente) : naviguer dans une même semaine ne relance pas de requête.
const { meals, addMeal } = useMeals(selectedWeekStart)
watch(meals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas : ${error.message}`, color: 'error' })
})

/** Une recette cuisinée couvre ses repas du jour même et des 6 jours suivants. */
const COOKING_DAYS = 7
/** Historique chargé avant la semaine affichée pour retrouver les fournées en cours (voir `recipesToCook`). */
const COOKING_HISTORY_DAYS = 21

// Changent seulement avec la semaine : de 3 semaines avant celle du jour affiché à la fin de la suivante,
// qui contient toujours les 6 jours après le jour affiché.
const upcomingMeals = useMealsBetween(() => ({
  start: addDays(selectedWeekStart.value, -COOKING_HISTORY_DAYS),
  end: addDays(selectedWeekStart.value, 13),
}))
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

const dayEntries = computed(() => buildDayEntries(meals.value, selectedDay.value, recipesById.value, ingredientsById.value))
const daySummary = computed(() => summarizeDay(dayEntries.value))

const ALL_MEAL_SLOTS = [...PLANNED_MEALS, ...OUT_OF_PLAN_MEALS]

/** Repas rangés dans le panneau "Autres repas" (fermé par défaut) tant qu'ils sont vides. */
const COLLAPSED_WHEN_EMPTY: MealType[] = ['SNACK', 'EXCESS']
/** Repas toujours rangés dans le panneau. */
const ALWAYS_COLLAPSED: MealType[] = ['NOTCOUNT']

const allMealRows = computed(() => ALL_MEAL_SLOTS.map((slot): TodayMealRow => {
  const entries = dayEntries.value[slot.mealType] ?? []
  return { ...slot, kcal: entries.reduce((total, entry) => total + entry.kcal, 0), entries }
}))

const isCollapsed = (row: TodayMealRow) =>
  ALWAYS_COLLAPSED.includes(row.mealType) || (COLLAPSED_WHEN_EMPTY.includes(row.mealType) && !row.entries.length)

const mealRows = computed(() => allMealRows.value.filter(row => !isCollapsed(row)))
const secondaryMealRows = computed(() => allMealRows.value.filter(isCollapsed))

/** "aujourd'hui", "hier", "demain", puis le nom du jour : la fenêtre ne dure que 7 jours, il n'y a pas d'ambiguïté. */
const cookingDayLabel = (day: Date) => {
  const offset = differenceInCalendarDays(day, today)
  if (offset === 0) return "aujourd'hui"
  if (offset === -1) return 'hier'
  if (offset === 1) return 'demain'
  return format(day, 'EEEE', { locale: fr })
}

/**
 * Recettes à cuisiner le jour affiché, en une fois pour leurs repas des 7 jours (parts cumulées). Une recette déjà cuisinée
 * dans les 6 jours précédents, même la semaine d'avant, est un reste ; les recettes supprimées depuis sont ignorées.
 */
const cookingRecipes = computed<TodayCookingRecipe[]>(() =>
  recipesToCook(upcomingMeals.value, COOKING_DAYS).flatMap((item) => {
    const recipe = recipesById.value.get(item.recipeId)
    if (!recipe || differenceInCalendarDays(item.days[0]!, selectedDay.value) !== 0) return []
    return [{
      recipeId: recipe.id,
      title: recipe.title,
      imageUrl: recipe.imageUrl,
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

/** Repas pour lequel la fenêtre d'ajout est ouverte (au jour affiché). */
const addModalOpen = ref(false)
const addTarget = ref<MealSlot | null>(null)

const openAddModal = (mealType: MealType) => {
  addTarget.value = ALL_MEAL_SLOTS.find(slot => slot.mealType === mealType) ?? null
  addModalOpen.value = true
}

const addContextLabel = computed(() => addTarget.value ? `${selectedDayTitle.value} · ${addTarget.value.label}` : '')

const submitAddedMeal = async (source: MealSource) => {
  if (!addTarget.value) return
  try {
    await addMeal({ date: selectedDay.value, mealType: addTarget.value.mealType, source })
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: `Le repas n'a pas pu être enregistré : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  }
}

/** Balayage horizontal (mobile, tablette) : vers la gauche = jour suivant, vers la droite = jour précédent. */
const SWIPE_MIN_DISTANCE = 60
let swipeStart: { x: number, y: number } | null = null

const onTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0]
  swipeStart = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null
}

const onTouchEnd = (event: TouchEvent) => {
  const touch = event.changedTouches[0]
  if (!swipeStart || !touch) return
  const dx = touch.clientX - swipeStart.x
  const dy = touch.clientY - swipeStart.y
  swipeStart = null
  // Un geste surtout vertical est un défilement de la page, pas un changement de jour.
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return
  if (dx < 0) goToNextDay()
  else goToPreviousDay()
}

/** Flèches ← / → du clavier (desktop), sauf pendant une saisie ou quand une fenêtre est ouverte. */
const isOverlayOpen = computed(() => addModalOpen.value || recipeDetailOpen.value || ingredientDetailOpen.value)

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isOverlayOpen.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  if (event.key === 'ArrowLeft') goToPreviousDay()
  else goToNextDay()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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
      <div
        class="flex min-h-full flex-col gap-6 overflow-x-hidden p-4 sm:p-6"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0" aria-live="polite">
            <h1 class="truncate text-2xl font-bold tracking-tight text-highlighted">
              {{ selectedDayTitle }}
            </h1>
            <p v-if="selectedDaySubtitle" class="text-sm text-dimmed">
              {{ selectedDaySubtitle }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <UButton
              v-if="!isTodaySelected"
              label="Aujourd'hui"
              color="neutral"
              variant="outline"
              size="sm"
              @click="goToDay(today)"
            />
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              aria-label="Jour précédent"
              @click="goToPreviousDay"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              aria-label="Jour suivant"
              @click="goToNextDay"
            />
          </div>
        </div>

        <Transition
          mode="out-in"
          enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
          leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
          :enter-from-class="slideDirection === 'next' ? 'opacity-0 translate-x-8' : 'opacity-0 -translate-x-8'"
          :leave-to-class="slideDirection === 'next' ? 'opacity-0 -translate-x-8' : 'opacity-0 translate-x-8'"
        >
          <div :key="selectedDayKey" class="flex flex-col gap-6">
            <TodayCalorieSummary
              :targets="DAILY_TARGETS"
              :eaten-kcal="daySummary.kcal"
              :extra-kcal="daySummary.extraKcal"
              :macros="daySummary.macros"
            />

            <div class="flex items-baseline justify-between gap-3">
              <h2 class="text-lg font-bold tracking-tight text-highlighted">
                Alimentation
              </h2>
              <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
                Plus
              </NuxtLink>
            </div>

            <TodayMeals :rows="mealRows" :secondary-rows="secondaryMealRows" @add="openAddModal" @open="openEntryDetail" />

            <div class="flex items-baseline justify-between gap-3">
              <h2 class="text-lg font-bold tracking-tight text-highlighted">
                À cuisiner
              </h2>
              <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
                Plus
              </NuxtLink>
            </div>

            <TodayCooking :recipes="cookingRecipes" :is-today="isTodaySelected" @open="openRecipeDetail" />
          </div>
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
