<script setup lang="ts">
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Ingredient } from '~/types/ingredient'
import type { Meal, MealSource, MealType } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import type { MealSlot, TodayCookingRecipe, TodayMealRow } from '~/types/today'
import { DAILY_TARGETS, OUT_OF_PLAN_MEALS, PLANNED_MEALS } from '~/utils/dailyTargets'
import { buildDayEntries, consumedOfDay, summarizeDay, UNCOUNTED_MEAL_KEY } from '~/utils/menuEntries'
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
/** Date courte à côté d'un titre relatif ("Aujourd'hui" → "dimanche 27/09"). */
const selectedDaySubtitle = computed(() =>
  Math.abs(differenceInCalendarDays(selectedDay.value, today)) <= 1 ? format(selectedDay.value, 'EEEE dd/MM', { locale: fr }) : ''
)

const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()

const selectedWeekStart = computed(() => startOfWeek(selectedDay.value, { weekStartsOn: WEEK_STARTS_ON }))

// Semaine du jour affiché (et la précédente) : naviguer dans une même semaine ne relance pas de requête.
const { meals, addMeal, replaceMeals } = useMeals(selectedWeekStart)
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

const { weighIns, error: weighInsError, promise: weighInsLoaded, saveWeighIn } = useWeighIns()
const profile = useProfile()
watch(weighInsError, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les pesées : ${error.message}`, color: 'error' })
})

// Une erreur de chargement des repas ou des pesées (droits, index manquant...) est signalée par un toast ci-dessus,
// sans bloquer la page.
await Promise.all([
  recipes.promise.value,
  ingredients.promise.value,
  meals.promise.value.catch(() => undefined),
  upcomingMeals.promise.value.catch(() => undefined),
  weighInsLoaded.value.catch(() => undefined),
  profile.ready,
])

/** Objectif du profil : seule la part atteinte sert ici, la projection n'est pas utilisée. */
const weightGoal = computed(() => trackingGoal(profile.goal, profile.body, profile.age))

/** Rythme et part de l'objectif au jour affiché ; jamais de poids brut sur l'accueil. */
const weightProgress = computed(() =>
  weighInsError.value ? null : weightProgressAt(weighIns.value, weightGoal.value, selectedDayKey.value),
)

/**
 * Saisie de la pesée seulement pour un jour passé ou aujourd'hui qui n'en a pas encore. Pesées illisibles : rien,
 * plutôt que de proposer d'écraser une pesée qui n'a pas pu être lue.
 */
const canWeighIn = computed(() =>
  !weighInsError.value
  && differenceInCalendarDays(selectedDay.value, today) <= 0
  && !weighIns.value.some(w => w.date === selectedDayKey.value),
)

/** Saisies de poids en cours, par jour. */
const weighInDrafts = ref<Record<string, string>>({})

const daysLabel = (days: number) => `${days} jour${days > 1 ? 's' : ''}`

/** "−0,3 kg en 2 jours", "Stable en 3 jours" ou "Première pesée", par rapport à la pesée précédant ce jour. */
const weighInChangeLabel = (date: string, weightKg: number) => {
  const previous = weighInBefore(weighIns.value, date)
  if (!previous) return 'Première pesée'
  const days = differenceInCalendarDays(parseISO(date), parseISO(previous.date))
  const delta = formatSignedWeight(weightKg - previous.weightKg)
  return delta === formatWeight(0) ? `Stable en ${daysLabel(days)}` : `${delta} kg en ${daysLabel(days)}`
}

/** Le listener retire la carte aussitôt ; hors ligne, l'écriture n'aboutit qu'à la synchronisation, d'où le toast immédiat. */
const submitWeighIn = (weightKg: number) => {
  const date = selectedDayKey.value
  const draft = weighInDrafts.value[date] ?? ''
  const description = weighInChangeLabel(date, weightKg)
  delete weighInDrafts.value[date]

  saveWeighIn({ date, weightKg }).catch((error: any) => {
    weighInDrafts.value[date] = draft
    toast.add({
      title: 'Erreur',
      description: `La pesée n'a pas pu être enregistrée : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  })
  // Jamais de poids brut sur l'accueil : seulement l'écart avec la pesée précédente.
  toast.add({ title: 'Pesée enregistrée', description, color: 'success', icon: 'i-lucide-check' })
}

/** Repas masqués immédiatement pendant le délai d'annulation d'une suppression (voir deleteEntry). */
const pendingDeleteIds = ref(new Set<string>())
const isNotPendingDelete = (meal: Meal) => !pendingDeleteIds.value.has(meal.id)

