<script setup lang="ts">
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useCurrentUser } from 'vuefire'
import type { Ingredient } from '~/types/ingredient'
import type { Meal, MealSource, MealType, StockMealSource } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { Recipe } from '~/types/recipe'
import type { Workout } from '~/types/workout'
import type { MealSlot, TodayCookingDay, TodayCookingPortion, TodayCookingRecipe, TodayMealRow, TodayThawDish } from '~/types/today'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { DAILY_TARGETS, OUT_OF_PLAN_MEALS, PLANNED_MEALS } from '~/utils/dailyTargets'
import { compareGroceryLines, groceryLineFromItem, MISC_AISLE, type GroceryLine } from '~/utils/groceryList'
import { buildDayEntries, consumedOfDay, mealSourceOf, MENU_MEAL_TYPES, summarizeDay, UNCOUNTED_MEAL_KEY } from '~/utils/menuEntries'
import { COOKING_DAYS, recipesToCook, type RecipeToCookPortion } from '~/utils/recipesToCook'
import type { DishStorage } from '~/types/preparedDish'
import { findBatchSurplus, formatParts, isDishPlanned, PARTS_EPSILON, SURPLUS_MEAL_PREFIX } from '~/utils/preparedDishes'
import { macrosForRecipe } from '~/utils/recipeNutrition'
import { shortDayLabel, WEEK_STARTS_ON } from '~/utils/menuWeek'

useSeoMeta({
  title: 'Dashboard - Accueil - Mealfit',
  description: 'Dashboard - Accueil - Mealfit',
})

// Pas de zoom sur l'accueil : la balise viewport le bloque sur Android, `touch-action` sur iOS (qui ignore user-scalable).
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }],
  htmlAttrs: { class: 'touch-pan-x touch-pan-y' },
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
/** À partir de demain : la dépense et le suivi du poids n'ont pas encore de valeur. */
const isFutureSelected = computed(() => differenceInCalendarDays(selectedDay.value, today) > 0)

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
const { meals, addMeal, updateMealSource, replaceMeals } = useMeals(selectedWeekStart)
watch(meals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas : ${error.message}`, color: 'error' })
})

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

const { workouts, error: workoutsError, promise: workoutsLoaded, deleteWorkout } = useWorkouts()
const { saveTemplate } = useWorkoutTemplates()

// --- Éditeur de séance en panneau : séance en cours reprise, ou séance modifiée ---

const workoutEditorOpen = ref(false)
const workoutEditorId = ref<string | null>(null)
const workoutEditorEditing = ref(false)

function openWorkoutEditor(workoutId: string, editing = false) {
  workoutEditorId.value = workoutId
  workoutEditorEditing.value = editing
  workoutEditorOpen.value = true
}

/** Ligne de « S'entraîner » : une séance en cours se reprend dans l'éditeur, une séance terminée s'ouvre en consultation. */
function openTodayWorkout(workout: Workout) {
  if (workout.status === 'IN_PROGRESS') openWorkoutEditor(workout.id)
  else openWorkoutDetail(workout)
}

// --- Consultation d'une séance terminée (panneau latéral), depuis « S'entraîner » ---

const workoutDetailOpen = ref(false)
const workoutDetailId = ref<string | null>(null)
const workoutDetail = computed(() => workouts.value.find(w => w.id === workoutDetailId.value) ?? null)
watch(workoutDetail, (workout) => {
  if (!workout && workoutDetailOpen.value) workoutDetailOpen.value = false
})

function openWorkoutDetail(workout: Workout) {
  workoutDetailId.value = workout.id
  workoutDetailOpen.value = true
}

/** Modifier : on ferme la consultation (et son entrée d'historique) avant d'ouvrir l'éditeur. */
async function editWorkoutFromDetail(workout: Workout) {
  workoutDetailOpen.value = false
  await nextTick()
  await afterOverlayBacks()
  openWorkoutEditor(workout.id, true)
}

async function saveWorkoutAsTemplate(workout: Workout) {
  try {
    await saveTemplate(templateInputFromWorkout(workout))
    toast.add({ title: 'Programme créé', description: `« ${workoutTitle(workout)} » se lance depuis Programmes.`, color: 'success', icon: 'i-lucide-check' })
  }
  catch (e) {
    toast.add({ title: 'Programme non créé', description: (e as Error).message, color: 'error' })
  }
}

const deletingWorkout = ref<Workout | null>(null)
const deleteWorkoutOpen = ref(false)
const deletingWorkoutBusy = ref(false)

function askDeleteWorkout(workout: Workout) {
  deletingWorkout.value = workout
  deleteWorkoutOpen.value = true
}

async function confirmDeleteWorkout() {
  if (!deletingWorkout.value) return
  deletingWorkoutBusy.value = true
  try {
    await deleteWorkout(deletingWorkout.value.id)
    deleteWorkoutOpen.value = false
    toast.add({ title: 'Séance supprimée', color: 'neutral', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    toast.add({ title: 'Séance non supprimée', description: (e as Error).message, color: 'error' })
  }
  finally {
    deletingWorkoutBusy.value = false
  }
}
watch(workoutsError, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les séances : ${error.message}`, color: 'error' })
})

