<script setup lang="ts">
import { collection, setDoc, updateDoc, doc, Timestamp, deleteField, query, orderBy } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { VueDraggable } from 'vue-draggable-plus'
import type { Recipe, RecipeDraft, RecipeIngredientLine } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import type { ProposedIngredient, ReadIngredientLine } from '#shared/types/recipeReading'
import type { IngredientPrefill } from '~/utils/offNutrition'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'
import { RECIPE_DIFFICULTIES, recipeDifficultyLabel, type RecipeDifficulty } from '~/utils/recipeDifficulty'
import { parsePositiveNumber, parseNonNegativeNumber } from '~/utils/numberInput'
import { macrosForRecipe } from '~/utils/recipeNutrition'
import { canonicalRecipeTag, dedupeRecipeTags } from '~/utils/recipeTags'
import { BOOK_PAGE_MAX, cleanBookPage, isBookLikeSource, matchBookByTitle, splitSourcePage } from '~/utils/books'

/**
 * Slideover d'ajout/modification de recette — un seul composant pour les deux modes,
 * à l'image d'IngredientFormSlideover. `recipe` nul = création ; non nul = édition.
 * L'image est soit une photo (réduite dans le navigateur, envoyée dans Storage avant l'écriture Firestore),
 * soit un lien externe : choisir l'une remplace l'autre.
 * En création, `draft` pré-remplit le formulaire avec une recette lue sur des photos : chaque ligne d'ingrédient
 * garde le texte lu et son état (reconnue, à vérifier, à associer) jusqu'à l'enregistrement.
 */
const props = withDefaults(defineProps<{
  recipe: Recipe | null
  draft?: RecipeDraft | null
}>(), {
  draft: null,
})

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const { generate: generateFirestoreId } = useFirestoreId()
const photos = useRecipePhotos()

