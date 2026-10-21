<script setup lang="ts">
import { SCANNER_ERROR_MESSAGES as SCANNER_ERRORS } from '~/composables/useBarcodeScanner'
import type { ScannerErrorKind } from '~/composables/useBarcodeScanner'
import { ingredientPrefillFromOff } from '~/utils/offNutrition'
import type { IngredientPrefill } from '~/utils/offNutrition'
import { compareItemFromIngredient, compareItemFromOff } from '~/utils/productCompare'
import type { CompareItem } from '~/utils/productCompare'
import type { Ingredient } from '~/types/ingredient'
import { createReusableTemplate } from '@vueuse/core'

useSeoMeta({
  title: 'Dashboard - Scanner produit - Mealfit',
  description: 'Dashboard - Scanner produit - Mealfit',
})

// Pas de zoom, comme sur l'accueil : la balise viewport le bloque sur Android, `touch-action` sur iOS (qui ignore user-scalable).
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }],
  htmlAttrs: { class: 'touch-pan-x touch-pan-y' },
})

const scannerOpen = ref(false)
const scannerError = ref<ScannerErrorKind | null>(null)

/** Erreurs sans issue sur cet appareil : le bouton de scan reste désactivé. */
const cameraUnavailable = computed(() => scannerError.value === 'no-camera' || scannerError.value === 'insecure')

onMounted(() => {
  if (!navigator.mediaDevices?.getUserMedia) {
    scannerError.value = window.isSecureContext ? 'no-camera' : 'insecure'
  }
})

function openScanner() {
  scannerError.value = null
  scannerOpen.value = true
}

function onScannerError(kind: ScannerErrorKind) {
  scannerError.value = kind
}

// --- Saisie manuelle ---

/**
 * Recours rares : repliés derrière une ligne, sauf quand la caméra est inutilisable et qu'ils sont la seule issue.
 * En comparaison, la colonne B a son propre bouton « Saisir code » : le champ n'apparaît qu'à sa demande.
 */
const manualOpen = ref(false)
const manualVisible = computed(() => manualOpen.value || (cameraUnavailable.value && !compare.value))

const [DefineReadingFeedback, ReuseReadingFeedback] = createReusableTemplate()

const manualCode = ref('')
const manualError = ref<string>()

function submitManualCode() {
  const code = manualCode.value.replace(/\s/g, '')
  if (!/^\d{8,13}$/.test(code)) {
    manualError.value = 'Un code EAN compte 8 à 13 chiffres.'
    return
  }
  manualError.value = undefined
  lookup(code)
}

watch(manualCode, () => {
  manualError.value = undefined
})

// --- Import d'une photo ---

const fileInput = ref<HTMLInputElement | null>(null)
const photoDecoding = ref(false)
const photoError = ref<string>()

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  photoError.value = undefined
  photoDecoding.value = true
  try {
    const code = await detectBarcodeInFile(file)
    if (code) {
      lookup(code)
    } else {
      photoError.value = 'Aucun code-barres lisible sur cette photo. Cadrez-le de plus près, bien à plat et net.'
    }
  } catch {
    photoError.value = 'Cette photo n’a pas pu être lue. Réessayez avec une autre image.'
  } finally {
    photoDecoding.value = false
  }
}

// --- Recherche Open Food Facts ---

const { state, lookup: lookupProduct, retry, reset: resetLookup } = useOffProduct()

function lookup(code: string) {
  copied.value = false
  // En comparaison, le produit trouvé ira dans la colonne visée (B par défaut : le challenger).
  pendingSide.value = compare.value ? (compare.value.a ? compareTarget.value : 'a') : null
  lookupProduct(code)
}

const pretty = computed(() => (state.value.kind === 'done' ? JSON.stringify(state.value.data, null, 2) : ''))
const bytes = computed(() => (state.value.kind === 'done' ? new Blob([state.value.text]).size : 0))

const found = computed(() => state.value.kind === 'done' && state.value.data.status === 1)

const productName = computed(() => {
  if (state.value.kind !== 'done') return null
  const product = state.value.data.product
  return product?.product_name_fr || product?.product_name || null
})

const productBrand = computed(() => (state.value.kind === 'done' ? state.value.data.product?.brands || null : null))

/** Photo de face (l'emballage tel qu'on le reconnaît en rayon), à défaut la photo principale de la fiche. */
const productImage = computed(() => {
  if (!found.value || state.value.kind !== 'done') return null
  const product = state.value.data.product
  const full = product?.image_front_url || product?.image_url
  if (!full) return null
  return { full, thumb: product?.image_front_small_url || product?.image_small_url || full }
})

