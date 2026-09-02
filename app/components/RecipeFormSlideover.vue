<script setup lang="ts">
import { collection, addDoc, updateDoc, doc, Timestamp, deleteField } from 'firebase/firestore'
import type { Recipe } from '~/types/recipe'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'
import { RECIPE_DIFFICULTIES, recipeDifficultyLabel, type RecipeDifficulty } from '~/utils/recipeDifficulty'
import { parsePositiveNumber, parseNonNegativeNumber } from '~/utils/numberInput'

/**
 * Slideover d'ajout/modification de recette — un seul composant pour les deux modes,
 * à l'image d'IngredientFormSlideover. `recipe` nul = création ; non nul = édition.
 * L'édition des lignes d'ingrédients n'est pas encore proposée ici ; le champ
 * `ingredients` du document n'est donc jamais touché par ce formulaire.
 */
const props = defineProps<{
  recipe: Recipe | null
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()

const isEditMode = computed(() => props.recipe !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.recipe?.title}` : 'Ajouter une recette')

const typeItems = RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t) }))

const recipeTitle = ref('')
const type = ref<RecipeType | null>(null)
const difficulty = ref<RecipeDifficulty | null>(null)
const persons = ref('1')
const prepTime = ref('')
const cookTime = ref('')
const imageUrl = ref('')
const source = ref('')
const description = ref('')
const instructions = ref('')
const tags = ref<string[]>([])
const saving = ref(false)
const submitted = ref(false)

function resetForm() {
  const r = props.recipe
  recipeTitle.value = r?.title ?? ''
  type.value = r?.type ?? null
  difficulty.value = (r?.difficulty as RecipeDifficulty) ?? null
  persons.value = r?.persons != null ? String(r.persons) : '1'
  prepTime.value = r?.prepTime != null ? String(r.prepTime) : ''
  cookTime.value = r?.cookTime != null ? String(r.cookTime) : ''
  imageUrl.value = r?.imageUrl ?? ''
  source.value = r?.source ?? ''
  description.value = r?.description ?? ''
  instructions.value = r?.instructions ?? ''
  tags.value = r?.tags ? [...r.tags] : []
  submitted.value = false
}

watch(open, (isOpen) => {
  if (isOpen) resetForm()
})

function toggleDifficulty(value: RecipeDifficulty) {
  difficulty.value = difficulty.value === value ? null : value
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

const isValid = computed(() => {
  if (!recipeTitle.value.trim()) return false
  if (!persons.value.trim() || parsePositiveNumber(persons.value) === null) return false
  if (prepTime.value.trim() && parseNonNegativeNumber(prepTime.value) === null) return false
  if (cookTime.value.trim() && parseNonNegativeNumber(cookTime.value) === null) return false
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

    const payload: Record<string, unknown> = {
      title: trimmedTitle,
      persons: parsePositiveNumber(persons.value)!,
      tags: tags.value,
      updatedAt: now,
    }

    const setOrClear = (key: string, value: unknown) => {
      if (value !== undefined && value !== '') payload[key] = value
      else if (isEditMode.value) payload[key] = deleteField()
    }

    setOrClear('type', type.value ?? undefined)
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
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton label="Enregistrer" color="primary" :loading="saving" @click="handleSubmit" />
    </template>
  </USlideover>
</template>
