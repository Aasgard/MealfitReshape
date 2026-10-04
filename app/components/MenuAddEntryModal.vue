<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import type { MealSource } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { buildIngredientDraft, buildManualDraft, buildRecipeDraft, type MenuEntryDraft } from '~/utils/menuEntries'
import { gramsForUnit } from '~/utils/ingredientNutrition'
import { parseNonNegativeNumber, parsePositiveNumber } from '~/utils/numberInput'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'
import { DAILY_TARGET_TOLERANCE, type DailyTargets } from '~/utils/dailyTargets'
import { matchesSearch } from '~/utils/search'
import { isIngredientInSeason } from '~/utils/ingredientSeason'

/**
 * Modale d'ajout d'un repas dans une case du calendrier (jour + type de repas, fixés par le parent) :
 * une recette de la base (en nombre de parts), un ingrédient de la base (en grammes ou en unité),
 * ou des macros brutes avec un libellé. Émet un `MealSource` ; le parent l'enregistre dans la case.
 * Avec `initialSource`, la modale sert à modifier ce repas : elle s'ouvre pré-remplie.
 */
const props = defineProps<{
  recipes: Recipe[]
  ingredients: Ingredient[]
  ingredientsById: Map<string, Ingredient>
  /** Case visée, ex : "Lun. 14 · Petit déj". */
  contextLabel: string
  /** Repas à modifier ; absent = ajout d'un nouveau repas. */
  initialSource?: MealSource | null
  /**
   * Ce que la journée contient déjà (hors repas modifié, hors « Non compté ») et ses objectifs, pour le filtre
   * « Dans mes objectifs ». Absent = filtre non proposé (ex. ajout dans « Non compté », qui ne compte pas).
   */
  dayBudget?: { consumed: DailyTargets, targets: DailyTargets } | null
}>()

const isEditMode = computed(() => !!props.initialSource)

const emit = defineEmits<{
  submit: [source: MealSource]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const ingredientCategoriesStore = useIngredientCategoriesStore()

type Mode = 'recipe' | 'ingredient' | 'macros'

const tabs = [
  { value: 'recipe', label: 'Recette', icon: 'i-lucide-chef-hat' },
  { value: 'ingredient', label: 'Aliment', icon: 'i-lucide-carrot' },
  { value: 'macros', label: 'Macros', icon: 'i-lucide-calculator' },
]

/** Sentinelle de l'option « Grammes » (USelectMenu réserve la chaîne vide à « aucune sélection »). */
const GRAMS_UNIT = '__grams__'

const mode = ref<Mode>('recipe')

/**
 * Balayage horizontal (mobile) : vers la gauche passe à l'onglet suivant (Recette → Aliment → Macros),
 * vers la droite au précédent. Mêmes seuils que le changement de jour de l'accueil.
 */
const MODE_ORDER: Mode[] = ['recipe', 'ingredient', 'macros']
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
  // Un geste surtout vertical est un défilement (liste des recettes), pas un changement d'onglet.
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return
  const next = MODE_ORDER[MODE_ORDER.indexOf(mode.value) + (dx < 0 ? 1 : -1)]
  if (next) mode.value = next
}
const submitted = ref(false)

const recipeTypeFilterOptions = RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t) }))

/** Filtres cumulatifs de la liste des recettes : l'un des types choisis, et tous les ingrédients choisis. Vides = pas de filtre. */
const recipeTypeFilter = ref<RecipeType[]>([])
const recipeIngredientFilter = ref<string[]>([])
/** Objectifs du jour vérifiés par le filtre « Dans mes objectifs » (un bouton chacun, tous actifs par défaut). */
type TargetKey = 'calories' | 'carbohydrates' | 'protein' | 'fat'
const TARGET_FILTERS: { key: TargetKey, short: string, unit: string, label: string }[] = [
  { key: 'calories', short: 'Cal', unit: 'kcal', label: 'Calories' },
  { key: 'carbohydrates', short: 'G', unit: 'g', label: 'Glucides' },
  { key: 'protein', short: 'P', unit: 'g', label: 'Protéines' },
  { key: 'fat', short: 'L', unit: 'g', label: 'Lipides' },
]
const ALL_TARGET_KEYS = TARGET_FILTERS.map(t => t.key)
/** Masque les recettes qui, au nombre de parts choisi, feraient dépasser l'un des objectifs actifs. */
const activeTargets = ref<TargetKey[]>([...ALL_TARGET_KEYS])
const recipeId = ref<string | undefined>(undefined)
/**
 * Lignes de la liste : un clic choisit la recette ; un appui prolongé (ou un clic droit, ou Maj+Entrée au clavier)
 * ouvre sa fiche sans changer le choix.
 */
