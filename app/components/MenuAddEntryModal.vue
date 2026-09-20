<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import type { Recipe } from '~/types/recipe'
import { buildIngredientDraft, buildManualDraft, buildRecipeDraft, type MenuEntryDraft } from '~/utils/menuEntries'
import { gramsForUnit } from '~/utils/ingredientNutrition'
import { parseNonNegativeNumber, parsePositiveNumber } from '~/utils/numberInput'

/**
 * Modale d'ajout d'un repas dans une case du calendrier (jour + type de repas, fixés par le parent) :
 * une recette de la base (en nombre de parts), un ingrédient de la base (en grammes ou en unité),
 * ou des macros brutes avec un libellé. Émet un `MenuEntryDraft` ; le parent le place dans la case.
 */
const props = defineProps<{
  recipes: Recipe[]
  ingredients: Ingredient[]
  ingredientsById: Map<string, Ingredient>
  /** Case visée, ex : "Lun. 14 · Petit déj". */
  contextLabel: string
}>()

const emit = defineEmits<{
  submit: [draft: MenuEntryDraft]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

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

const recipeId = ref<string | undefined>(undefined)
const parts = ref('1')

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
  recipeId.value = undefined
  parts.value = '1'
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
  props.recipes.map(r => ({ id: r.id, label: r.title })).sort(byLabel)
)

/** Seuls les ingrédients avec valeurs nutritionnelles sont proposés : sans elles, aucun macro n'est calculable. */
const ingredientOptions = computed(() =>
  props.ingredients.filter(i => i.valuesBy100).map(i => ({ id: i.id, label: i.label })).sort(byLabel)
)

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

const partsValue = computed(() => parsePositiveNumber(parts.value))
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

/** Repas à ajouter selon l'onglet actif, `null` tant que le formulaire est incomplet ou invalide. */
const draft = computed<MenuEntryDraft | null>(() => {
  if (mode.value === 'recipe') {
    if (!selectedRecipe.value || partsValue.value === null) return null
    return buildRecipeDraft(selectedRecipe.value, partsValue.value, props.ingredientsById)
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
const partsError = computed(() => numberError(parts.value, parsePositiveNumber, true))
const ingredientError = computed(() => submitted.value && !ingredientId.value ? 'Requis' : undefined)
const quantityError = computed(() => numberError(quantity.value, parsePositiveNumber, true))
const labelError = computed(() => submitted.value && !label.value.trim() ? 'Requis' : undefined)
const kcalError = computed(() => numberError(kcal.value, parseNonNegativeNumber, true))
const proteinError = computed(() => numberError(protein.value, parseNonNegativeNumber, false))
const fatError = computed(() => numberError(fat.value, parseNonNegativeNumber, false))
const carbohydratesError = computed(() => numberError(carbohydrates.value, parseNonNegativeNumber, false))

const closeModal = () => {
  open.value = false
}

const onSubmit = () => {
  submitted.value = true
  if (!draft.value) return
  emit('submit', draft.value)
  closeModal()
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Ajouter un repas"
    :description="contextLabel"
    :ui="{ footer: 'justify-end' }"
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
            <UInput v-model="parts" type="text" inputmode="decimal" placeholder="1" size="md" variant="outline" class="w-full" />
          </UFormField>
        </template>

        <template v-else-if="mode === 'ingredient'">
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
      <UButton label="Annuler" color="neutral" variant="ghost" @click="closeModal" />
      <UButton label="Ajouter" color="primary" icon="i-lucide-plus" @click="onSubmit" />
    </template>
  </UModal>
</template>