const isEditMode = computed(() => props.recipe !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.recipe?.title}` : 'Ajouter une recette')

/** Libellé des rubriques Instructions, Tags et Description : même titre que la rubrique Ingrédients. */
const SECTION_FIELD_UI = {
  label: 'flex items-center gap-2 text-xs text-dimmed font-medium uppercase tracking-wide',
  container: 'mt-3',
}

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

/** Ce que la lecture des photos a donné pour une ligne ; `reviewed` = quantité supposée retouchée ou ingrédient choisi à la main. */
interface RowReading {
  text: string
  status: ReadIngredientLine['status'] | 'reviewed'
  note: string
  /** Quantité dans l'unité proposée pour un ingrédient à créer. */
  quantity: number
  grams: number
  proposal: ProposedIngredient | null
}

interface IngredientRow {
  key: string
  ingredientId: string | undefined
  /** Id d'une unité de l'ingrédient (clé de `ingredient.units`) ; GRAMS_UNIT = grammes */
  unit: string
  quantity: string
  /** Présent pour une ligne lue sur une photo. */
  read?: RowReading
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
/** Source de la recette : un livre de la bibliothèque (avec sa page), ou un texte libre (lien, magazine…). */
const sourceMode = ref<'book' | 'text'>('book')
const bookId = ref<string | undefined>(undefined)
const bookPage = ref('')

/** Livres de cuisine : les seuls qu'une recette peut prendre pour source. */
const { books } = useBooks()
const bookOptions = computed(() => books.value.map(b => ({ id: b.id, label: b.title, description: b.authors.join(', ') || undefined })))

/**
 * Source texte qui ressemble à un livre : on propose de la rattacher au livre de même titre, ou de créer ce livre.
 * La page écrite dans le texte (« p. 42 ») suit.
 */
const textSourceSuggestion = computed(() => {
  if (sourceMode.value !== 'text' || !isBookLikeSource(source.value)) return null
  const { title, page } = splitSourcePage(source.value)
  if (!title) return null
  const match = matchBookByTitle(title, books.value)
  return { title, page, match }
})

const bookFormOpen = ref(false)
const bookFormTitle = ref('')
/** Page à reprendre quand le livre créé depuis la source arrive. */
const pendingBookPage = ref('')

function applySuggestedBook() {
  const suggestion = textSourceSuggestion.value
  if (!suggestion) return
  if (suggestion.match) {
    bookId.value = suggestion.match.id
    bookPage.value = suggestion.page || bookPage.value
    sourceMode.value = 'book'
    return
  }
  createBook(suggestion.title, suggestion.page)
}

function createBook(title: string, page = '') {
  bookFormTitle.value = title.trim()
  pendingBookPage.value = page
  bookFormOpen.value = true
}

function onBookCreated(id: string) {
  bookId.value = id
  if (pendingBookPage.value) bookPage.value = pendingBookPage.value
  pendingBookPage.value = ''
  sourceMode.value = 'book'
}
const description = ref('')
const instructions = ref('')
const tags = ref<string[]>([])
const tagSearch = ref('')

/** Tags déjà utilisés par le foyer, du plus fréquent au moins fréquent : on les propose pour garder un vocabulaire commun. */
const { vocabulary: tagVocabulary } = useRecipeTags()
const tagSuggestions = computed(() => tagVocabulary.value.map(t => t.label))
const tagCounts = computed(() => new Map(tagVocabulary.value.map(t => [t.label, t.count])))

/**
 * Le champ des tags passe en `type="search"` pour qu'Android n'y propose pas sa barre de mots de passe (voir `NAME_FIELD_BASE`).
 * En mode `multiple`, `UInputMenu` ne transmet pas sa prop `type` au champ, qui reste en `text` : on la pose sur l'élément.
 */
const tagInputMenu = useTemplateRef('tagInputMenu')
watch(() => tagInputMenu.value?.inputRef, (input) => {
  if (input instanceof HTMLInputElement) input.type = 'search'
})

/** Un tag créé reprend l'orthographe d'un tag existant équivalent (« Vege » → « végé »). */
function createTag(input: string) {
  tags.value = dedupeRecipeTags([...tags.value, canonicalRecipeTag(input, tagVocabulary.value)])
  tagSearch.value = ''
}
const ingredientRows = ref<IngredientRow[]>([])
const saving = ref(false)
const submitted = ref(false)

/** Photo choisie dans ce formulaire, déjà réduite ; vide = on garde l'image existante (ou aucune). */
const photo = usePhotoDraft()
/** L'utilisateur a retiré la photo envoyée existante (ou l'a remplacée par un lien). */
const photoRemoved = ref(false)
/** La photo proposée est l'illustration recadrée depuis la page lue : on le signale tant qu'elle n'est pas remplacée. */
const photoFromPage = ref(false)
/** Avancement de l'envoi (0 → 1) ; `null` hors envoi. */
const uploadProgress = ref<number | null>(null)

const previewUrl = computed(() => {
  if (photo.objectUrl.value) return photo.objectUrl.value
  if (imageUrl.value.trim()) return imageUrl.value.trim()
  if (photoRemoved.value || !props.recipe?.imagePath) return null
  return props.recipe.imageUrl ?? null
})

async function onPhotoPicked(file: File) {
  if (await photo.pick(file)) {
    imageUrl.value = ''
    photoFromPage.value = false
  }
}

function removePhoto() {
  photo.reset()
  photoFromPage.value = false
  imageUrl.value = ''
  photoRemoved.value = true
}

/** Un lien saisi remplace la photo, nouvelle ou déjà envoyée. */
function onImageUrlInput() {
  if (!imageUrl.value.trim()) return
  photo.reset()
  photoRemoved.value = true
  photoFromPage.value = false
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
  photoFromPage.value = false
  uploadProgress.value = null
  source.value = r?.source ?? ''
  bookId.value = r?.bookId
  bookPage.value = r?.bookPage ?? ''
  sourceMode.value = r?.bookId || !r?.source ? 'book' : 'text'
  description.value = r?.description ?? ''
  instructions.value = r?.instructions ?? ''
  tags.value = r?.tags ? [...r.tags] : []
  tagSearch.value = ''
  ingredientRows.value = r?.ingredients
    ? r.ingredients.map(line => ({
        key: generateFirestoreId(),
        ingredientId: line.ingredientRef?.id,
        unit: line.unit ?? GRAMS_UNIT,
        quantity: String(line.quantity),
      }))
    : []
  submitted.value = false
  if (!r && props.draft) applyDraft(props.draft)
}

/** Recette lue : seuls les champs lus sont remplis, le reste garde ses valeurs par défaut. */
function applyDraft(draft: RecipeDraft) {
  const d = draft.reading
  recipeTitle.value = d.title
  if (d.persons) persons.value = String(d.persons)
  if (d.prepTime != null) prepTime.value = String(d.prepTime)
  if (d.cookTime != null) cookTime.value = String(d.cookTime)
  instructions.value = d.instructions
  source.value = d.source
  bookPage.value = d.page
  // Livre reconnu par Claude, sinon par son titre ; à défaut, le texte lu reste, avec de quoi ajouter le livre.
  bookId.value = d.bookId ?? (d.source ? matchBookByTitle(splitSourcePage(d.source).title, books.value)?.id : undefined)
  sourceMode.value = bookId.value || !d.source ? 'book' : 'text'
  ingredientRows.value = d.ingredients.map(line => ({
    key: generateFirestoreId(),
    ingredientId: line.ingredientId ?? undefined,
    unit: line.unitId ?? GRAMS_UNIT,
    // Sans ingrédient, seule l'unité « Grammes » existe : la quantité dans l'unité proposée attend sa création.
    quantity: String(line.ingredientId ? line.quantity : (line.grams || line.quantity)),
    read: { text: line.text, status: line.status, note: line.note, quantity: line.quantity, grams: line.grams, proposal: line.proposal },
  }))
  if (draft.dishImage) {
    photo.set(draft.dishImage)
    photoFromPage.value = true
  }
}

const isFromDraft = computed(() => !isEditMode.value && props.draft !== null)

/** Lignes lues encore à traiter : sans ingrédient (bloquant) ou à quantité supposée. */
const readCounts = computed(() => {
  let unmatched = 0
  let check = 0
  for (const row of ingredientRows.value) {
    if (!row.read) continue
    if (!row.ingredientId) unmatched++
    else if (row.read.status === 'check') check++
  }
  return { unmatched, check }
})

/** Retoucher la quantité ou l'unité d'une ligne à vérifier vaut vérification. */
function markRowReviewed(row: IngredientRow) {
  if (row.read?.status === 'check') row.read.status = 'reviewed'
}

// --- Création d'un ingrédient absent du catalogue, pré-rempli par la lecture ---

const ingredientFormOpen = ref(false)
const creatingRowKey = ref<string | null>(null)

const ingredientPrefill = computed<IngredientPrefill | null>(() => {
  const proposal = ingredientRows.value.find(r => r.key === creatingRowKey.value)?.read?.proposal
  if (!proposal) return null
  return {
    label: proposal.label,
    calories: String(proposal.calories),
    carbohydrates: String(proposal.carbohydrates),
    fat: String(proposal.fat),
    protein: String(proposal.protein),
    density: '',
    comment: '',
    origin: 'estimate',
    categoryId: proposal.categoryId || undefined,
    units: proposal.unit ? [proposal.unit] : [],
  }
})

function createIngredientFor(row: IngredientRow) {
  creatingRowKey.value = row.key
  ingredientFormOpen.value = true
}

/** L'ingrédient créé prend place dans la ligne, avec l'unité proposée si elle a été gardée, sinon en grammes. */
function onIngredientCreated(created: { id: string; units: Record<string, { label: string }> }) {
  const row = ingredientRows.value.find(r => r.key === creatingRowKey.value)
  creatingRowKey.value = null
  if (!row?.read) return
  row.ingredientId = created.id
  const proposedUnit = row.read.proposal?.unit?.label.trim().toLowerCase()
  const unitKey = proposedUnit
    ? Object.entries(created.units).find(([, u]) => u.label.trim().toLowerCase() === proposedUnit)?.[0]
    : undefined
  if (unitKey) {
    row.unit = unitKey
    row.quantity = String(row.read.quantity)
  } else {
    row.unit = GRAMS_UNIT
    if (row.read.grams > 0) row.quantity = String(row.read.grams)
  }
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
  // Ligne lue : la quantité lue ne vaut que pour l'unité d'origine, on repart de son équivalent en grammes.
  if (row.read) {
    row.unit = GRAMS_UNIT
    if (row.read.grams > 0) row.quantity = String(row.read.grams)
    row.read.status = 'reviewed'
    return
  }
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

/**
 * Valeurs pour une part, recalculées à la saisie comme sur la fiche : les lignes incomplètes (ingrédient non choisi,
 * quantité invalide) sont ignorées, et des parts invalides comptent pour une.
 */
const macros = computed(() => {
  const lines = ingredientRows.value.flatMap((row) => {
    const quantity = parsePositiveNumber(row.quantity)
    if (!row.ingredientId || quantity === null) return []
    const line: RecipeIngredientLine = { ingredientRef: doc(db, 'ingredients', row.ingredientId), quantity }
    if (row.unit !== GRAMS_UNIT) line.unit = row.unit
    return [line]
  })
  return macrosForRecipe(lines, ingredientsById.value, parsePositiveNumber(persons.value) ?? 1)
})
const hasMacros = computed(() => {
  const m = macros.value
  return m.calories > 0 || m.protein > 0 || m.carbohydrates > 0 || m.fat > 0
})

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
      tags: dedupeRecipeTags(tags.value.map(t => canonicalRecipeTag(t, tagVocabulary.value))),
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
    // On enregistre la source affichée : le livre choisi, ou le texte libre ; l'autre est retirée.
    const withBook = sourceMode.value === 'book' && !!bookId.value
    setOrClear('bookId', withBook ? bookId.value : undefined)
    setOrClear('bookPage', withBook ? cleanBookPage(bookPage.value) : undefined)
    setOrClear('source', sourceMode.value === 'text' ? source.value.trim() : undefined)
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
        <div v-if="isFromDraft" class="flex items-start gap-2.5 rounded-lg bg-elevated px-3 py-2.5 text-sm">
          <UIcon name="i-lucide-scan-text" class="size-4 shrink-0 mt-0.5 text-primary" />
          <p class="text-pretty">
            <span class="font-medium text-highlighted">Recette lue sur {{ draft!.photoCount > 1 ? `${draft!.photoCount} photos` : 'une photo' }}.</span>
            <span class="text-muted"> Relisez chaque champ avant d'enregistrer : rien n'est écrit avant.</span>
          </p>
        </div>

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
          :hint="photoFromPage ? 'Illustration extraite de la page. Retirez-la ou remplacez-la si le cadrage ne convient pas.' : undefined"
          :disabled="saving"
          @pick="onPhotoPicked"
          allow-url
          v-model:url="imageUrl"
          @update:url="onImageUrlInput"
          @remove="removePhoto"
        />

        <!-- Valeurs nutritionnelles, recalculées à chaque modification des ingrédients ou des parts -->
        <div v-if="hasMacros">
          <p class="text-xs text-dimmed mb-2">Valeurs nutritionnelles pour une part</p>
          <IngredientMacroSummary :macros="macros" />
        </div>
        <p v-else-if="ingredientRows.length > 0" class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
          Valeurs non renseignées
        </p>

        <!-- Ingrédients -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list" class="size-3.5 text-muted shrink-0" />
              <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Ingrédients (optionnel)</p>
            </div>
            <p v-if="readCounts.unmatched || readCounts.check" class="flex items-center gap-1.5 text-xs tabular-nums" aria-live="polite">
              <span v-if="readCounts.unmatched" class="font-medium text-error">{{ readCounts.unmatched }} à associer</span>
              <span v-if="readCounts.unmatched && readCounts.check" class="text-dimmed" aria-hidden="true">·</span>
              <span v-if="readCounts.check" class="text-warning">{{ readCounts.check }} à vérifier</span>
            </p>
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
              class="ingredient-row flex flex-col gap-2 rounded-lg border border-transparent p-2 sm:flex-row sm:flex-wrap sm:items-start sm:p-1.5"
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
                  <UInput
                    v-model="row.quantity"
                    type="text"
                    inputmode="decimal"
                    placeholder="qté"
                    aria-label="Quantité"
                    size="md"
                    variant="outline"
                    class="w-full"
                    @update:model-value="markRowReviewed(row)"
                  />
                </UFormField>
                <USelectMenu
                  v-model="row.unit"
                  :items="unitOptionsForRow(row)"
                  value-key="value"
                  :search-input="false"
                  aria-label="Unité"
                  class="min-w-0 flex-1 sm:w-28 sm:flex-none"
                  @update:model-value="markRowReviewed(row)"
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

              <!-- Ligne lue sur une photo : le texte d'origine reste visible pour comparer, avec ce qu'il reste à faire. -->
              <div v-if="row.read" class="flex flex-col gap-1.5 pl-10 sm:basis-full sm:-mt-1">
                <p class="truncate text-xs text-dimmed" :title="row.read.text">
                  « {{ row.read.text }} »
                </p>
                <div v-if="!row.ingredientId" class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                  <span class="flex items-center gap-1 text-error">
                    <UIcon name="i-lucide-circle-help" class="size-3.5 shrink-0" />
                    Absent du catalogue
                  </span>
                  <UButton
                    v-if="row.read.proposal"
                    :label="`Créer « ${row.read.proposal.label} »`"
                    icon="i-lucide-plus"
                    color="primary"
                    variant="soft"
                    size="xs"
                    @click="createIngredientFor(row)"
                  />
                  <span class="text-dimmed">ou choisissez-le dans la liste</span>
                </div>
                <p v-else-if="row.read.status === 'check'" class="flex items-center gap-1 text-xs text-warning">
                  <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" />
                  {{ row.read.note }} · à vérifier
                </p>
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

        <UFormField label="Instructions (optionnel)" :ui="SECTION_FIELD_UI">
          <template #label="{ label }">
            <UIcon name="i-lucide-list-ordered" class="size-3.5 text-muted shrink-0" />
            {{ label }}
          </template>
          <UTextarea v-model="instructions" :rows="4" autoresize :ui="{ base: 'overflow-hidden' }" placeholder="Étapes de préparation..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Tags (optionnel)" :ui="SECTION_FIELD_UI">
          <template #label="{ label }">
            <UIcon name="i-lucide-tag" class="size-3.5 text-muted shrink-0" />
            {{ label }}
          </template>
          <UInputMenu
            ref="tagInputMenu"
            v-model="tags"
            v-model:search-term="tagSearch"
            :items="tagSuggestions"
            multiple
            create-item="always"
            placeholder="Ajouter un tag..."
            name="recipe-tag"
            enterkeyhint="done"
            autocomplete="off"
            spellcheck="false"
            data-form-type="other"
            data-lpignore="true"
            :ui="{ tagsInput: NAME_FIELD_BASE }"
            variant="outline"
            class="w-full"
            @create="createTag"
          >
            <template #item-trailing="{ item }">
              <span class="text-xs text-dimmed tabular-nums">{{ tagCounts.get(String(item)) }}</span>
            </template>
            <template #create-item-label="{ item }">
              Créer « {{ item }} »
            </template>
          </UInputMenu>
        </UFormField>

        <UFormField label="Description (optionnel)" :ui="SECTION_FIELD_UI">
          <template #label="{ label }">
            <UIcon name="i-lucide-text" class="size-3.5 text-muted shrink-0" />
            {{ label }}
          </template>
          <UTextarea v-model="description" :rows="2" autoresize :ui="{ base: 'overflow-hidden' }" placeholder="Note libre..." variant="outline" class="w-full" />
        </UFormField>

        <UFormField label="Source (optionnel)" :ui="SECTION_FIELD_UI">
          <template #label="{ label }">
            <UIcon name="i-lucide-book-open" class="size-3.5 text-muted shrink-0" />
            {{ label }}
          </template>
          <div class="flex flex-col gap-2">
            <div role="group" aria-label="Type de source" class="flex w-fit gap-1 rounded-lg bg-elevated p-0.5">
              <UButton
                v-for="mode in ([{ value: 'book', label: 'Livre', icon: 'i-lucide-library' }, { value: 'text', label: 'Autre', icon: 'i-lucide-link' }] as const)"
                :key="mode.value"
                :label="mode.label"
                :icon="mode.icon"
                :color="sourceMode === mode.value ? 'primary' : 'neutral'"
                :variant="sourceMode === mode.value ? 'solid' : 'ghost'"
                size="xs"
                :aria-pressed="sourceMode === mode.value"
                @click="sourceMode = mode.value"
              />
            </div>

            <template v-if="sourceMode === 'book'">
              <div class="flex gap-2">
                <USelectMenu
                  v-model="bookId"
                  :items="bookOptions"
                  value-key="id"
                  placeholder="Choisir un livre..."
                  :search-input="{ placeholder: 'Rechercher ou ajouter un livre...' }"
                  create-item="always"
                  icon="i-lucide-book-open"
                  aria-label="Livre"
                  class="min-w-0 flex-1"
                  @create="createBook"
                >
                  <template #create-item-label="{ item }">
                    Ajouter « {{ item }} » à la bibliothèque
                  </template>
                </USelectMenu>
                <UInput
                  v-model="bookPage"
                  type="text"
                  inputmode="numeric"
                  placeholder="Page"
                  aria-label="Page du livre"
                  :maxlength="BOOK_PAGE_MAX"
                  size="md"
                  variant="outline"
                  class="w-20 shrink-0"
                  :ui="{ base: 'tabular-nums' }"
                />
              </div>
              <p v-if="!books.length" class="text-xs text-dimmed text-pretty">
                La bibliothèque est vide : tapez le titre du livre pour l'ajouter, ou scannez-le depuis Outils › Bibliothèque.
              </p>
            </template>

            <template v-else>
              <UInput v-model="source" placeholder="ex : lien, magazine, carnet de famille" size="md" variant="outline" class="w-full" />
              <div v-if="textSourceSuggestion" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span class="text-dimmed">{{ textSourceSuggestion.match ? 'Ce livre est dans la bibliothèque :' : 'Un livre ?' }}</span>
                <UButton
                  :label="textSourceSuggestion.match ? `Rattacher à « ${textSourceSuggestion.match.title} »` : `Ajouter « ${textSourceSuggestion.title} » à la bibliothèque`"
                  :icon="textSourceSuggestion.match ? 'i-lucide-link-2' : 'i-lucide-plus'"
                  color="primary"
                  variant="soft"
                  size="xs"
                  class="min-w-0"
                  :ui="{ label: 'truncate' }"
                  @click="applySuggestedBook"
                />
              </div>
            </template>
          </div>
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

  <IngredientFormSlideover
    v-model:open="ingredientFormOpen"
    :ingredient="null"
    :prefill="ingredientPrefill"
    @created="onIngredientCreated"
  />

  <BookFormSlideover
    v-model:open="bookFormOpen"
    :book="null"
    :prefill-title="bookFormTitle"
    @created="onBookCreated"
    @existing="(book) => onBookCreated(book.id)"
  />
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