const shoppingList = useShoppingList()
const { dishes, ownDishes, dishesById, saveBatchSurplus, thawMeals } = usePreparedDishes()
watch(shoppingList.items.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger la liste de courses : ${error.message}`, color: 'error' })
})

// Une erreur de chargement des repas, des pesées ou de la liste de courses (droits, index manquant...) est signalée
// par un toast ci-dessus, sans bloquer la page.
await Promise.all([
  recipes.promise.value,
  ingredients.promise.value,
  meals.promise.value.catch(() => undefined),
  upcomingMeals.promise.value.catch(() => undefined),
  weighInsLoaded.value.catch(() => undefined),
  workoutsLoaded.value.catch(() => undefined),
  shoppingList.items.promise.value.catch(() => undefined),
  profile.ready,
])

/** Séances du jour affiché, la séance en cours en tête. */
const dayWorkouts = computed(() => workouts.value
  .filter(w => differenceInCalendarDays(w.date.toDate(), selectedDay.value) === 0)
  .sort((a, b) => Number(b.status === 'IN_PROGRESS') - Number(a.status === 'IN_PROGRESS')))
/** Kcal dépensées le jour affiché ; `undefined` sans séance, `null` si aucune ne les renseigne. */
const burnedKcal = computed(() => dayWorkouts.value.length ? kcalBurnedOn(dayWorkouts.value, selectedDay.value) : undefined)

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

/**
 * Repas du jour affiché. Un repas pris dans le stock montre le commentaire actuel de son plat (modifiable depuis le
 * Stock), à défaut celui recopié au moment du choix.
 */
const dayEntries = computed(() => {
  const dayMeals = meals.value.filter(isNotPendingDelete)
  const entries = buildDayEntries(dayMeals, selectedDay.value, recipesById.value, ingredientsById.value)
  const commentsById = new Map(dishes.value.map(dish => [dish.id, dish.comment]))
  for (const list of Object.values(entries)) {
    for (const entry of list) {
      const meal = entry.storage ? dayMeals.find(m => m.id === entry.id) : undefined
      if (meal?.category !== 'STOCK' || !commentsById.has(meal.dishId)) continue
      entry.comment = commentsById.get(meal.dishId)
    }
  }
  return entries
})
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

/** "Auj.", "Hier", "Dem.", puis le jour abrégé ("Ven.") : la fenêtre ne dure que 7 jours, il n'y a pas d'ambiguïté. */
const cookingDayLabel = (day: Date) => {
  const offset = differenceInCalendarDays(day, today)
  if (offset === 0) return 'Auj.'
  if (offset === -1) return 'Hier'
  if (offset === 1) return 'Dem.'
  return capitalize(format(day, 'EEE', { locale: fr }))
}

/**
 * Récipients regroupés par jour (les repas arrivent triés, ceux d'un même jour se suivent) : le jour n'est écrit qu'une fois,
 * et l'icône du repas n'apparaît que si la recette revient à plusieurs repas ce jour-là. Ex : "Auj. ☀ 1 🌇 0,5".
 */
const cookingDays = (portions: RecipeToCookPortion[], { alwaysShowMeal = false } = {}): TodayCookingDay[] => {
  const days: { day: Date, portions: RecipeToCookPortion[] }[] = []
  for (const portion of portions) {
    const last = days.at(-1)
    if (last && differenceInCalendarDays(portion.day, last.day) === 0) last.portions.push(portion)
    else days.push({ day: portion.day, portions: [portion] })
  }

  return days.map(({ day, portions: dayPortions }) => ({
    key: String(day.getTime()),
    label: cookingDayLabel(day),
    portions: dayPortions.map((portion): TodayCookingPortion => {
      const row = alwaysShowMeal || dayPortions.length > 1 ? MENU_MEAL_TYPES.find(item => item.key === portion.mealType) : undefined
      return { key: portion.mealType, meal: row && { label: row.label, icon: row.icon }, parts: portion.parts }
    }),
  }))
}

/**
 * Recettes à cuisiner le jour affiché, en une fois pour leurs repas des 7 jours (parts cumulées). Une recette déjà cuisinée
 * dans les 6 jours précédents, même la semaine d'avant, est un reste ; les recettes supprimées depuis sont ignorées.
 */
const cookingRecipes = computed<TodayCookingRecipe[]>(() => {
  const cookDay = selectedDayKey.value
  /** Parts prévues en plus pour le stock : cuisinées avec la fournée, comptées dans ses parts. */
  const withSurplus = (recipeId: string) => {
    const dish = findBatchSurplus(ownDishes.value, recipeId, cookDay)
    const parts = dish?.batch?.surplusParts ?? 0
    return parts > PARTS_EPSILON && dish ? { parts, storage: dish.storage } : undefined
  }

  const batches = recipesToCook(upcomingMeals.value.filter(isNotPendingDelete), COOKING_DAYS).flatMap((item) => {
    const recipe = recipesById.value.get(item.recipeId)
    if (!recipe || differenceInCalendarDays(item.days[0]!, selectedDay.value) !== 0) return []
    const surplus = withSurplus(recipe.id)
    return [{
      recipeId: recipe.id,
      cookDay,
      title: recipe.title,
      persons: recipe.persons,
      imageUrl: recipe.imageUrl,
      days: cookingDays(item.portions),
      parts: item.parts + (surplus?.parts ?? 0),
      surplus,
    }]
  })

  // Surplus dont les repas des menus ont été retirés depuis : il reste à cuisiner pour le stock.
  const surplusOnly = ownDishes.value.flatMap((dish) => {
    const recipe = dish.recipeId ? recipesById.value.get(dish.recipeId) : undefined
    if (!recipe || dish.batch?.cookDay !== cookDay || batches.some(b => b.recipeId === recipe.id)) return []
    const surplus = withSurplus(recipe.id)
    if (!surplus) return []
    return [{ recipeId: recipe.id, cookDay, title: recipe.title, persons: recipe.persons, imageUrl: recipe.imageUrl, days: [], parts: surplus.parts, surplus }]
  })

  return [...batches, ...surplusOnly]
})

// --- Décongeler : plats du congélateur prévus le lendemain du jour affiché, pour tout le foyer ---

/**
 * Repas du foyer du jour affiché et du lendemain ; aucune requête pour un jour passé (ces repas-là sont mangés). Ne
 * bloque pas l'ouverture de l'accueil : la section apparaît à l'arrivée des repas.
 */
const thawMealsRange = computed(() => differenceInCalendarDays(selectedDay.value, today) < 0
  ? null
  : { start: selectedDay.value, end: addDays(selectedDay.value, 1) })
const { meals: householdMeals } = useHouseholdMealsBetween(thawMealsRange)
watch(householdMeals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas du foyer : ${error.message}`, color: 'error' })
})