/** Lien d'image mort côté OFF : on retire la vignette plutôt que d'afficher une image cassée. */
const imageFailed = ref(false)
watch(productImage, () => {
  imageFailed.value = false
})

/** Le titre porte à lui seul le statut : un nom, ou « Produit introuvable ». */
const productTitle = computed(() => {
  if (!found.value) return 'Produit introuvable'
  return productName.value || 'Nom non renseigné'
})

const productMeta = computed(() => {
  if (state.value.kind !== 'done') return ''
  if (!found.value) return `Le code ${state.value.code} n’existe pas encore dans Open Food Facts.`
  return [productBrand.value, `EAN ${state.value.code}`].filter(Boolean).join(' · ')
})

const sizeLabel = computed(() => {
  if (state.value.kind !== 'done') return ''
  const kb = bytes.value / 1024
  return kb < 1 ? `${bytes.value} o` : `${kb.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`
})

/**
 * Coloration du JSON en niveaux de gris, à la manière d'une étiquette : clés en retrait, valeurs en encre forte,
 * `null` en encre estompée comme une valeur manquante, ponctuation à peine visible.
 */
const highlightedJson = computed(() => {
  if (state.value.kind !== 'done') return ''
  const escaped = pretty.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, string?: string, colon?: string, boolean?: string) => {
      if (string && colon) return `<span class="json-key">${string}</span>${colon}`
      if (string) return `<span class="json-string">${string}</span>`
      if (boolean) return `<span class="json-literal">${match}</span>`
      if (match === 'null') return `<span class="json-null">${match}</span>`
      return `<span class="json-number">${match}</span>`
    },
  )
})

// --- Création de l'ingrédient ---

const ingredientFormOpen = ref(false)
const ingredientPrefill = shallowRef<IngredientPrefill | null>(null)
/** Ingrédient du catalogue ouvert en modification depuis le comparateur ; `null` = création. */
const editedIngredient = shallowRef<Ingredient | null>(null)

function createIngredient() {
  if (state.value.kind !== 'done' || !state.value.data.product) return
  editedIngredient.value = null
  ingredientPrefill.value = ingredientPrefillFromOff(state.value.code, state.value.data.product)
  ingredientFormOpen.value = true
}

// --- Comparaison ---

type CompareSide = 'a' | 'b'

/**
 * Duel en cours : A fixé, B à remplir puis remplacé à chaque nouveau scan. Gardé le temps de la session, jamais en base.
 * Les deux côtés vides : le comparateur reste ouvert, il attend un premier produit (seul « Terminer » le ferme).
 */
const compare = ref<{ a: CompareItem | null, b: CompareItem | null } | null>(null)
/** Colonne que remplira le prochain produit trouvé. */
const compareTarget = ref<CompareSide>('b')
/** Colonne qui attend la réponse d'Open Food Facts (gardée sur une erreur, pour « Réessayer »). */
const pendingSide = ref<CompareSide | null>(null)

const COMPARE_STORAGE_KEY = 'mealfit:product-compare'

const route = useRoute()
const router = useRouter()

/** Comparateur ouvert depuis la liste de courses : « Terminer » y ramène, en mode Acheter. */
const compareReturn = ref<'courses' | null>(null)
const COMPARE_RETURN_STORAGE_KEY = 'mealfit:product-compare-return'

watch(compareReturn, (value) => {
  try {
    if (value) sessionStorage.setItem(COMPARE_RETURN_STORAGE_KEY, value)
    else sessionStorage.removeItem(COMPARE_RETURN_STORAGE_KEY)
  } catch {
    // Sans stockage, le retour vaut pour la page ouverte seulement.
  }
})

onMounted(async () => {
  try {
    const saved = sessionStorage.getItem(COMPARE_STORAGE_KEY)
    if (saved) compare.value = JSON.parse(saved)
    if (saved && sessionStorage.getItem(COMPARE_RETURN_STORAGE_KEY) === 'courses') compareReturn.value = 'courses'
  } catch {
    // Stockage indisponible ou illisible : on repart sans duel.
  }

  // Ouvert depuis la liste de courses (`?compare=<id d'ingrédient>`, vide pour un ajout manuel) : nouveau duel,
  // l'ingrédient en A dès que le catalogue est chargé. Le paramètre est retiré pour qu'un rechargement ne le rejoue pas.
  const requested = route.query.compare
  if (typeof requested !== 'string') return
  const from = route.query.from
  router.replace({ query: { ...route.query, compare: undefined, from: undefined } })
  openEmptyCompare()
  compareReturn.value = from === 'courses' ? 'courses' : null
  if (!requested) return
  await ingredients.promise.value
  const ingredient = ingredientsById.value.get(requested)
  const item = ingredient && compareItemFromIngredient(ingredient)
  if (item && compare.value && !compare.value.a) compare.value = { a: item, b: null }
})

