<script setup lang="ts">
import { collection, setDoc, updateDoc, doc, Timestamp, deleteField, query, orderBy } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { VueDraggable } from 'vue-draggable-plus'
import type { Recipe, RecipeIngredientLine } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'
import { RECIPE_DIFFICULTIES, recipeDifficultyLabel, type RecipeDifficulty } from '~/utils/recipeDifficulty'
import { parsePositiveNumber, parseNonNegativeNumber } from '~/utils/numberInput'

/**
 * Slideover d'ajout/modification de recette — un seul composant pour les deux modes,
 * à l'image d'IngredientFormSlideover. `recipe` nul = création ; non nul = édition.
 * L'image est soit une photo (réduite dans le navigateur, envoyée dans Storage avant l'écriture Firestore),
 * soit un lien externe : choisir l'une remplace l'autre.
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
const photos = useRecipePhotos()

const isEditMode = computed(() => props.recipe !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.recipe?.title}` : 'Ajouter une recette')

const typeItems = RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t) }))

/** Catalogue d'ingrédients (privés de l'utilisateur + publics) pour le sélecteur de lignes de recette. */
const ingredientsQuery = useCollection<Ingredient>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'ingredients'),
    // or(
    //   where('owner', '==', uid),
    //   where('owner', '==', null)
    // ),
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

/** Photo choisie dans ce formulaire, déjà réduite ; vide = on garde l'image existante (ou aucune). */
const photo = usePhotoDraft()
/** L'utilisateur a retiré la photo envoyée existante (ou l'a remplacée par un lien). */
const photoRemoved = ref(false)
/** Avancement de l'envoi (0 → 1) ; `null` hors envoi. */
const uploadProgress = ref<number | null>(null)

const previewUrl = computed(() => {
  if (photo.objectUrl.value) return photo.objectUrl.value
  if (imageUrl.value.trim()) return imageUrl.value.trim()
  if (photoRemoved.value || !props.recipe?.imagePath) return null
  return props.recipe.imageUrl ?? null
})

async function onPhotoPicked(file: File) {
  if (await photo.pick(file)) imageUrl.value = ''
}

function removePhoto() {
  photo.reset()
  imageUrl.value = ''
  photoRemoved.value = true
}

/** Un lien saisi remplace la photo, nouvelle ou déjà envoyée. */
function onImageUrlInput() {
  if (!imageUrl.value.trim()) return
  photo.reset()
  photoRemoved.value = true
}

function resetForm() {
  const r = props.recipe
  recipeTitle.value = r?.title ?? ''
  type.value = r?.type
  difficulty.value = (r?.difficulty as RecipeDifficulty) ?? null
  persons.value = r?.persons != null ? String(r.persons) : '1'
  prepTime.value = r?.prepTime != null ? String(r.prepTime) : ''
  cookTime.value = r?.cookTime != null ? String(r.cookTime) : ''
  // Le champ lien n'affiche que les liens externes : une photo envoyée se voit dans l'aperçu.
  imageUrl.value = r?.imagePath ? '' : (r?.imageUrl ?? '')
  photo.reset()
  photoRemoved.value = false
  uploadProgress.value = null
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
  else photo.set(null)
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

/** Alternative clavier au glisser-déposer : déplace une ligne d'un cran (poignée focus + flèches). */
function moveIngredientRow(row: IngredientRow, direction: -1 | 1) {
  const index = ingredientRows.value.findIndex(r => r.key === row.key)
  const target = index + direction
  if (index === -1 || target < 0 || target >= ingredientRows.value.length) return
  const [moved] = ingredientRows.value.splice(index, 1)
  ingredientRows.value.splice(target, 0, moved!)
}

function onIngredientHandleKeydown(row: IngredientRow, event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveIngredientRow(row, -1)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveIngredientRow(row, 1)
  }
}

/** Les unités disponibles dépendent de l'ingrédient choisi : celle d'une ligne ne survit pas à un changement d'ingrédient. */
function onIngredientRowIngredientChange(row: IngredientRow) {
  row.unit = unitOptionsForRow(row)[0]!.value
}

