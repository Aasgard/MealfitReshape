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
 */
const props = defineProps<{
  recipes: Recipe[]
  ingredients: Ingredient[]
  ingredientsById: Map<string, Ingredient>
  /** Case visée, ex : "Lun. 14 · Petit déj". */
  contextLabel: string
}>()

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

const RECIPE_TYPE_FILTER_ALL = 'ALL'
const recipeTypeFilterOptions = [
  { value: RECIPE_TYPE_FILTER_ALL, label: 'Tous les types' },
  ...RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t) })),
]

const recipeTypeFilter = ref<typeof RECIPE_TYPE_FILTER_ALL | RecipeType>(RECIPE_TYPE_FILTER_ALL)
const recipeId = ref<string | undefined>(undefined)
const parts = ref<number | null>(1)

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
  recipeTypeFilter.value = RECIPE_TYPE_FILTER_ALL
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
})

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'fr')

const recipeOptions = computed(() =>
  props.recipes
    .filter(r => recipeTypeFilter.value === RECIPE_TYPE_FILTER_ALL || r.type === recipeTypeFilter.value)
    .map(r => ({ id: r.id, label: r.title }))
    .sort(byLabel)
)

/** Le type filtre la liste ; une recette déjà choisie qui n'y correspond plus est désélectionnée. */
const onRecipeTypeFilterChange = () => {
  if (!selectedRecipe.value || selectedRecipe.value.type === recipeTypeFilter.value || recipeTypeFilter.value === RECIPE_TYPE_FILTER_ALL) return
  recipeId.value = undefined
}

/** Seuls les ingrédients avec valeurs nutritionnelles sont proposés : sans elles, aucun macro n'est calculable. */
const ingredientOptions = computed(() =>
  props.ingredients
    .filter(i => i.valuesBy100 && (ingredientCategoryFilter.value === INGREDIENT_CATEGORY_FILTER_ALL || i.category?.id === ingredientCategoryFilter.value))
    .map(i => ({ id: i.id, label: i.label }))
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
const partsError = computed(() => submitted.value && !parts.value ? 'Requis' : undefined)
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
    title="Ajouter un repas"
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
          <UFormField label="Type de plat">
            <USelectMenu
              v-model="recipeTypeFilter"
              :items="recipeTypeFilterOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-utensils"
              class="w-full"
              @update:model-value="onRecipeTypeFilterChange"
            />
          </UFormField>
          <UFormField label="Recette" :error="recipeError">
            <USelectMenu
              v-model="recipeId"
              :items="recipeOptions"
              value-key="id"
              placeholder="Choisir une recette..."
              :search-input="{ placeholder: 'Rechercher...' }"
              icon="i-lucide-chef-hat"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Nombre de parts"
            :error="partsError"
            :hint="selectedRecipe ? `La recette fait ${selectedRecipe.persons ?? 1} part(s)` : undefined"
          >
            <UInputNumber v-model="parts" :min="0.5" :step="0.5" size="md" variant="outline" class="w-full" />
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
            />
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
      <UButton label="Ajouter" color="primary" icon="i-lucide-plus" @click="onSubmit" />
    </template>
  </USlideover>
</template>