const recipeDetailOpen = ref(false)
const viewedRecipeId = ref<string | undefined>(undefined)
const viewedRecipe = computed(() => props.recipes.find(r => r.id === viewedRecipeId.value) ?? null)
const viewRecipe = (id: string) => {
  viewedRecipeId.value = id
  recipeDetailOpen.value = true
}

const LONG_PRESS_MS = 500
/** Au-delà de ce déplacement (px), l'appui est un défilement de la liste, pas un appui prolongé. */
const LONG_PRESS_MOVE_TOLERANCE = 10
let pressTimer: ReturnType<typeof setTimeout> | undefined
let pressStart: { x: number, y: number } | null = null
/** Vrai quand l'appui en cours a déjà ouvert la fiche : le clic qui suit ne doit pas choisir la recette. */
let longPressFired = false

const cancelPress = () => {
  clearTimeout(pressTimer)
  pressTimer = undefined
  pressStart = null
}
const onRowPointerDown = (id: string, event: PointerEvent) => {
  if (event.button !== 0) return
  cancelPress()
  longPressFired = false
  pressStart = { x: event.clientX, y: event.clientY }
  pressTimer = setTimeout(() => {
    longPressFired = true
    pressTimer = undefined
    viewRecipe(id)
  }, LONG_PRESS_MS)
}
const onRowPointerMove = (event: PointerEvent) => {
  if (!pressStart) return
  if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > LONG_PRESS_MOVE_TOLERANCE) cancelPress()
}
const onRowClick = (id: string) => {
  if (longPressFired) {
    longPressFired = false
    return
  }
  recipeId.value = id
}
/** Clic droit (et appui prolongé sur Android, qui déclenche aussi `contextmenu`) : ouvre la fiche, une seule fois. */
const onRowContextMenu = (id: string) => {
  cancelPress()
  if (longPressFired) return
  longPressFired = true
  viewRecipe(id)
}
onBeforeUnmount(cancelPress)
/** Bloc des filtres de recettes, repliable ; ouvert à chaque ouverture de la modale. */
const filtersOpen = ref(true)
/** Filtre de saison (actif par défaut) : masque les recettes contenant au moins un aliment hors saison. */
const seasonOnly = ref(true)
/** Recherche textuelle dans les titres de recettes : filtre la liste affichée, sans désélectionner la recette choisie. */
const recipeSearch = ref('')
/** Parts mangées, par demi-part (minimum une demi-part). */
const PARTS_STEP = 0.5
const parts = ref(1)
const stepParts = (direction: 1 | -1) => {
  parts.value = Math.max(PARTS_STEP, parts.value + direction * PARTS_STEP)
}

const INGREDIENT_CATEGORY_FILTER_ALL = 'ALL'
const ingredientCategoryFilterOptions = computed(() => [
  { value: INGREDIENT_CATEGORY_FILTER_ALL, label: 'Toutes les catégories' },
  ...ingredientCategoriesStore.categories.map(c => ({ value: c.id, label: c.label })),
])

const ingredientCategoryFilter = ref(INGREDIENT_CATEGORY_FILTER_ALL)
const ingredientId = ref<string | undefined>(undefined)
const unit = ref(GRAMS_UNIT)
const quantity = ref('100')

const label = ref('')
const kcal = ref('')
const protein = ref('')
const fat = ref('')
const carbohydrates = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  mode.value = 'recipe'
  submitted.value = false
  recipeTypeFilter.value = []
  recipeIngredientFilter.value = []
  activeTargets.value = [...ALL_TARGET_KEYS]
  recipeId.value = undefined
  recipeSearch.value = ''
  seasonOnly.value = true
  filtersOpen.value = true
  parts.value = 1
  ingredientCategoryFilter.value = INGREDIENT_CATEGORY_FILTER_ALL
  ingredientId.value = undefined
  unit.value = GRAMS_UNIT
  quantity.value = '100'
  label.value = ''
  kcal.value = ''
  protein.value = ''
  fat.value = ''
  carbohydrates.value = ''

  const source = props.initialSource
  if (source?.category === 'RECIPE') {
    recipeId.value = source.recipeId
    parts.value = source.value
  } else if (source?.category === 'INGREDIENT') {
    mode.value = 'ingredient'
    ingredientId.value = source.ingredientId
    unit.value = source.unitId ?? GRAMS_UNIT
    quantity.value = String(source.quantity)
  } else if (source?.category === 'RAW') {
    mode.value = 'macros'
    label.value = source.label
    kcal.value = String(source.calories)
    protein.value = String(source.protein)
    fat.value = String(source.fat)
    carbohydrates.value = String(source.carbohydrates)
  }
})

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'fr')