/** Les unités propres à l'ingrédient passent avant les grammes, la plus petite (en g/ml) en tête : c'est l'unité proposée par défaut. */
function unitOptionsForRow(row: IngredientRow) {
  const ingredient = row.ingredientId ? ingredientsById.value.get(row.ingredientId) : undefined
  const options = Object.entries(ingredient?.units ?? {})
    .sort(([, a], [, b]) => a.value - b.value)
    .map(([key, u]) => ({ value: key, label: `${u.label} (${u.value} ${u.unit})` }))
  options.push({ value: GRAMS_UNIT, label: 'Grammes (g)' })
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
  if (!isValid.value || photo.processing.value) return

  if (!user.value) {
    toast.add({ title: 'Erreur', description: 'Vous devez être connecté.', color: 'error' })
    return
  }
  const uid = user.value.uid
  const existing = props.recipe
  const recipeId = existing?.id ?? doc(collection(db, 'recipes')).id

  saving.value = true
  photo.error.value = null

  let uploaded: { url: string; path: string } | null = null
  if (photo.blob.value) {
    uploadProgress.value = 0
    try {
      uploaded = await photos.upload(uid, recipeId, photo.blob.value, (ratio) => { uploadProgress.value = ratio })
    } catch (error) {
      console.error('Envoi de la photo échoué :', error)
      photo.error.value = photos.uploadErrorMessage(error)
      saving.value = false
      uploadProgress.value = null
      return
    }
  }

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
    setOrClear('source', source.value.trim())
    setOrClear('description', description.value.trim())
    setOrClear('instructions', instructions.value.trim())

    // Image : nouvelle photo, sinon lien saisi, sinon photo envoyée conservée, sinon aucune.
    const trimmedImageUrl = imageUrl.value.trim()
    if (uploaded) {
      payload.imageUrl = uploaded.url
      payload.imagePath = uploaded.path
    } else if (trimmedImageUrl) {
      payload.imageUrl = trimmedImageUrl
      if (existing) payload.imagePath = deleteField()
    } else if (existing && (photoRemoved.value || !existing.imagePath)) {
      payload.imageUrl = deleteField()
      payload.imagePath = deleteField()
    }

    if (existing) {
      await updateDoc(doc(db, 'recipes', existing.id), payload)
      toast.add({ title: 'Modifiée', description: `« ${trimmedTitle} » a été mise à jour`, color: 'success' })
    } else {
      await setDoc(doc(db, 'recipes', recipeId), {
        ...payload,
        owner: uid,
        createdAt: now,
      })
      toast.add({ title: 'Ajoutée', description: `« ${trimmedTitle} » a été ajoutée à vos recettes`, color: 'success' })
    }

    // L'ancienne photo n'est plus référencée par cette recette : remplacée ou retirée.
    if (existing?.imagePath && (uploaded || photoRemoved.value)) photos.removeIfUnused(existing)

    open.value = false
  } catch (error: any) {
    // Le document n'a pas été écrit : la photo envoyée ne serait référencée nulle part.
    if (uploaded) photos.remove(uploaded.path)
    toast.add({
      title: 'Erreur',
      description: error.message || `Une erreur est survenue lors de ${isEditMode.value ? 'la modification' : "l'ajout"}.`,
      color: 'error'
    })
  } finally {
    saving.value = false
    uploadProgress.value = null
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

        <PhotoField
          label="Image (optionnel)"
          :preview-url="previewUrl"
          alt="Aperçu de l'image de la recette"
          placeholder-icon="i-lucide-image"
          placeholder-text="Une photo du plat, ou un lien vers une image."
          :processing="photo.processing.value"
          :upload-progress="uploadProgress"
          :error="photo.error.value"
          :disabled="saving"
          @pick="onPhotoPicked"
          allow-url
          v-model:url="imageUrl"
          @update:url="onImageUrlInput"
          @remove="removePhoto"
        />

        <!-- Ingrédients -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list" class="size-3.5 text-muted shrink-0" />
              <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Ingrédients (optionnel)</p>
            </div>
          </div>
          <VueDraggable
            v-if="ingredientRows.length > 0"
            v-model="ingredientRows"
            tag="div"
            class="flex flex-col gap-2"
            handle=".ingredient-drag-handle"
            :animation="200"
            ghost-class="ingredient-row-ghost"
            chosen-class="ingredient-row-chosen"
          >
            <div
              v-for="(row, index) in ingredientRows"
              :key="row.key"
              class="ingredient-row flex flex-col gap-2 rounded-lg border border-transparent p-2 sm:flex-row sm:items-start sm:p-1.5"
            >
              <div class="flex items-start gap-2 sm:contents">
                <UButton
                  icon="i-lucide-grip-vertical"
                  color="neutral"
                  variant="ghost"
                  size="md"
                  :aria-label="`Réordonner ${ingredientRowLabel(row) || 'cet ingrédient'} (position ${index + 1} sur ${ingredientRows.length}) : flèches haut/bas pour déplacer`"
                  class="ingredient-drag-handle shrink-0 mt-0.5 cursor-grab text-dimmed hover:text-muted active:cursor-grabbing touch-none"
                  @keydown="onIngredientHandleKeydown(row, $event)"
                />
                <UFormField class="min-w-0 flex-1" :error="ingredientRowIngredientError(row)">
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
              </div>
              <!-- pl-10 = poignée (32px) + gap (8px) : aligne la 2e ligne sur le sélecteur d'ingrédient en mobile -->
              <div class="flex items-start gap-2 pl-10 sm:contents">
                <UFormField class="w-20 shrink-0" :error="ingredientRowQuantityError(row)">
                  <UInput v-model="row.quantity" type="text" inputmode="decimal" placeholder="qté" aria-label="Quantité" size="md" variant="outline" class="w-full" />
                </UFormField>
                <USelectMenu
                  v-model="row.unit"
                  :items="unitOptionsForRow(row)"
                  value-key="value"
                  :search-input="false"
                  aria-label="Unité"
                  class="min-w-0 flex-1 sm:w-28 sm:flex-none"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  size="md"
                  :aria-label="`Supprimer ${ingredientRowLabel(row) || 'cet ingrédient'}`"
                  class="shrink-0 mt-0.5"
                  @click="removeIngredientRow(row.key)"
                />
              </div>
            </div>
          </VueDraggable>
          <div class="flex items-center" :class="ingredientRows.length === 0 ? 'justify-between' : 'justify-end mt-2'">
            <p v-if="ingredientRows.length === 0" class="text-xs text-dimmed">
              Aucun ingrédient.
            </p>
            <UButton label="Ajouter" icon="i-lucide-plus" size="xs" color="neutral" variant="outline" @click="addIngredientRow" />
          </div>
        </div>

        <UFormField label="Tags (optionnel)">
          <UInputTags v-model="tags" placeholder="Ajouter un tag..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Description (optionnel)">
          <UTextarea v-model="description" :rows="2" autoresize :ui="{ base: 'overflow-hidden' }" placeholder="Note libre..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Instructions (optionnel)">
          <UTextarea v-model="instructions" :rows="4" autoresize :ui="{ base: 'overflow-hidden' }" placeholder="Étapes de préparation..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Source (optionnel)">
          <UInput v-model="source" placeholder="ex : lien ou livre de cuisine" size="md" variant="outline" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="closeSlideover" />
      <UButton
        :label="uploadProgress !== null ? 'Envoi de la photo...' : 'Enregistrer'"
        color="primary"
        :loading="saving"
        :disabled="photo.processing.value"
        @click="handleSubmit"
      />
    </template>
  </USlideover>
</template>

<style scoped>
.ingredient-row {
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

/* Emplacement de dépose : cadre en pointillés indigo, contenu estompé (Sortable applique cette classe au placeholder). */
.ingredient-row-ghost {
  opacity: 0.5;
  background-color: color-mix(in oklch, var(--ui-primary) 6%, transparent) !important;
  border-color: color-mix(in oklch, var(--ui-primary) 40%, transparent) !important;
  border-style: dashed;
}

/* Ligne saisie par la poignée : même traitement « actif » que les autres signaux indigo du produit. */
.ingredient-row-chosen {
  background-color: var(--ui-bg-elevated) !important;
  border-color: color-mix(in oklch, var(--ui-primary) 50%, transparent) !important;
}

.ingredient-row-chosen .ingredient-drag-handle {
  color: var(--ui-primary);
}
</style>