const { household } = useHousehold()
const currentUser = useCurrentUser()
/** Prénom d'un autre membre du foyer, pour distinguer ses repas dans la confirmation. */
const memberNameOf = (uid: string) =>
  uid === currentUser.value?.uid ? undefined : household.value?.members.find(member => member.id === uid)?.name

const mealTypeRank = (mealType: MealType) => MENU_MEAL_TYPES.findIndex(row => row.key === mealType)

/**
 * Plats dont des repas sont encore au congélateur : ceux du lendemain du jour affiché, à sortir la veille, et, le jour
 * même seulement, ceux d'aujourd'hui (oubliés hier, en tête). Un plat passé au frigo en entier disparaît de la liste.
 */
const thawDishes = computed<TodayThawDish[]>(() => {
  const range = thawMealsRange.value
  if (!range) return []
  const firstDay = isTodaySelected.value ? range.start : range.end
  const frozen = householdMeals.value
    .filter((meal): meal is Meal & StockMealSource => meal.category === 'STOCK' && meal.storage === 'FREEZER')
    .filter(meal => differenceInCalendarDays(meal.date.toDate(), firstDay) >= 0)
    .sort((a, b) => a.date.toMillis() - b.date.toMillis() || mealTypeRank(a.mealType) - mealTypeRank(b.mealType))

  const byDish = new Map<string, (Meal & StockMealSource)[]>()
  for (const meal of frozen) byDish.set(meal.dishId, [...(byDish.get(meal.dishId) ?? []), meal])

  return [...byDish.values()].map((dishMeals): TodayThawDish => {
    const first = dishMeals[0]!
    const recipe = first.recipeId ? recipesById.value.get(first.recipeId) : undefined
    // Parts d'un même repas cumulées entre membres du foyer : un récipient par repas, comme dans « Cuisiner ».
    const portions: RecipeToCookPortion[] = []
    for (const meal of dishMeals) {
      const day = meal.date.toDate()
      const same = portions.find(p => p.mealType === meal.mealType && differenceInCalendarDays(p.day, day) === 0)
      if (same) same.parts += meal.value
      else portions.push({ day, mealType: meal.mealType, parts: meal.value })
    }
    const days = cookingDays(portions, { alwaysShowMeal: true })
      .map(day => ({ ...day, isLate: differenceInCalendarDays(new Date(Number(day.key)), today) <= 0 }))
    return {
      dishId: first.dishId,
      title: first.label,
      recipeId: recipe?.id,
      imageUrl: recipe?.imageUrl,
      days,
      parts: dishMeals.reduce((total, meal) => total + meal.value, 0),
      isLate: days.some(day => day.isLate),
      meals: dishMeals.map(meal => ({
        mealId: meal.id,
        label: `${shortDayLabel(meal.date.toDate(), today)} · ${MENU_MEAL_TYPES.find(row => row.key === meal.mealType)?.label ?? ''}`,
        parts: meal.value,
        memberName: memberNameOf(meal.user),
      })),
    }
  }).sort((a, b) => Number(b.isLate) - Number(a.isLate))
})