/** Ingrédients présents dans au moins une recette, pour ne proposer que des filtres utiles. */
const recipeIngredientFilterOptions = computed(() => {
  const usedIds = new Set(props.recipes.flatMap(r => (r.ingredients ?? []).map(line => line.ingredientRef?.id)))
  return [...usedIds]
    .map(id => id ? props.ingredientsById.get(id) : undefined)
    .filter((i): i is Ingredient => !!i)
    .map(i => ({ id: i.id, label: i.label }))
    .sort(byLabel)
})

/** Reste disponible avant chaque objectif du jour (négatif = déjà dépassé) ; `null` sans budget. */
const remaining = computed(() => {
  const budget = props.dayBudget
  if (!budget) return null
  return {
    calories: budget.targets.calories - budget.consumed.calories,
    carbohydrates: budget.targets.carbohydrates - budget.consumed.carbohydrates,
    protein: budget.targets.protein - budget.consumed.protein,
    fat: budget.targets.fat - budget.consumed.fat,
  }
})

/**
 * Place d'une recette (au nombre de parts choisi) par rapport aux objectifs actifs :
 * - `fits` : elle tient dans ce qui reste de chaque objectif ;
 * - `slightlyOver` : elle en dépasse au moins un, mais de 5 % de l'objectif du jour au plus (DAILY_TARGET_TOLERANCE,
 *   la marge où la journée compte encore comme « atteinte ») : affichée, sur fond orange clair ;
 * - `over` : elle dépasse un objectif de plus de 5 % : masquée.
 */
type TargetFit = 'fits' | 'slightlyOver' | 'over'
const targetFit = (recipe: Recipe): TargetFit => {
  const left = remaining.value
  const budget = props.dayBudget
  if (!left || !budget || !activeTargets.value.length) return 'fits'
  const draft = buildRecipeDraft(recipe, parts.value, props.ingredientsById)
  const added: Record<TargetKey, number> = { calories: draft.kcal, carbohydrates: draft.carbohydrates, protein: draft.protein, fat: draft.fat }
  let fit: TargetFit = 'fits'
  for (const key of activeTargets.value) {
    if (added[key] <= left[key]) continue
    if (added[key] > left[key] + budget.targets[key] * DAILY_TARGET_TOLERANCE) return 'over'
    fit = 'slightlyOver'
  }
  return fit
}
const fitsRemaining = (recipe: Recipe) => targetFit(recipe) !== 'over'

/**
 * Vrai si aucun aliment de la recette n'est hors saison ce mois-ci. Un aliment sans mois renseignés, ou introuvable,
 * ne compte pas comme hors saison : faute d'information, il n'écarte pas la recette.
 */
const isRecipeInSeason = (recipe: Recipe) =>
  (recipe.ingredients ?? []).every((line) => {
    const ingredient = line.ingredientRef ? props.ingredientsById.get(line.ingredientRef.id) : undefined
    if (!ingredient?.activeMonths?.length) return true
    return isIngredientInSeason(ingredient)
  })

const matchesRecipeFilters = (recipe: Recipe) => {
  if (recipeTypeFilter.value.length && !(recipe.type && recipeTypeFilter.value.includes(recipe.type))) return false
  if (seasonOnly.value && !isRecipeInSeason(recipe)) return false
  if (!fitsRemaining(recipe)) return false
  if (!recipeIngredientFilter.value.length) return true
  const recipeIngredientIds = new Set((recipe.ingredients ?? []).map(line => line.ingredientRef?.id))
  return recipeIngredientFilter.value.every(id => recipeIngredientIds.has(id))
}

/** Écart à l'état par défaut (aucun type ni ingrédient, saison et objectifs actifs) : « Réinitialiser » y revient. */
const hasRecipeFilters = computed(() =>
  recipeTypeFilter.value.length > 0
  || recipeIngredientFilter.value.length > 0
  || !seasonOnly.value
  || (!!props.dayBudget && activeTargets.value.length !== ALL_TARGET_KEYS.length)
)

const toggleTarget = (key: TargetKey) => {
  activeTargets.value = activeTargets.value.includes(key)
    ? activeTargets.value.filter(k => k !== key)
    : [...activeTargets.value, key]
  onRecipeFilterChange()
}

/** Reste affiché dans chaque bouton (0 si déjà dépassé, signalé par une icône d'alerte). */
const remainingOf = (key: TargetKey) => Math.max(0, Math.round(remaining.value?.[key] ?? 0))
const isExceeded = (key: TargetKey) => (remaining.value?.[key] ?? 0) < 0