watch(compare, (value) => {
  try {
    if (value) sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(COMPARE_STORAGE_KEY)
  } catch {
    // Le duel vit alors seulement dans la page.
  }
}, { deep: true })

function place(side: CompareSide, item: CompareItem) {
  if (!compare.value) return
  // Comparateur vide : le premier produit prend la place de A, quelle que soit la colonne visée.
  compare.value = side === 'a' || !compare.value.a ? { ...compare.value, a: item } : { ...compare.value, b: item }
  compareTarget.value = 'b'
  closeReadingInputs()
}

/** Le duel n'a pas de bloc de scan : le champ de code et les erreurs de lecture se referment une fois servis. */
function closeReadingInputs() {
  manualOpen.value = false
  manualCode.value = ''
  photoError.value = undefined
}

function startCompare() {
  if (state.value.kind !== 'done' || !state.value.data.product) return
  compare.value = { a: compareItemFromOff(state.value.code, state.value.data.product), b: null }
  compareReturn.value = null
  compareTarget.value = 'b'
  closeReadingInputs()
}

/** Depuis l'accueil de la page, avant tout scan : le comparateur s'ouvre vide, A à remplir en premier. */
function openEmptyCompare() {
  compare.value = { a: null, b: null }
  compareReturn.value = null
  compareTarget.value = 'b'
  closeReadingInputs()
}

function endCompare() {
  const returnTo = compareReturn.value
  compare.value = null
  compareReturn.value = null
  pendingSide.value = null
  compareTarget.value = 'b'
  closeReadingInputs()
  if (returnTo === 'courses') router.push({ path: '/dashboard/liste-courses', query: { mode: 'acheter' } })
}

/** Retirer B libère sa colonne ; retirer A fait passer B en A ; retirer le seul produit laisse le comparateur vide, ouvert. */
function removeFromCompare(side: CompareSide) {
  if (!compare.value) return
  const kept = side === 'a' ? compare.value.b : compare.value.a
  compare.value = { a: kept, b: null }
  compareTarget.value = 'b'
}

function swapCompare() {
  if (!compare.value?.a || !compare.value.b) return
  compare.value = { a: compare.value.b, b: compare.value.a }
}

watch(state, (current) => {
  const side = pendingSide.value
  if (!side || !compare.value) return
  if (current.kind === 'done') {
    pendingSide.value = null
    if (current.data.status === 1 && current.data.product) place(side, compareItemFromOff(current.code, current.data.product))
  }
})

const compareLoadingSide = computed(() => (state.value.kind === 'loading' ? pendingSide.value : null))

/** Produit introuvable pendant un duel : signalé au-dessus, le duel reste tel quel. */
const compareNotFoundCode = computed(() =>
  compare.value && state.value.kind === 'done' && state.value.data.status !== 1 ? state.value.code : null,
)

function scanFor(side: CompareSide) {
  compareTarget.value = side
  openScanner()
}

function photoFor(side: CompareSide) {
  compareTarget.value = side
  fileInput.value?.click()
}

/** Ouvre la saisie du code en tête de page et y place le curseur. */
async function manualFor(side: CompareSide) {
  compareTarget.value = side
  manualOpen.value = true
  await nextTick()
  const input = document.querySelector<HTMLInputElement>('#manual-form input')
  input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  input?.focus({ preventScroll: true })
}

const catalogOpen = ref(false)

// Scanner ou catalogue fermé sans choix après « Changer » sur A : la photo ou le code saisi ensuite visent de nouveau B.
// Le produit choisi est émis avant la fermeture : il est déjà placé.
watch([scannerOpen, catalogOpen], ([scanning, picking]) => {
  if (!scanning && !picking) compareTarget.value = 'b'
})

function catalogFor(side: CompareSide) {
  compareTarget.value = side
  catalogOpen.value = true
}