const dayEntries = computed(() =>
  buildDayEntries(meals.value.filter(isNotPendingDelete), selectedDay.value, recipesById.value, ingredientsById.value)
)
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
  recipesToCook(upcomingMeals.value.filter(isNotPendingDelete), COOKING_DAYS).flatMap((item) => {
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

/** Contenu du jour affiché et objectifs, pour le filtre « Dans mes objectifs » ; aucun pour la ligne « Non compté ». */
const addDayBudget = computed(() => {
  if (!addTarget.value || addTarget.value.mealType === UNCOUNTED_MEAL_KEY) return null
  return { consumed: consumedOfDay(dayEntries.value), targets: DAILY_TARGETS }
})

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

const DELETE_GRACE_PERIOD_MS = 6000
/** Handles des suppressions programmées mais pas encore exécutées (délai d'annulation en cours), par id de repas. */
const pendingDeleteTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const performDelete = async (meal: Meal, label: string) => {
  try {
    await replaceMeals([meal], [])
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: `« ${label} » n'a pas pu être supprimé : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  }
  // Après un échec, le repas réapparaît ; après une réussite, Firestore l'a déjà retiré de `meals`.
  pendingDeleteIds.value.delete(meal.id)
}

/** Masque le repas tout de suite et ne le supprime qu'après un court délai, le temps d'annuler depuis le toast. */
const deleteEntry = (entry: MenuEntry) => {
  const meal = meals.value.find(m => m.id === entry.id)
  if (!meal || pendingDeleteTimeouts.has(meal.id)) return

  const { id } = meal
  const { label } = entry
  pendingDeleteIds.value.add(id)

  const timeout = setTimeout(() => {
    pendingDeleteTimeouts.delete(id)
    performDelete(meal, label)
  }, DELETE_GRACE_PERIOD_MS)
  pendingDeleteTimeouts.set(id, timeout)

  toast.add({
    title: 'Repas supprimé',
    description: `« ${label} » sera définitivement supprimé.`,
    color: 'neutral',
    actions: [{
      label: 'Annuler',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        const pending = pendingDeleteTimeouts.get(id)
        if (!pending) return
        clearTimeout(pending)
        pendingDeleteTimeouts.delete(id)
        pendingDeleteIds.value.delete(id)
        toast.add({ title: 'Suppression annulée', description: `« ${label} » a été conservé`, color: 'success' })
      },
    }],
  })
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

      <!-- Dans l'en-tête du panneau (hors de la zone qui défile) : la ligne du jour reste visible au défilement. -->
      <div
        class="flex items-center justify-between gap-3 border-b border-default bg-default px-8 py-3 sm:px-12"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <div class="flex min-w-0 items-baseline gap-2" aria-live="polite">
          <h1 class="truncate text-2xl font-bold tracking-tight text-highlighted" :class="selectedDaySubtitle && 'shrink-0'">
            {{ selectedDayTitle }}
          </h1>
          <p v-if="selectedDaySubtitle" class="truncate text-sm text-dimmed">
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
    </template>

    <template #body>
      <div
        class="flex min-h-full flex-col gap-6 overflow-x-clip p-4 sm:p-6"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <Transition
          mode="out-in"
          enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
          leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
          :enter-from-class="slideDirection === 'next' ? 'opacity-0 translate-x-8' : 'opacity-0 -translate-x-8'"
          :leave-to-class="slideDirection === 'next' ? 'opacity-0 -translate-x-8' : 'opacity-0 translate-x-8'"
        >
          <div :key="selectedDayKey" class="flex flex-col gap-6">
            <!-- Une fois la pesée enregistrée, la carte se replie (marge comprise) au lieu de faire sauter la page. -->
            <Transition
              leave-active-class="transition-all duration-300 ease-out motion-reduce:transition-none"
              leave-from-class="grid-rows-[1fr]"
              leave-to-class="grid-rows-[0fr] -mb-6 opacity-0"
            >
              <div v-if="canWeighIn" class="grid">
                <div class="min-h-0 overflow-hidden">
                  <TodayWeighIn v-model="weighInDrafts[selectedDayKey]" @save="submitWeighIn" />
                </div>
              </div>
            </Transition>

            <CalorieSummary
              :targets="DAILY_TARGETS"
              :eaten-kcal="daySummary.kcal"
              :extra-kcal="daySummary.extraKcal"
              :macros="daySummary.macros"
              :weight-progress="weightProgress"
            />

            <div class="flex items-center justify-between gap-3">
              <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                <UIcon name="i-lucide-chef-hat" class="size-5 text-primary" aria-hidden="true" />
                Cuisiner
              </h2>
              <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
                Plus
              </NuxtLink>
            </div>

            <TodayCooking :recipes="cookingRecipes" :is-today="isTodaySelected" @open="openRecipeDetail" />

            <div class="flex items-center justify-between gap-3">
              <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                <UIcon name="i-lucide-utensils" class="size-5 text-primary" aria-hidden="true" />
                Manger
              </h2>
              <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
                Plus
              </NuxtLink>
            </div>

            <TodayMeals :rows="mealRows" :secondary-rows="secondaryMealRows" @add="openAddModal" @open="openEntryDetail" @delete="deleteEntry" />
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
    :day-budget="addDayBudget"
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