/** Chaque recette avec ses kcal et sa répartition des macros pour une part, affichées en fin de ligne. */
const recipeOptions = computed(() =>
  props.recipes
    .filter(matchesRecipeFilters)
    .filter(r => matchesSearch(r.title, recipeSearch.value))
    .map((r) => {
      const { kcal, carbohydrates, protein, fat } = buildRecipeDraft(r, 1, props.ingredientsById)
      const hasMacros = kcal > 0 || carbohydrates > 0 || protein > 0 || fat > 0
      return {
        id: r.id,
        label: r.title,
        typeLabel: r.type ? recipeTypeLabel(r.type) : null,
        prepTime: r.prepTime ?? null,
        cookTime: r.cookTime ?? null,
        kcal,
        macros: hasMacros ? { carbohydrates, protein, fat } : null,
        slightlyOver: targetFit(r) === 'slightlyOver',
      }
    })
    .sort(byLabel)
)

/** Temps affichés sur chaque ligne, avec les icônes de la vue liste des recettes. */
const RECIPE_TIMES = [
  { key: 'prepTime', icon: 'i-lucide-clock', label: 'Préparation' },
  { key: 'cookTime', icon: 'i-lucide-cooking-pot', label: 'Cuisson' },
] as const
const RECIPE_MACROS = [
  { key: 'carbohydrates', short: 'G', label: 'Glucides', dot: 'bg-green-500' },
  { key: 'protein', short: 'P', label: 'Protéines', dot: 'bg-red-700' },
  { key: 'fat', short: 'L', label: 'Lipides', dot: 'bg-amber-500' },
] as const

/** Les filtres réduisent la liste ; une recette déjà choisie qui n'y correspond plus est désélectionnée. */
const onRecipeFilterChange = () => {
  if (!selectedRecipe.value || matchesRecipeFilters(selectedRecipe.value)) return
  recipeId.value = undefined
}

const toggleRecipeTypeFilter = (type: RecipeType) => {
  recipeTypeFilter.value = recipeTypeFilter.value.includes(type)
    ? recipeTypeFilter.value.filter(t => t !== type)
    : [...recipeTypeFilter.value, type]
  onRecipeFilterChange()
}

const resetRecipeFilters = () => {
  recipeTypeFilter.value = []
  recipeIngredientFilter.value = []
  activeTargets.value = [...ALL_TARGET_KEYS]
  seasonOnly.value = true
}

const toggleSeasonOnly = () => {
  seasonOnly.value = !seasonOnly.value
  onRecipeFilterChange()
}

/**
 * Seuls les ingrédients avec valeurs nutritionnelles sont proposés : sans elles, aucun macro n'est calculable.
 * Leurs kcal pour 100 g et leur répartition des macros sont affichées en fin de ligne.
 */
const ingredientOptions = computed(() =>
  props.ingredients
    .filter(i => i.valuesBy100 && (ingredientCategoryFilter.value === INGREDIENT_CATEGORY_FILTER_ALL || i.category?.id === ingredientCategoryFilter.value))
    .map((i) => {
      const { calories, carbohydrates, protein, fat } = i.valuesBy100!
      return { id: i.id, label: i.label, kcalLabel: `${Math.round(calories)} kcal`, macros: { carbohydrates, protein, fat } }
    })
    .sort(byLabel)
)

/** La catégorie filtre la liste ; un aliment déjà choisi qui n'y correspond plus est désélectionné. */
const onIngredientCategoryFilterChange = () => {
  if (!selectedIngredient.value || selectedIngredient.value.category?.id === ingredientCategoryFilter.value || ingredientCategoryFilter.value === INGREDIENT_CATEGORY_FILTER_ALL) return
  ingredientId.value = undefined
}

const selectedRecipe = computed(() => props.recipes.find(r => r.id === recipeId.value))
const selectedIngredient = computed(() => ingredientId.value ? props.ingredientsById.get(ingredientId.value) : undefined)

const unitOptions = computed(() => {
  const options = [{ value: GRAMS_UNIT, label: 'Grammes (g)' }]
  const ingredient = selectedIngredient.value
  for (const [key, u] of Object.entries(ingredient?.units ?? {})) {
    // Une unité en ml sans densité ne se convertit pas en grammes : inutilisable pour les macros.
    if (gramsForUnit(ingredient!, key) == null) continue
    options.push({ value: key, label: `${u.label} (${u.value} ${u.unit})` })
  }
  return options
})

/** Grammes par défaut (100 g, base des valeurs nutritionnelles) ; 1 pour une unité (« 1 tranche »). */
const onIngredientChange = () => {
  unit.value = GRAMS_UNIT
  quantity.value = '100'
}
const onUnitChange = () => {
  quantity.value = unit.value === GRAMS_UNIT ? '100' : '1'
}