const thawOpen = ref(false)
const thawTarget = ref<TodayThawDish | null>(null)
const thawSaving = ref(false)

/** Parts du plat encore au congélateur, hors repas : elles peuvent sortir avec eux. */
const thawFrozenParts = computed(() => {
  const dish = thawTarget.value ? dishesById.value.get(thawTarget.value.dishId) : undefined
  return dish && dish.storage === 'FREEZER' && !isDishPlanned(dish, format(today, 'yyyy-MM-dd')) ? dish.parts : 0
})

const openThaw = (dish: TodayThawDish) => {
  thawTarget.value = dish
  thawOpen.value = true
}

const confirmThaw = async ({ mealIds, extraParts }: { mealIds: string[], extraParts: number }) => {
  const target = thawTarget.value
  if (!target) return
  const selected = householdMeals.value.filter(meal => mealIds.includes(meal.id))
  const parts = selected.reduce((total, meal) => total + (meal.category === 'STOCK' ? meal.value : 0), 0) + extraParts

  thawSaving.value = true
  try {
    await thawMeals(selected, extraParts, target.dishId)
    thawOpen.value = false
    toast.add({ title: 'Passé au frigo', description: `${formatParts(parts)} de « ${target.title} »`, color: 'success', icon: 'i-lucide-refrigerator' })
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `« ${target.title} » n'a pas pu passer au frigo : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
  } finally {
    thawSaving.value = false
  }
}

// --- Surplus pour le stock, depuis « Cuisiner » ---

const surplusOpen = ref(false)
const surplusTarget = ref<TodayCookingRecipe | null>(null)
const surplusSaving = ref(false)
const surplusDish = computed(() => {
  const target = surplusTarget.value
  return target ? findBatchSurplus(ownDishes.value, target.recipeId, target.cookDay) ?? null : null
})

const openSurplus = (recipe: TodayCookingRecipe) => {
  surplusTarget.value = recipe
  surplusOpen.value = true
}

/**
 * Reporte le surplus dans la liste de courses : mis à jour s'il y est déjà, ajouté si les repas de sa fournée y sont et
 * ne sont pas encore achetés, retiré s'il est annulé. Une fois acheté, il ne bouge plus.
 */
const syncSurplusInclusion = async (dishId: string, recipeId: string, cookDay: string, surplusParts: number) => {
  await shoppingList.inclusions.promise.value
  const mealId = `${SURPLUS_MEAL_PREFIX}${dishId}`
  const key = `recipe:${recipeId}`
  const inclusions = shoppingList.inclusions.value
  const own = inclusions.find(inclusion => inclusion.mealId === mealId)
  if (own?.state === 'bought') return

  const catalog = { recipesById: recipesById.value, ingredientsById: ingredientsById.value }
  if (surplusParts < PARTS_EPSILON) {
    if (own) await shoppingList.applyInclusions([], [own], catalog)
    return
  }
  const batchEnd = format(addDays(parseISO(cookDay), COOKING_DAYS - 1), 'yyyy-MM-dd')
  const batchInclusions = inclusions.filter(inclusion =>
    inclusion.key === key && inclusion.mealId !== mealId && inclusion.date >= cookDay && inclusion.date <= batchEnd)
  if (!own && (!batchInclusions.length || batchInclusions.some(inclusion => inclusion.state === 'bought'))) return

  await shoppingList.applyInclusions(
    [{ mealId, date: cookDay, key, recipeId, parts: surplusParts, state: 'listed' }],
    [],
    catalog,
  )
}

const saveSurplus = async ({ surplusParts, storage, comment }: { surplusParts: number, storage: DishStorage, comment: string }) => {
  const target = surplusTarget.value
  const recipe = target ? recipesById.value.get(target.recipeId) : undefined
  if (!target || !recipe) return
  const existing = surplusDish.value
  const persons = recipe.persons && recipe.persons > 0 ? recipe.persons : 1

  surplusSaving.value = true
  try {
    const dishId = await saveBatchSurplus({
      recipeId: recipe.id,
      label: recipe.title,
      // Figées à la déclaration : modifier la recette ensuite ne change pas les parts rangées.
      perPart: existing?.perPart ?? macrosForRecipe(recipe.ingredients, ingredientsById.value, persons),
      storage,
      comment,
      cookDay: target.cookDay,
      surplusParts,
    }, existing)
    surplusOpen.value = false
    const syncedId = dishId ?? existing?.id
    if (syncedId) {
      await syncSurplusInclusion(syncedId, recipe.id, target.cookDay, dishId ? surplusParts : 0).catch((error: any) => {
        toast.add({ title: 'Liste de courses non mise à jour', description: error.message || 'Une erreur est survenue.', color: 'warning' })
      })
    }
    toast.add(dishId
      ? { title: 'Surplus prévu', description: `${formatParts(surplusParts)} de « ${recipe.title} » rejoindront le stock.`, color: 'success', icon: 'i-lucide-archive' }
      : { title: 'Surplus retiré', description: `« ${recipe.title} »`, color: 'neutral', icon: 'i-lucide-archive-x' })
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `Le surplus n'a pas pu être enregistré : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
  } finally {
    surplusSaving.value = false
  }
}

