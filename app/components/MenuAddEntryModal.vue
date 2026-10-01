<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import type { MealSource } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { buildIngredientDraft, buildManualDraft, buildRecipeDraft, type MenuEntryDraft } from '~/utils/menuEntries'
import { gramsForUnit } from '~/utils/ingredientNutrition'
import { parseNonNegativeNumber, parsePositiveNumber } from '~/utils/numberInput'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'

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
const submitted = ref(false)

const recipeTypeFilterOptions = RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t) }))

/** Filtres cumulatifs de la liste des recettes : l'un des types choisis, et tous les ingrédients choisis. Vides = pas de filtre. */
const recipeTypeFilter = ref<RecipeType[]>([])
const recipeIngredientFilter = ref<string[]>([])
const recipeId = ref<string | undefined>(undefined)
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
  recipeId.value = undefined
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

const matchesRecipeFilters = (recipe: Recipe) => {
  if (recipeTypeFilter.value.length && !(recipe.type && recipeTypeFilter.value.includes(recipe.type))) return false
  if (!recipeIngredientFilter.value.length) return true
  const recipeIngredientIds = new Set((recipe.ingredients ?? []).map(line => line.ingredientRef?.id))
  return recipeIngredientFilter.value.every(id => recipeIngredientIds.has(id))
}

const hasRecipeFilters = computed(() => recipeTypeFilter.value.length > 0 || recipeIngredientFilter.value.length > 0)

/** Chaque recette avec ses kcal et sa répartition des macros pour une part, affichées en fin de ligne. */
const recipeOptions = computed(() =>
  props.recipes
    .filter(matchesRecipeFilters)
    .map((r) => {
      const { kcal, carbohydrates, protein, fat } = buildRecipeDraft(r, 1, props.ingredientsById)
      return { id: r.id, label: r.title, kcalLabel: `${kcal} kcal`, macros: { carbohydrates, protein, fat } }
    })
    .sort(byLabel)
)

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
      return { id: i.id, label: i.label, kcalLabel: `${Math.round(calories)} kcal/100 g`, macros: { carbohydrates, protein, fat } }
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
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <div class="flex flex-col gap-5">
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
              <span class="text-sm font-medium text-default">Filtres</span>
              <UButton
                v-if="hasRecipeFilters"
                label="Réinitialiser"
                color="neutral"
                variant="link"
                size="xs"
                class="p-0"
                @click="resetRecipeFilters"
              />
            </div>
            <div class="flex flex-col gap-3">
              <!-- Boutons bascule dans le style des onglets du dessus ; plusieurs types peuvent être actifs à la fois. -->
              <div role="group" aria-label="Filtrer par type de plat" class="flex flex-wrap gap-1 rounded-lg bg-elevated p-1">
                <UButton
                  v-for="option in recipeTypeFilterOptions"
                  :key="option.value"
                  :label="option.label"
                  :color="recipeTypeFilter.includes(option.value) ? 'primary' : 'neutral'"
                  :variant="recipeTypeFilter.includes(option.value) ? 'solid' : 'ghost'"
                  size="sm"
                  :aria-pressed="recipeTypeFilter.includes(option.value)"
                  class="flex-1 justify-center"
                  @click="toggleRecipeTypeFilter(option.value)"
                />
              </div>
              <USelectMenu
                v-model="recipeIngredientFilter"
                :items="recipeIngredientFilterOptions"
                value-key="id"
                multiple
                placeholder="Tous les ingrédients"
                :search-input="{ placeholder: 'Rechercher un ingrédient...' }"
                icon="i-lucide-carrot"
                aria-label="Filtrer par ingrédient"
                class="w-full"
                @update:model-value="onRecipeFilterChange"
              />
            </div>
          </div>
          <UFormField
            label="Recette"
            :error="recipeError"
            :hint="hasRecipeFilters ? `${recipeOptions.length} recette${recipeOptions.length > 1 ? 's' : ''}` : undefined"
          >
            <USelectMenu
              v-model="recipeId"
              :items="recipeOptions"
              value-key="id"
              placeholder="Choisir une recette..."
              :search-input="{ placeholder: 'Rechercher...' }"
              icon="i-lucide-chef-hat"
              class="w-full"
            >
              <template #item-trailing="{ item }">
                <span class="text-xs text-dimmed tabular-nums">{{ item.kcalLabel }}</span>
                <MacroPie v-bind="item.macros" />
              </template>
            </USelectMenu>
          </UFormField>
          <UFormField
            label="Nombre de parts"
            :hint="selectedRecipe ? `La recette fait ${selectedRecipe.persons ?? 1} part(s)` : undefined"
          >
            <!-- Valeur affichée entre deux boutons, sans champ de saisie : aucun clavier ne s'ouvre sur mobile. -->
            <div role="group" aria-label="Nombre de parts" class="flex items-center justify-between rounded-md ring ring-inset ring-accented">
              <UButton
                icon="i-lucide-minus"
                color="neutral"
                variant="link"
                size="md"
                aria-label="Retirer une demi-part"
                :disabled="parts <= PARTS_STEP"
                @click="stepParts(-1)"
              />
              <span class="text-sm font-medium text-highlighted tabular-nums" aria-live="polite">
                {{ parts.toLocaleString('fr-FR') }}
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
    </template>
  </USlideover>
</template>