const quantityValue = computed(() => parsePositiveNumber(quantity.value))

/** Macro optionnelle : vide = 0, sinon un nombre positif ou nul. */
const macroValue = (raw: string) => raw.trim() ? parseNonNegativeNumber(raw) : 0

const manualMacros = computed(() => {
  const values = {
    calories: parseNonNegativeNumber(kcal.value),
    protein: macroValue(protein.value),
    fat: macroValue(fat.value),
    carbohydrates: macroValue(carbohydrates.value),
  }
  return Object.values(values).some(v => v === null) ? null : values as { calories: number, protein: number, fat: number, carbohydrates: number }
})

/** Ce qui est enregistré selon l'onglet actif, `null` tant que le formulaire est incomplet ou invalide. */
const mealSource = computed<MealSource | null>(() => {
  if (mode.value === 'recipe') {
    if (!recipeId.value || !parts.value) return null
    return { category: 'RECIPE', recipeId: recipeId.value, value: parts.value }
  }
  if (mode.value === 'ingredient') {
    if (!ingredientId.value || quantityValue.value === null) return null
    return {
      category: 'INGREDIENT',
      ingredientId: ingredientId.value,
      unitId: unit.value === GRAMS_UNIT ? null : unit.value,
      quantity: quantityValue.value,
    }
  }
  if (!label.value.trim() || !manualMacros.value) return null
  return { category: 'RAW', label: label.value.trim(), ...manualMacros.value }
})

/** Aperçu (kcal et macros) de ce qui sera ajouté ; `null` si le formulaire est incomplet ou si les macros ne sont pas calculables. */
const draft = computed<MenuEntryDraft | null>(() => {
  if (mode.value === 'recipe') {
    if (!selectedRecipe.value || !parts.value) return null
    return buildRecipeDraft(selectedRecipe.value, parts.value, props.ingredientsById)
  }
  if (mode.value === 'ingredient') {
    if (!selectedIngredient.value || quantityValue.value === null) return null
    return buildIngredientDraft(selectedIngredient.value, unit.value === GRAMS_UNIT ? null : unit.value, quantityValue.value)
  }
  if (!label.value.trim() || !manualMacros.value) return null
  return buildManualDraft(label.value.trim(), manualMacros.value)
})

const numberError = (raw: string, parse: (v: string) => number | null, required: boolean) => {
  if (!submitted.value) return undefined
  if (!raw.trim()) return required ? 'Requis' : undefined
  return parse(raw) === null ? 'Nombre invalide' : undefined
}

const recipeError = computed(() => submitted.value && !recipeId.value ? 'Requis' : undefined)
const ingredientError = computed(() => submitted.value && !ingredientId.value ? 'Requis' : undefined)
const quantityError = computed(() => numberError(quantity.value, parsePositiveNumber, true))
const labelError = computed(() => submitted.value && !label.value.trim() ? 'Requis' : undefined)
const kcalError = computed(() => numberError(kcal.value, parseNonNegativeNumber, true))
const proteinError = computed(() => numberError(protein.value, parseNonNegativeNumber, false))
const fatError = computed(() => numberError(fat.value, parseNonNegativeNumber, false))
const carbohydratesError = computed(() => numberError(carbohydrates.value, parseNonNegativeNumber, false))

const closeSlideover = () => {
  open.value = false
}