/** Liste de courses ouverte directement en mode « Acheter ». */
const SHOPPING_LIST_LINK = '/dashboard/liste-courses?mode=acheter'

const categoriesStore = useIngredientCategoriesStore()
const aisleOf = (categoryId?: string) => (categoryId && categoriesStore.getCategoryById(categoryId)) || MISC_AISLE

/**
 * Articles encore à acheter (ni dans le panier, ni à la maison) dont on a besoin le jour affiché ou le lendemain, ou
 * marqués urgents à la main. Même règle que l'éclair de la liste de courses, mais au jour affiché ; rien pour un jour
 * passé, ces courses-là ne se font plus. Triés par jour de besoin (marqués sans besoin proche à la fin), puis comme la liste.
 * Les lignes affichées restent calculées au vrai aujourd'hui : leur détail dit « aujourd'hui », « demain » comme la liste.
 * Leur `isUrgent` est forcé : l'urgence est celle du jour affiché.
 */
const shoppingLines = computed<GroceryLine[]>(() => {
  if (differenceInCalendarDays(selectedDay.value, today) < 0) return []
  return shoppingList.items.value
    .filter(item => item.status === 'toBuy')
    .flatMap((item) => {
      const atSelectedDay = groceryLineFromItem(item, aisleOf, selectedDay.value)
      if (!atSelectedDay.isUrgent) return []
      const need = atSelectedDay.isDueSoon ? atSelectedDay.needs.find(n => !n.isPast) : undefined
      // Urgent au jour affiché, même si l'achat ne l'est pas encore au vrai aujourd'hui (annoncé ainsi aux lecteurs d'écran).
      return [{ line: { ...groceryLineFromItem(item, aisleOf, today), isUrgent: true }, needDate: need?.date ?? '￿' }]
    })
    .sort((a, b) => a.needDate.localeCompare(b.needDate) || compareGroceryLines(a.line, b.line))
    .map(({ line }) => line)
})