/** Ingrédient du catalogue déjà en face de la colonne visée, signalé dans la liste. */
const facingCatalogId = computed(() => {
  const facing = compare.value?.[compareTarget.value === 'a' ? 'b' : 'a']
  return facing?.source === 'catalog' ? facing.id : undefined
})

function onCatalogPick(ingredient: Ingredient) {
  const item = compareItemFromIngredient(ingredient)
  if (item) place(compareTarget.value, item)
}

function createIngredientFrom(side: CompareSide) {
  const item = compare.value?.[side]
  if (!item?.off) return
  editedIngredient.value = null
  ingredientPrefill.value = ingredientPrefillFromOff(item.id, item.off)
  ingredientFormOpen.value = true
}

const { ingredients, ingredientsById, recipes } = useFoodCatalog()
const user = useCurrentUser()

/** Comme sur la page Ingrédients : seuls ses propres ingrédients se modifient, pas ceux du catalogue public. */
const ownedCatalogIngredient = (item: CompareItem | null | undefined) => {
  if (item?.source !== 'catalog') return null
  const ingredient = ingredientsById.value.get(item.id)
  return ingredient?.owner && ingredient.owner === user.value?.uid ? ingredient : null
}

const compareEditable = computed(() => ({
  a: !!ownedCatalogIngredient(compare.value?.a),
  b: !!ownedCatalogIngredient(compare.value?.b),
}))

function editIngredientFrom(side: CompareSide) {
  const ingredient = ownedCatalogIngredient(compare.value?.[side])
  if (!ingredient) return
  editedIngredient.value = ingredient
  ingredientPrefill.value = null
  ingredientFormOpen.value = true
}

/** Un ingrédient du catalogue modifié (ici ou ailleurs) : sa colonne reprend ses nouvelles valeurs. */
watch(ingredientsById, (byId) => {
  if (!compare.value) return
  const refreshed = (item: CompareItem | null) => {
    if (item?.source !== 'catalog') return item
    const ingredient = byId.get(item.id)
    return (ingredient && compareItemFromIngredient(ingredient)) || item
  }
  const a = refreshed(compare.value.a)
  const b = refreshed(compare.value.b)
  if (JSON.stringify({ a, b }) !== JSON.stringify(compare.value)) compare.value = { a, b }
})


/** Le JSON brut reste disponible mais replié : la lecture commence par le relevé nutritionnel. */
const jsonOpen = ref(false)

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const toast = useToast()