const onSubmit = () => {
  submitted.value = true
  if (!mealSource.value || !draft.value) return
  emit('submit', mealSource.value)
  closeSlideover()
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="isEditMode ? 'Modifier le repas' : 'Ajouter un repas'"
    :description="contextLabel"
    :ui="{
      content: 'sm:max-w-md',
      body: mode === 'recipe' ? 'flex flex-col overflow-hidden' : 'flex flex-col',
    }"
  >
    <template #body>
      <!-- En mode Recette, le corps ne défile pas : la liste des recettes prend la hauteur restante et défile seule. -->
      <!-- Toujours sur toute la hauteur du corps : le balayage entre onglets marche aussi dans la zone vide sous les champs. -->
      <div
        class="flex-1 flex flex-col gap-5"
        :class="mode === 'recipe' && 'min-h-0'"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <UTabs
          v-model="mode"
          :items="tabs"
          :content="false"
          variant="pill"
          size="sm"
          class="w-full"
        />

        <template v-if="mode === 'recipe'">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3">
              <!-- En-tête cliquable : replie ou déplie le bloc des filtres (ouvert par défaut). -->
              <button
                type="button"
                class="flex items-center gap-1 text-sm font-medium text-default rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                :aria-expanded="filtersOpen"
                aria-controls="recipe-filters"
                @click="filtersOpen = !filtersOpen"
              >
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform" :class="!filtersOpen && '-rotate-90'" aria-hidden="true" />
                Filtres
              </button>
              <UTooltip v-if="hasRecipeFilters" text="Réinitialiser les filtres">
                <UButton
                  icon="i-lucide-funnel-x"
                  aria-label="Réinitialiser les filtres"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="resetRecipeFilters"
                />
              </UTooltip>
            </div>
            <div v-show="filtersOpen" id="recipe-filters" class="flex flex-col gap-3">
              <!--
                Objectifs du jour puis types de plat, dans une même grille : une colonne d'icônes (cible, repas, ingrédient),
                puis 4 colonnes qui prennent chacune la largeur de leur bouton le plus large (puis partagent le reste),
                pour que les deux rangées s'alignent verticalement. En mobile, boutons plus compacts pour tenir sur 343 px.
              -->
              <div class="grid grid-cols-[max-content_repeat(4,minmax(max-content,1fr))] gap-1 rounded-lg bg-elevated p-1">
                <!-- Un bouton par objectif, tous actifs par défaut ; chacun affiche ce qui reste dans la journée. -->
                <div v-if="dayBudget" role="group" aria-label="Rester dans les objectifs du jour" class="col-span-5 grid grid-cols-subgrid">
                  <span class="flex items-center justify-center px-0.5 text-muted" title="Cible"><UIcon name="i-lucide-crosshair" class="size-4" aria-hidden="true" /></span>
                  <UButton
                    v-for="target in TARGET_FILTERS"
                    :key="target.key"
                    :color="activeTargets.includes(target.key) ? 'primary' : 'neutral'"
                    :variant="activeTargets.includes(target.key) ? 'solid' : 'outline'"
                    size="xs"
                    :aria-pressed="activeTargets.includes(target.key)"
                    :aria-label="`${target.label} : reste ${remainingOf(target.key)} ${target.unit}${isExceeded(target.key) ? ', objectif déjà dépassé' : ''}`"
                    class="h-8 justify-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 text-[10px] sm:text-xs tabular-nums whitespace-nowrap"
                    @click="toggleTarget(target.key)"
                  >
                    <!-- « cible + macro : reste unité » ; la cible devient une alerte quand l'objectif est déjà dépassé. -->
                    <UIcon :name="isExceeded(target.key) ? 'i-lucide-triangle-alert' : 'i-lucide-target'" class="size-3 shrink-0" :class="isExceeded(target.key) && 'text-warning'" aria-hidden="true" />
                    <span>{{ target.short }} : {{ remainingOf(target.key) }} {{ target.unit }}</span>
                  </UButton>
                </div>
                <!-- Plusieurs types peuvent être actifs à la fois. -->
                <div role="group" aria-label="Filtrer par type de plat" class="col-span-5 grid grid-cols-subgrid">
                  <span class="flex items-center justify-center px-0.5 text-muted" title="Repas"><UIcon name="i-lucide-utensils" class="size-4" aria-hidden="true" /></span>
                  <UButton
                    v-for="option in recipeTypeFilterOptions"
                    :key="option.value"
                    :label="option.label"
                    :color="recipeTypeFilter.includes(option.value) ? 'primary' : 'neutral'"
                    :variant="recipeTypeFilter.includes(option.value) ? 'solid' : 'outline'"
                    size="xs"
                    :aria-pressed="recipeTypeFilter.includes(option.value)"
                    class="h-8 justify-center px-1 sm:px-1.5 text-[10px] sm:text-xs whitespace-nowrap"
                    @click="toggleRecipeTypeFilter(option.value)"
                  />
                </div>
                <!-- Ingrédients et saison : l'icône dans la colonne des libellés, le champ et la saison alignés sur les 4 colonnes de boutons. -->
                <div class="col-span-5 grid grid-cols-subgrid">
                  <span class="flex items-center justify-center px-0.5 text-muted" title="Ingrédient"><UIcon name="i-lucide-carrot" class="size-4" aria-hidden="true" /></span>
                  <div class="col-span-4 flex items-center gap-1">
                    <USelectMenu
                      v-model="recipeIngredientFilter"
                      :items="recipeIngredientFilterOptions"
                      value-key="id"
                      multiple
                      placeholder="Tous les ingrédients"
                      :search-input="{ placeholder: 'Rechercher un ingrédient...' }"
                      aria-label="Filtrer par ingrédient"
                      class="flex-1 min-w-0"
                      @update:model-value="onRecipeFilterChange"
                    />
                    <!-- Saison, actif par défaut : même bouton que sur la page Ingrédients. -->
                    <UTooltip text="Uniquement les recettes de saison">
                      <UButton
                        :color="seasonOnly ? 'primary' : 'neutral'"
                        :variant="seasonOnly ? 'solid' : 'outline'"
                        icon="i-lucide-leaf"
                        aria-label="Uniquement les recettes sans aliment hors saison"
                        :aria-pressed="seasonOnly"
                        @click="toggleSeasonOnly"
                      />
                    </UTooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <UFormField
            label="Recette"
            :error="recipeError"
            :hint="`${recipeOptions.length} recette${recipeOptions.length > 1 ? 's' : ''}`"
            :ui="{ root: 'flex-1 min-h-0 flex flex-col', container: 'flex-1 min-h-0 flex flex-col' }"
          >
            <!-- Recherche textuelle seule (pas de liste déroulante), puis les résultats en liste, comme la vue liste des recettes. -->
            <div class="flex-1 min-h-0 flex flex-col gap-2">
              <UInput
                v-model="recipeSearch"
                icon="i-lucide-search"
                placeholder="Rechercher une recette..."
                aria-label="Rechercher une recette"
                size="md"
                variant="outline"
                class="w-full"
              />
              <div
                role="radiogroup"
                aria-label="Recettes"
                class="flex-1 min-h-32 overflow-y-auto overscroll-contain rounded-lg border border-default divide-y divide-default"
              >
                <button
                  v-for="option in recipeOptions"
                  :key="option.id"
                  type="button"
                  role="radio"
                  :aria-checked="recipeId === option.id"
                  class="w-full flex flex-col gap-1 px-3 py-2 text-left select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  :class="recipeId === option.id ? 'bg-primary/10' : option.slightlyOver ? 'bg-warning/10 hover:bg-warning/15' : 'hover:bg-elevated/60'"
                  :aria-describedby="'recipe-row-hint'"
                  style="-webkit-touch-callout: none"
                  @click="onRowClick(option.id)"
                  @pointerdown="onRowPointerDown(option.id, $event)"
                  @pointermove="onRowPointerMove"
                  @pointerup="cancelPress"
                  @pointerleave="cancelPress"
                  @pointercancel="cancelPress"
                  @contextmenu.prevent="onRowContextMenu(option.id)"
                  @keydown.enter.shift.prevent="viewRecipe(option.id)"
                >
                  <span class="flex items-center gap-2 min-w-0">
                    <span class="truncate text-sm font-medium" :class="recipeId === option.id ? 'text-primary' : 'text-highlighted'">{{ option.label }}</span>
                    <span v-if="option.slightlyOver" class="sr-only">, dépasse légèrement un objectif du jour</span>
                    <span v-if="option.macros" class="ml-auto flex items-center gap-1.5 shrink-0">
                      <span class="text-sm font-semibold text-highlighted tabular-nums">{{ option.kcal }}</span>
                      <span class="text-xs text-dimmed">kcal</span>
                      <MacroPie v-bind="option.macros" size-class="size-4" />
                    </span>
                  </span>
                  <span class="flex items-center gap-3 min-w-0 text-xs">
                    <span class="flex items-center gap-1.5 min-w-0 text-muted">
                      <span v-if="option.typeLabel" class="truncate">{{ option.typeLabel }}</span>
                      <template v-if="option.prepTime != null || option.cookTime != null">
                        <span v-if="option.typeLabel" aria-hidden="true" class="text-dimmed">·</span>
                        <template v-for="time in RECIPE_TIMES" :key="time.key">
                          <span v-if="option[time.key] != null" class="flex items-center gap-0.5 shrink-0 tabular-nums">
                            <UIcon :name="time.icon" class="size-3 shrink-0" aria-hidden="true" />
                            <span class="sr-only">{{ time.label }}</span>
                            {{ option[time.key] }} min
                          </span>
                        </template>
                      </template>
                    </span>
                    <span class="ml-auto flex items-center gap-2 shrink-0 text-muted">
                      <template v-if="option.macros">
                        <span v-for="macro in RECIPE_MACROS" :key="macro.key" class="flex items-center gap-1 tabular-nums">
                          <span class="size-1.5 rounded-full shrink-0" :class="macro.dot" />
                          <span class="sr-only">{{ macro.label }}</span>
                          <span aria-hidden="true">{{ macro.short }}</span>
                          {{ Math.round(option.macros[macro.key]) }}
                        </span>
                      </template>
                      <span v-else class="text-dimmed">Valeurs non renseignées</span>
                    </span>
                  </span>
                </button>
                <p id="recipe-row-hint" class="sr-only">Maj+Entrée pour afficher la fiche de la recette.</p>
                <p v-if="!recipeOptions.length" class="px-3 py-6 text-center text-sm text-muted">
                  Aucune recette ne correspond.
                </p>
              </div>
            </div>
          </UFormField>
        </template>

        <template v-else-if="mode === 'ingredient'">
          <UFormField label="Catégorie">
            <USelectMenu
              v-model="ingredientCategoryFilter"
              :items="ingredientCategoryFilterOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-shapes"
              class="w-full"
              @update:model-value="onIngredientCategoryFilterChange"
            />
          </UFormField>
          <UFormField label="Aliment" :error="ingredientError">
            <USelectMenu
              v-model="ingredientId"
              :items="ingredientOptions"
              value-key="id"
              placeholder="Choisir un aliment..."
              :search-input="{ placeholder: 'Rechercher...' }"
              icon="i-lucide-carrot"
              class="w-full"
              @update:model-value="onIngredientChange"
            >
              <template #item-trailing="{ item }">
                <span class="text-xs text-dimmed tabular-nums">{{ item.kcalLabel }}</span>
                <MacroPie v-bind="item.macros" />
              </template>
            </USelectMenu>
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Quantité" :error="quantityError">
              <UInput v-model="quantity" type="text" inputmode="decimal" placeholder="100" size="md" variant="outline" class="w-full" />
            </UFormField>
            <UFormField label="Unité">
              <USelectMenu
                v-model="unit"
                :items="unitOptions"
                value-key="value"
                :search-input="false"
                class="w-full"
                @update:model-value="onUnitChange"
              />
            </UFormField>
          </div>
        </template>

        <template v-else>
          <UFormField label="Libellé" :error="labelError">
            <UInput v-model="label" placeholder="ex : Restaurant, barre protéinée..." size="md" variant="outline" class="w-full" />
          </UFormField>
          <UFormField label="Calories (kcal)" :error="kcalError">
            <UInput v-model="kcal" type="text" inputmode="decimal" placeholder="ex : 450" size="md" variant="outline" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Glucides (g)" :error="carbohydratesError">
              <UInput v-model="carbohydrates" type="text" inputmode="decimal" placeholder="0" size="md" variant="outline" class="w-full" />
            </UFormField>
            <UFormField label="Protéines (g)" :error="proteinError">
              <UInput v-model="protein" type="text" inputmode="decimal" placeholder="0" size="md" variant="outline" class="w-full" />
            </UFormField>
            <UFormField label="Lipides (g)" :error="fatError">
              <UInput v-model="fat" type="text" inputmode="decimal" placeholder="0" size="md" variant="outline" class="w-full" />
            </UFormField>
          </div>
        </template>

        <!-- Aperçu de ce qui sera ajouté (mode Macros : la saisie elle-même fait foi). -->
        <p v-if="draft && mode !== 'macros'" class="rounded-md bg-elevated px-3 py-2 text-sm text-muted tabular-nums">
          <span class="font-semibold text-highlighted">{{ draft.kcal }} kcal</span>
          -
          <MenuMacroLabels :carbohydrates="draft.carbohydrates" :protein="draft.protein" :fat="draft.fat" />
        </p>
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" @click="closeSlideover" />
      <UButton
        :label="isEditMode ? 'Enregistrer' : 'Ajouter'"
        color="primary"
        :icon="isEditMode ? 'i-lucide-check' : 'i-lucide-plus'"
        @click="onSubmit"
      />
      <!-- Nombre de parts (mode Recette), aligné à droite de la barre d'ajout ; sans champ de saisie, aucun clavier ne s'ouvre sur mobile. -->
      <div
        v-if="mode === 'recipe'"
        role="group"
        aria-label="Nombre de parts"
        class="ml-auto flex items-center gap-1 rounded-md ring ring-inset ring-accented"
        :title="selectedRecipe ? `La recette fait ${selectedRecipe.persons ?? 1} part(s)` : undefined"
      >
        <UButton
          icon="i-lucide-minus"
          color="neutral"
          variant="link"
          size="md"
          aria-label="Retirer une demi-part"
          :disabled="parts <= PARTS_STEP"
          @click="stepParts(-1)"
        />
        <span class="min-w-14 text-center text-sm font-medium text-highlighted tabular-nums whitespace-nowrap" aria-live="polite">
          {{ parts.toLocaleString('fr-FR') }} part{{ parts > 1 ? 's' : '' }}
        </span>
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="link"
          size="md"
          aria-label="Ajouter une demi-part"
          @click="stepParts(1)"
        />
      </div>
    </template>
  </USlideover>

  <!-- Fiche de la recette (appui prolongé), au-dessus de la modale ; ses quantités suivent le nombre de parts choisi. -->
  <RecipeDetailSlideover
    v-model:open="recipeDetailOpen"
    :recipe="viewedRecipe"
    :ingredients-by-id="ingredientsById"
    :parts="parts"
  />
</template>