/** Détail d'un article ouvert depuis l'accueil : marquer urgent ; pour un ajout manuel, le dater ou le retirer. */
const failShopping = (label: string) => (error: any) => {
  toast.add({ title: 'Erreur', description: `« ${label} » n'a pas pu être modifié : ${error?.message || 'une erreur est survenue'}.`, color: 'error' })
}
provide(GROCERY_LINE_ACTIONS_KEY, {
  toggleUrgent: (line: GroceryLine) => {
    shoppingList.setUrgent(line.item, !line.isMarkedUrgent).catch(failShopping(line.label))
  },
  setNeededBy: (line: GroceryLine, neededBy: string) => {
    if (line.manual && (neededBy || undefined) !== line.item.neededBy) shoppingList.setNeededBy(line.item, neededBy || null).catch(failShopping(line.label))
  },
  removeManual: (line: GroceryLine) => {
    if (line.manual) shoppingList.removeManual(line.item).catch(failShopping(line.label))
  },
})

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
/** Repas modifié via la même fenêtre ; `null` = ajout d'un nouveau repas dans `addTarget`. */
const editingMeal = ref<Meal | null>(null)
const editingSource = computed(() => editingMeal.value ? mealSourceOf(editingMeal.value) : null)

const findMealSlot = (mealType: MealType) => ALL_MEAL_SLOTS.find(slot => slot.mealType === mealType) ?? null

