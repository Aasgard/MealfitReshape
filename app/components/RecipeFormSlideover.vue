<script setup lang="ts">
import { collection, addDoc, updateDoc, doc, Timestamp, deleteField, query, or, where, orderBy } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import type { Recipe, RecipeIngredientLine } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'
import { RECIPE_DIFFICULTIES, recipeDifficultyLabel, type RecipeDifficulty } from '~/utils/recipeDifficulty'
import { parsePositiveNumber, parseNonNegativeNumber } from '~/utils/numberInput'

/**
 * Slideover d'ajout/modification de recette — un seul composant pour les deux modes,
 * à l'image d'IngredientFormSlideover. `recipe` nul = création ; non nul = édition.
 */
const props = defineProps<{
  recipe: Recipe | null
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const { generate: generateFirestoreId } = useFirestoreId()

const isEditMode = computed(() => props.recipe !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.recipe?.title}` : 'Ajouter une recette')

const typeItems = RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t) }))

/** Catalogue d'ingrédients (privés de l'utilisateur + publics) pour le sélecteur de lignes de recette. */
const ingredientsQuery = useCollection<Ingredient>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', uid),
      where('owner', '==', null)
    ),
    orderBy('label', 'asc')
  )
})
const ingredientsById = computed(() => new Map(ingredientsQuery.value.map(i => [i.id, i])))
const ingredientOptions = computed(() => ingredientsQuery.value.map(i => ({ id: i.id, label: i.label })))

interface IngredientRow {
  key: string
  ingredientId: string | undefined
  /** Id d'une unité de l'ingrédient (clé de `ingredient.units`) ; GRAMS_UNIT = grammes */
  unit: string
  quantity: string
}

/**
 * Valeur sentinelle pour l'option « Grammes » du sélecteur d'unité : USelectMenu (Reka UI)
 * réserve la chaîne vide à l'état « aucune sélection », elle ne peut donc pas servir de valeur.
 */
const GRAMS_UNIT = '__grams__'

const recipeTitle = ref('')
const type = ref<RecipeType | undefined>(undefined)
const difficulty = ref<RecipeDifficulty | null>(null)
const persons = ref('1')
const prepTime = ref('')
const cookTime = ref('')
const imageUrl = ref('')
const source = ref('')
const description = ref('')
const instructions = ref('')
const tags = ref<string[]>([])
const ingredientRows = ref<IngredientRow[]>([])
const saving = ref(false)
const submitted = ref(false)

function resetForm() {
  const r = props.recipe
  recipeTitle.value = r?.title ?? ''
  type.value = r?.type
  difficulty.value = (r?.difficulty as RecipeDifficulty) ?? null
  persons.value = r?.persons != null ? String(r.persons) : '1'
  prepTime.value = r?.prepTime != null ? String(r.prepTime) : ''
  cookTime.value = r?.cookTime != null ? String(r.cookTime) : ''
  imageUrl.value = r?.imageUrl ?? ''
  source.value = r?.source ?? ''
  description.value = r?.description ?? ''
  instructions.value = r?.instructions ?? ''
  tags.value = r?.tags ? [...r.tags] : []
  ingredientRows.value = r?.ingredients
    ? r.ingredients.map(line => ({
        key: generateFirestoreId(),
        ingredientId: line.ingredientRef?.id,
        unit: line.unit ?? GRAMS_UNIT,
        quantity: String(line.quantity),
      }))
    : []
  submitted.value = false
}

watch(open, (isOpen) => {
  if (isOpen) resetForm()
})

function toggleDifficulty(value: RecipeDifficulty) {
  difficulty.value = difficulty.value === value ? null : value
}

function closeSlideover() {
  open.value = false
}

function addIngredientRow() {
  ingredientRows.value.push({ key: generateFirestoreId(), ingredientId: undefined, unit: GRAMS_UNIT, quantity: '' })
}

function removeIngredientRow(key: string) {
  ingredientRows.value = ingredientRows.value.filter(r => r.key !== key)
}

/** Les unités disponibles dépendent de l'ingrédient choisi : celle d'une ligne ne survit pas à un changement d'ingrédient. */
function onIngredientRowIngredientChange(row: IngredientRow) {
  row.unit = GRAMS_UNIT
}

function unitOptionsForRow(row: IngredientRow) {
  const options = [{ value: GRAMS_UNIT, label: 'Grammes (g)' }]
  const ingredient = row.ingredientId ? ingredientsById.value.get(row.ingredientId) : undefined
  if (ingredient?.units) {
    for (const [key, u] of Object.entries(ingredient.units)) {
      options.push({ value: key, label: `${u.label} (${u.value} ${u.unit})` })
    }
  }
  return options
}

function ingredientRowLabel(row: IngredientRow) {
  return row.ingredientId ? ingredientsById.value.get(row.ingredientId)?.label : undefined
}

const titleError = computed(() => (submitted.value && !recipeTitle.value.trim()) ? 'Requis' : undefined)

const personsError = computed(() => {
  if (!submitted.value) return undefined
  if (!persons.value.trim()) return 'Requis'
  return parsePositiveNumber(persons.value) === null ? 'Nombre invalide' : undefined
})

function durationError(raw: string) {
  if (!submitted.value || !raw.trim()) return undefined
  return parseNonNegativeNumber(raw) === null ? 'Nombre invalide' : undefined
}

const prepTimeError = computed(() => durationError(prepTime.value))
const cookTimeError = computed(() => durationError(cookTime.value))

function ingredientRowIngredientError(row: IngredientRow) {
  return submitted.value && !row.ingredientId ? 'Requis' : undefined
}

function ingredientRowQuantityError(row: IngredientRow) {
  if (!submitted.value) return undefined
  if (!row.quantity.trim()) return 'Requis'
  return parsePositiveNumber(row.quantity) === null ? 'Nombre invalide' : undefined
}

const isValid = computed(() => {
  if (!recipeTitle.value.trim()) return false
  if (!persons.value.trim() || parsePositiveNumber(persons.value) === null) return false
  if (prepTime.value.trim() && parseNonNegativeNumber(prepTime.value) === null) return false
  if (cookTime.value.trim() && parseNonNegativeNumber(cookTime.value) === null) return false
  if (ingredientRows.value.some(r => !r.ingredientId || parsePositiveNumber(r.quantity) === null)) return false
  return true
})

async function handleSubmit() {
  submitted.value = true
  if (!isValid.value) return

  if (!user.value) {
    toast.add({ title: 'Erreur', description: 'Vous devez être connecté.', color: 'error' })
    return
  }

  saving.value = true
  try {
    const now = Timestamp.now()
    const trimmedTitle = recipeTitle.value.trim()

    const ingredientLines: RecipeIngredientLine[] = ingredientRows.value.map((row) => {
      const line: RecipeIngredientLine = {
        ingredientRef: doc(db, 'ingredients', row.ingredientId!),
        quantity: parsePositiveNumber(row.quantity)!,
      }
      if (row.unit !== GRAMS_UNIT) line.unit = row.unit
      return line
    })

    const payload: Record<string, unknown> = {
      title: trimmedTitle,
      persons: parsePositiveNumber(persons.value)!,
      tags: tags.value,
      ingredients: ingredientLines,
      updatedAt: now,
    }

    const setOrClear = (key: string, value: unknown) => {
      if (value !== undefined && value !== '') payload[key] = value
      else if (isEditMode.value) payload[key] = deleteField()
    }

    setOrClear('type', type.value)
    setOrClear('difficulty', difficulty.value ?? undefined)
    setOrClear('prepTime', prepTime.value.trim() ? parseNonNegativeNumber(prepTime.value)! : undefined)
    setOrClear('cookTime', cookTime.value.trim() ? parseNonNegativeNumber(cookTime.value)! : undefined)
    setOrClear('imageUrl', imageUrl.value.trim())
    setOrClear('source', source.value.trim())
    setOrClear('description', description.value.trim())
    setOrClear('instructions', instructions.value.trim())

    if (isEditMode.value) {
      await updateDoc(doc(db, 'recipes', props.recipe!.id), payload)
      toast.add({ title: 'Modifiée', description: `« ${trimmedTitle} » a été mise à jour`, color: 'success' })
    } else {
      await addDoc(collection(db, 'recipes'), {
        ...payload,
        owner: user.value.uid,
        createdAt: now,
      })
      toast.add({ title: 'Ajoutée', description: `« ${trimmedTitle} » a été ajoutée à vos recettes`, color: 'success' })
    }

    open.value = false
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: error.message || `Une erreur est survenue lors de ${isEditMode.value ? 'la modification' : "l'ajout"}.`,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :dismissible="!saving"
    :close="!saving"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <UFormField label="Titre" :error="titleError">
          <UInput v-model="recipeTitle" placeholder="ex : Salade de quinoa au poulet" size="md" variant="outline" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Type de plat">
            <USelectMenu
              v-model="type"
              :items="typeItems"
              value-key="value"
              placeholder="Choisir..."
              :search-input="false"
              icon="i-lucide-utensils"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Difficulté">
            <div class="flex gap-2">
              <UButton
                v-for="d in RECIPE_DIFFICULTIES"
                :key="d"
                :label="recipeDifficultyLabel(d)"
                size="sm"
                :color="difficulty === d ? 'primary' : 'neutral'"
                :variant="difficulty === d ? 'solid' : 'outline'"
                :aria-pressed="difficulty === d"
                @click="toggleDifficulty(d)"
              />
            </div>
          </UFormField>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <UFormField label="Parts" :error="personsError">
            <UInput v-model="persons" type="text" inputmode="numeric" placeholder="1" size="md" variant="outline" class="w-full" />
          </UFormField>
          <UFormField label="Prép. (min)" :error="prepTimeError">
            <UInput v-model="prepTime" type="text" inputmode="numeric" placeholder="ex : 15" size="md" variant="outline" class="w-full" />
          </UFormField>
          <UFormField label="Cuisson (min)" :error="cookTimeError">
            <UInput v-model="cookTime" type="text" inputmode="numeric" placeholder="ex : 25" size="md" variant="outline" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Image (URL, optionnel)">
          <UInput v-model="imageUrl" placeholder="https://..." size="md" variant="outline" class="w-full" />
        </UFormField>

        <!-- Ingrédients -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list" class="size-3.5 text-muted shrink-0" />
              <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Ingrédients (optionnel)</p>
            </div>
            <UButton label="Ajouter" icon="i-lucide-plus" size="xs" color="neutral" variant="outline" @click="addIngredientRow" />
          </div>
          <p v-if="ingredientRows.length === 0" class="text-xs text-dimmed">
            Aucun ingrédient.
          </p>
          <div v-else class="flex flex-col gap-3">
            <div v-for="row in ingredientRows" :key="row.key" class="flex items-start gap-2">
              <UFormField class="flex-1 min-w-0" :error="ingredientRowIngredientError(row)">
                <USelectMenu
                  v-model="row.ingredientId"
                  :items="ingredientOptions"
                  value-key="id"
                  placeholder="Choisir un ingrédient..."
                  :search-input="{ placeholder: 'Rechercher...' }"
                  icon="i-lucide-carrot"
                  aria-label="Ingrédient"
                  class="w-full"
                  @update:model-value="onIngredientRowIngredientChange(row)"
                />
              </UFormField>
              <UFormField class="w-20 shrink-0" :error="ingredientRowQuantityError(row)">
                <UInput v-model="row.quantity" type="text" inputmode="decimal" placeholder="qté" aria-label="Quantité" size="md" variant="outline" class="w-full" />
              </UFormField>
              <USelectMenu
                v-model="row.unit"
                :items="unitOptionsForRow(row)"
                value-key="value"
                :search-input="false"
                aria-label="Unité"
                class="w-28 shrink-0"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="md"
                :aria-label="`Supprimer ${ingredientRowLabel(row) || 'cet ingrédient'}`"
                class="mt-0.5"
                @click="removeIngredientRow(row.key)"
              />
            </div>
          </div>
        </div>

        <UFormField label="Tags (optionnel)">
          <UInputTags v-model="tags" placeholder="Ajouter un tag..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Description (optionnel)">
          <UTextarea v-model="description" :rows="2" placeholder="Note libre..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Instructions (optionnel)">
          <UTextarea v-model="instructions" :rows="4" placeholder="Étapes de préparation..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Source (optionnel)">
          <UInput v-model="source" placeholder="ex : lien ou livre de cuisine" size="md" variant="outline" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="closeSlideover" />
      <UButton label="Enregistrer" color="primary" :loading="saving" @click="handleSubmit" />
    </template>
  </USlideover>
</template>