async function copyJson() {
  if (state.value.kind !== 'done') return
  try {
    await navigator.clipboard.writeText(pretty.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 2000)
  } catch {
    toast.add({ title: 'Copie impossible', description: 'Le navigateur a refusé l’accès au presse-papiers.', color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel
    id="scanner-produit"
    :ui="{ body: 'min-h-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Scanner produit">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col p-4 sm:p-6 overflow-auto">
        <div class="w-full max-w-2xl flex flex-col gap-6 text-default">
          <!-- Retours de lecture et saisie du code : sous le bouton de scan, ou sous « Comparer » pendant un duel. -->
          <DefineReadingFeedback>
            <UAlert
              v-if="scannerError"
              color="neutral"
              variant="subtle"
              icon="i-lucide-camera-off"
              :description="SCANNER_ERRORS[scannerError]"
              :close="!cameraUnavailable"
              @update:open="scannerError = null"
            />

            <p v-if="photoError" role="alert" class="text-sm text-error">
              {{ photoError }}
            </p>

            <form v-if="manualVisible" id="manual-form" novalidate @submit.prevent="submitManualCode">
              <UFormField label="Code EAN" :error="manualError" :ui="{ label: 'font-medium' }">
                <div class="flex gap-2">
                  <UInput
                    v-model="manualCode"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="3017624010701"
                    variant="outline"
                    class="min-w-0 flex-1"
                    :autofocus="manualOpen"
                    :ui="{ base: 'tabular-nums' }"
                  />
                  <UButton type="submit" color="neutral" variant="outline">
                    Rechercher
                  </UButton>
                </div>
              </UFormField>
            </form>
          </DefineReadingFeedback>

          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onPhotoSelected"
          >

          <section v-if="!compare" class="flex flex-col gap-3" aria-label="Lire un code-barres">
            <UButton
              size="xl"
              block
              icon="i-lucide-scan-barcode"
              class="justify-center"
              :disabled="cameraUnavailable"
              @click="openScanner"
            >
              Scanner un code-barres
            </UButton>

            <div class="flex flex-wrap items-center gap-x-1 text-sm text-muted">
              <span>Sans caméra :</span>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                class="px-0.5 font-medium text-highlighted"
                :loading="photoDecoding"
                @click="fileInput?.click()"
              >
                {{ photoDecoding ? 'Lecture de la photo…' : 'Importer une photo' }}
              </UButton>
              <template v-if="!manualVisible">
                <span aria-hidden="true" class="text-dimmed">·</span>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  class="px-0.5 font-medium text-highlighted"
                  @click="manualOpen = true"
                >
                  Saisir le code
                </UButton>
              </template>
            </div>

            <ReuseReadingFeedback />

            <!-- Avant tout scan : ouvrir le comparateur vide. Une fiche affichée a son propre « Comparer ». -->
            <UButton
              v-if="!found"
              size="xl"
              block
              color="neutral"
              variant="outline"
              icon="i-lucide-columns-2"
              class="justify-center"
              @click="openEmptyCompare"
            >
              Comparer deux produits
            </UButton>
          </section>

          <Transition name="reveal" mode="out-in">
            <section v-if="compare" key="compare" class="flex flex-col gap-3" aria-labelledby="compare-title">
              <h2 id="compare-title" class="pt-2 text-xl sm:text-2xl font-bold tracking-tight text-highlighted">
                Comparer
              </h2>

              <ReuseReadingFeedback />

              <UAlert
                v-if="state.kind === 'error' && pendingSide"
                color="error"
                variant="subtle"
                icon="i-lucide-wifi-off"
                title="Open Food Facts ne répond pas"
                :description="`La fiche du code ${state.code} n’a pas pu être chargée. Le duel reste tel quel.`"
                :actions="[{ label: 'Réessayer', color: 'error', variant: 'outline', icon: 'i-lucide-rotate-ccw', onClick: retry }]"
                orientation="horizontal"
              />
              <UAlert
                v-else-if="compareNotFoundCode"
                color="neutral"
                variant="subtle"
                icon="i-lucide-search-x"
                title="Produit introuvable"
                :description="`Le code ${compareNotFoundCode} n’existe pas encore dans Open Food Facts. Le duel reste tel quel.`"
                close
                @update:open="resetLookup"
              />

              <ProductCompareTable
                :a="compare.a"
                :b="compare.b"
                :loading-side="compareLoadingSide"
                :photo-decoding="photoDecoding"
                @scan="scanFor"
                @photo="photoFor"
                @manual="manualFor"
                @catalog="catalogFor"
                @swap="swapCompare"
                @create-ingredient="createIngredientFrom"
                :editable="compareEditable"
                @remove="removeFromCompare"
                @edit="editIngredientFrom"
              />

              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-x"
                block
                class="justify-center sm:w-auto sm:self-end"
                @click="endCompare"
              >
                Terminer
              </UButton>
            </section>

            <div
              v-else-if="state.kind === 'loading'"
              key="loading"
              class="flex flex-col gap-4"
              aria-busy="true"
              aria-label="Recherche du produit"
            >
              <USkeleton class="h-24 rounded-xl" />
              <USkeleton class="h-80 rounded-xl" />
            </div>

            <UAlert
              v-else-if="state.kind === 'error'"
              key="error"
              color="error"
              variant="subtle"
              icon="i-lucide-wifi-off"
              title="Open Food Facts ne répond pas"
              :description="`La fiche du code ${state.code} n’a pas pu être chargée. Vérifiez la connexion, puis réessayez.`"
              :actions="[{ label: 'Réessayer', color: 'error', variant: 'outline', icon: 'i-lucide-rotate-ccw', onClick: retry }]"
            />

            <div v-else-if="state.kind === 'done'" :key="`done-${state.code}`" class="flex flex-col gap-4">
              <header class="flex flex-col gap-3 pt-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div class="flex min-w-0 items-start gap-4">
                  <!-- Fond blanc fixe, même en sombre : les photos OFF sont détourées sur blanc. -->
                  <a
                    v-if="productImage && !imageFailed"
                    :href="productImage.full"
                    target="_blank"
                    rel="noopener"
                    class="shrink-0 grid size-20 sm:size-24 place-items-center overflow-hidden rounded-lg border border-default bg-white p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    :aria-label="`Voir la photo de ${productName || 'ce produit'} en grand`"
                  >
                    <img
                      :src="productImage.thumb"
                      :alt="productName || 'Photo du produit'"
                      class="max-h-full max-w-full object-contain"
                      referrerpolicy="no-referrer"
                      @error="imageFailed = true"
                    >
                  </a>
                  <div class="flex min-w-0 flex-col gap-1">
                    <h2
                      class="text-xl sm:text-2xl font-bold tracking-tight text-balance wrap-break-word"
                      :class="found && !productName ? 'text-dimmed' : 'text-highlighted'"
                    >
                      {{ productTitle }}
                    </h2>
                    <p class="text-sm text-muted tabular-nums wrap-break-word">
                      {{ productMeta }}
                    </p>
                  </div>
                </div>
                <div v-if="found" class="max-sm:hidden flex shrink-0 flex-col gap-2">
                  <UButton
                    icon="i-lucide-plus"
                    class="justify-center"
                    @click="createIngredient"
                  >
                    Créer l’ingrédient
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-columns-2"
                    class="justify-center"
                    @click="startCompare"
                  >
                    Comparer
                  </UButton>
                </div>
              </header>

              <template v-if="found && state.data.product">
                <ProductNutritionFacts :product="state.data.product" />
                <NutriScoreScale :grade="state.data.product.nutriscore_grade" />
              </template>

              <section class="rounded-xl border border-default flex flex-col overflow-hidden" aria-labelledby="json-title">
                <div class="flex items-center justify-between gap-3 pr-2" :class="{ 'border-b border-default': jsonOpen }">
                  <h2 class="flex-1 min-w-0">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      :aria-expanded="jsonOpen"
                      aria-controls="json-body"
                      @click="jsonOpen = !jsonOpen"
                    >
                      <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed transition-transform duration-200" :class="{ 'rotate-90': jsonOpen }" />
                      <span id="json-title" class="text-sm font-semibold text-muted truncate">Réponse JSON</span>
                      <span class="text-xs text-dimmed tabular-nums shrink-0">{{ sizeLabel }}</span>
                    </button>
                  </h2>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                    @click="copyJson"
                  >
                    {{ copied ? 'Copié' : 'Copier' }}
                  </UButton>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -- JSON échappé avant coloration -->
                <pre v-show="jsonOpen" id="json-body" class="json-view max-h-[60vh] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word" tabindex="0" aria-label="Réponse JSON" v-html="highlightedJson" />
              </section>

              <!-- Sur mobile, l'action clôt la fiche : on la rencontre après avoir tout lu, plutôt qu'en tête. -->
              <UButton
                v-if="found"
                icon="i-lucide-plus"
                block
                class="sm:hidden justify-center"
                @click="createIngredient"
              >
                Créer l’ingrédient
              </UButton>
              <UButton
                v-if="found"
                color="neutral"
                variant="outline"
                icon="i-lucide-columns-2"
                block
                class="sm:hidden -mt-2 justify-center"
                @click="startCompare"
              >
                Comparer
              </UButton>
            </div>

            <UEmpty
              v-else
              key="empty"
              icon="i-lucide-scan-barcode"
              title="Aucun produit scanné"
              description="Scannez un code-barres, importez une photo ou saisissez le code : la réponse d’Open Food Facts s’affichera ici."
              class="rounded-xl border border-default ring-0"
            />
          </Transition>
        </div>
      </div>

      <ProductScannerOverlay
        v-model:open="scannerOpen"
        @detected="lookup"
        @error="onScannerError"
      />

      <IngredientComparePickerModal
        v-if="compare"
        v-model:open="catalogOpen"
        :current-id="facingCatalogId"
        @pick="onCatalogPick"
      />

      <IngredientFormSlideover
        v-model:open="ingredientFormOpen"
        :ingredient="editedIngredient"
        :recipes="recipes"
        :prefill="ingredientPrefill"
      />
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.json-view {
  color: var(--ui-text-dimmed);
  tab-size: 2;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-border-accented) transparent;
}

.json-view::selection,
.json-view :deep(*::selection) {
  background: color-mix(in oklab, var(--ui-primary) 22%, transparent);
}

.json-view :deep(.json-key) {
  color: var(--ui-text-muted);
}

.json-view :deep(.json-string) {
  color: var(--ui-text-highlighted);
}

.json-view :deep(.json-number),
.json-view :deep(.json-literal) {
  color: var(--ui-text-highlighted);
  font-weight: 600;
}

.json-view :deep(.json-null) {
  color: var(--ui-text-dimmed);
  font-style: italic;
}
</style>