const openAddModal = (mealType: MealType) => {
  editingMeal.value = null
  addTarget.value = findMealSlot(mealType)
  addModalOpen.value = true
}

/** Ouvre la fenêtre pré-remplie avec le contenu du repas ; son jour et son repas ne changent pas. */
const openEditModal = (entry: MenuEntry) => {
  const meal = meals.value.find(m => m.id === entry.id)
  if (!meal) return
  editingMeal.value = meal
  addTarget.value = findMealSlot(meal.mealType)
  addModalOpen.value = true
}

/** Même format court que la page Menus (« Lun. 19 · Petit déj », « Aujourd'hui », « Hier », « Demain »), pour tenir sur la ligne d'en-tête de la fenêtre. */
const addContextLabel = computed(() => {
  const target = addTarget.value
  if (!target) return ''
  const day = shortDayLabel(selectedDay.value, today)
  const meal = MENU_MEAL_TYPES.find(m => m.key === target.mealType)?.label ?? target.label
  return `${day} · ${meal}`
})

/** Contenu du jour affiché (hors repas modifié) et objectifs, pour le filtre « Dans mes objectifs » ; aucun pour la ligne « Non compté ». */
const addDayBudget = computed(() => {
  if (!addTarget.value || addTarget.value.mealType === UNCOUNTED_MEAL_KEY) return null
  return { consumed: consumedOfDay(dayEntries.value, editingMeal.value?.id), targets: DAILY_TARGETS }
})

const submitAddedMeal = async (source: MealSource) => {
  const meal = editingMeal.value
  if (!meal && !addTarget.value) return
  try {
    if (meal) await updateMealSource(meal, source)
    else await addMeal({ date: selectedDay.value, mealType: addTarget.value!.mealType, source })
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: `Le repas n'a pas pu être ${meal ? 'modifié' : 'enregistré'} : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  }
}

// --- Mettre au stock un repas d'une recette ---

const sendToStock = useSendToStock(() => upcomingMeals.value)
const openSendToStock = (entry: MenuEntry) => sendToStock.open(meals.value.find(m => m.id === entry.id))

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
const isOverlayOpen = computed(() => addModalOpen.value || recipeDetailOpen.value || ingredientDetailOpen.value || surplusOpen.value || thawOpen.value || sendToStock.isOpen.value)

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
      <!--
        `shrink-0` : `min-h-full` remplace le `min-height: auto` d'un élément flex ; sans lui, le bloc se réduirait à la
        hauteur du panneau, le contenu déborderait et la marge du bas ne serait plus en bas.
      -->
      <div
        class="flex min-h-full shrink-0 flex-col gap-6 overflow-x-clip p-4 sm:p-6"
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
              :burned-kcal="burnedKcal"
              show-burned
              :pending="isFutureSelected"
            />

            <template v-if="shoppingLines.length">
              <div class="flex items-center justify-between gap-3">
                <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                  <UIcon name="i-lucide-shopping-cart" class="size-5 text-primary" aria-hidden="true" />
                  Faire les courses
                </h2>
                <NuxtLink :to="SHOPPING_LIST_LINK" class="text-sm font-medium text-primary hover:underline">
                  Voir liste
                </NuxtLink>
              </div>

              <TodayShopping :lines="shoppingLines":to="SHOPPING_LIST_LINK" />
            </template>

            <template v-if="thawDishes.length">
              <div class="flex items-center justify-between gap-3">
                <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                  <UIcon name="i-lucide-snowflake" class="size-5 text-primary" aria-hidden="true" />
                  Décongeler
                </h2>
                <NuxtLink to="/dashboard/stock" class="text-sm font-medium text-primary hover:underline">
                  Stock
                </NuxtLink>
              </div>

              <TodayThawing :dishes="thawDishes" @open="openRecipeDetail" @thaw="openThaw" />
            </template>

            <div class="flex items-center justify-between gap-3">
              <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                <UIcon name="i-lucide-chef-hat" class="size-5 text-primary" aria-hidden="true" />
                Cuisiner
              </h2>
              <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
                Plus
              </NuxtLink>
            </div>

            <TodayCooking :recipes="cookingRecipes" :is-today="isTodaySelected" @open="openRecipeDetail" @surplus="openSurplus" />

            <div class="flex items-center justify-between gap-3">
              <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                <UIcon name="i-lucide-utensils" class="size-5 text-primary" aria-hidden="true" />
                Manger
              </h2>
              <NuxtLink to="/dashboard/menus" class="text-sm font-medium text-primary hover:underline">
                Plus
              </NuxtLink>
            </div>

            <TodayMeals :rows="mealRows" :secondary-rows="secondaryMealRows" @add="openAddModal" @open="openEntryDetail" @edit="openEditModal" @delete="deleteEntry" @stock="openSendToStock" />

            <template v-if="dayWorkouts.length">
              <div class="flex items-center justify-between gap-3">
                <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                  <UIcon name="i-lucide-dumbbell" class="size-5 text-primary" aria-hidden="true" />
                  S'entraîner
                </h2>
                <NuxtLink to="/dashboard/seances" class="text-sm font-medium text-primary hover:underline">
                  Plus
                </NuxtLink>
              </div>

              <TodayWorkouts :workouts="dayWorkouts" @open="openTodayWorkout" />
            </template>
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
    :day-key="selectedDayKey"
    :initial-source="editingSource"
    :day-budget="addDayBudget"
    @submit="submitAddedMeal"
  />

  <BatchSurplusModal
    v-model:open="surplusOpen"
    :title="surplusTarget?.title ?? ''"
    :cook-day="surplusTarget?.cookDay ?? selectedDayKey"
    :planned-parts="surplusTarget ? surplusTarget.parts - (surplusTarget.surplus?.parts ?? 0) : 0"
    :recipe-persons="surplusTarget ? recipesById.get(surplusTarget.recipeId)?.persons : undefined"
    :dish="surplusDish"
    :saving="surplusSaving"
    @save="saveSurplus"
  />

  <ThawDishModal
    v-model:open="thawOpen"
    :dish="thawTarget"
    :frozen-parts="thawFrozenParts"
    :saving="thawSaving"
    @confirm="confirmThaw"
  />

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
    v-model:open="recipeDetailOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
    :parts="selectedRecipeParts"
  />

  <IngredientDetailSlideover v-model:open="ingredientDetailOpen" :ingredient="selectedIngredient" />

  <WorkoutEditorSlideover
    v-model:open="workoutEditorOpen"
    :workout-id="workoutEditorId"
    :editing="workoutEditorEditing"
  />

  <WorkoutDetailSlideover
    v-model:open="workoutDetailOpen"
    :workout="workoutDetail"
    :workouts="workouts"
    @edit="editWorkoutFromDetail"
    @delete="askDeleteWorkout"
    @save-as-template="saveWorkoutAsTemplate"
  />

  <ConfirmDialog
    v-model:open="deleteWorkoutOpen"
    :title="deletingWorkout ? `Supprimer « ${workoutTitle(deletingWorkout)} » ?` : 'Supprimer la séance ?'"
    description="Ses exercices et ses séries seront supprimés définitivement."
    confirm-label="Supprimer"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    :loading="deletingWorkoutBusy"
    @confirm="confirmDeleteWorkout"
  />
</template>
