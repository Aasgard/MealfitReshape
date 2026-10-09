<script setup lang="ts">
import type { ScannerErrorKind } from '~/composables/useBarcodeScanner'
import { ingredientPrefillFromOff } from '~/utils/offNutrition'
import type { IngredientPrefill, OffProduct } from '~/utils/offNutrition'

useSeoMeta({
  title: 'Dashboard - Scanner produit - Mealfit',
  description: 'Dashboard - Scanner produit - Mealfit',
})

// Pas de zoom, comme sur l'accueil : la balise viewport le bloque sur Android, `touch-action` sur iOS (qui ignore user-scalable).
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }],
  htmlAttrs: { class: 'touch-pan-x touch-pan-y' },
})

const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/'

const scannerOpen = ref(false)
const scannerError = ref<ScannerErrorKind | null>(null)

const SCANNER_ERRORS: Record<ScannerErrorKind, string> = {
  'denied': 'Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, ou importez une photo du code-barres.',
  'no-camera': 'Aucune caméra disponible sur cet appareil. Importez une photo du code-barres ou saisissez-le.',
  'busy': 'La caméra est utilisée par une autre application. Fermez-la, puis réessayez.',
  'insecure': 'La caméra n’est accessible que sur une adresse sécurisée (https). Importez une photo ou saisissez le code.',
  'decoder': 'Le module de lecture des codes-barres n’a pas pu se charger. Vérifiez la connexion, puis réessayez.',
  'unknown': 'La caméra n’a pas pu démarrer. Réessayez, ou importez une photo du code-barres.',
}

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

/** Recours rares : repliés derrière une ligne, sauf quand la caméra est inutilisable et qu'ils sont la seule issue. */
const manualOpen = ref(false)
const manualVisible = computed(() => manualOpen.value || cameraUnavailable.value)

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

type OffResponse = {
  code?: string
  status?: number
  status_verbose?: string
  product?: OffProduct & {
    nutriscore_grade?: string
    image_front_url?: string
    image_front_small_url?: string
    image_url?: string
    image_small_url?: string
  }
}

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading', code: string }
  | { kind: 'error', code: string }
  | { kind: 'done', code: string, data: OffResponse, pretty: string, bytes: number }

const state = shallowRef<LookupState>({ kind: 'idle' })
let controller: AbortController | null = null

async function lookup(code: string) {
  controller?.abort()
  const current = new AbortController()
  controller = current
  state.value = { kind: 'loading', code }
  copied.value = false

  try {
    const response = await fetch(`${OFF_PRODUCT_URL}${code}.json`, { signal: current.signal })
    const text = await response.text()
    // Produit inconnu : Open Food Facts répond 404 avec un JSON `status: 0`, qu'on affiche comme le reste.
    const data = JSON.parse(text) as OffResponse
    state.value = {
      kind: 'done',
      code,
      data,
      pretty: JSON.stringify(data, null, 2),
      bytes: new Blob([text]).size,
    }
  } catch (error) {
    if (current.signal.aborted) return
    console.error('Recherche Open Food Facts impossible', error)
    state.value = { kind: 'error', code }
  }
}

function retry() {
  if (state.value.kind === 'error') lookup(state.value.code)
}

onBeforeUnmount(() => controller?.abort())

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
  const kb = state.value.bytes / 1024
  return kb < 1 ? `${state.value.bytes} o` : `${kb.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`
})

/**
 * Coloration du JSON en niveaux de gris, à la manière d'une étiquette : clés en retrait, valeurs en encre forte,
 * `null` en encre estompée comme une valeur manquante, ponctuation à peine visible.
 */
const highlightedJson = computed(() => {
  if (state.value.kind !== 'done') return ''
  const escaped = state.value.pretty
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

function createIngredient() {
  if (state.value.kind !== 'done' || !state.value.data.product) return
  ingredientPrefill.value = ingredientPrefillFromOff(state.value.code, state.value.data.product)
  ingredientFormOpen.value = true
}

/** Le JSON brut reste disponible mais replié : la lecture commence par le relevé nutritionnel. */
const jsonOpen = ref(false)

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const toast = useToast()

async function copyJson() {
  if (state.value.kind !== 'done') return
  try {
    await navigator.clipboard.writeText(state.value.pretty)
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
          <section class="flex flex-col gap-3" aria-label="Lire un code-barres">
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

            <UAlert
              v-if="scannerError"
              color="neutral"
              variant="subtle"
              icon="i-lucide-camera-off"
              :description="SCANNER_ERRORS[scannerError]"
              :close="!cameraUnavailable"
              @update:open="scannerError = null"
            />

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
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                @change="onPhotoSelected"
              >
            </div>

            <p v-if="photoError" role="alert" class="-mt-1 text-sm text-error">
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
          </section>

          <Transition name="reveal" mode="out-in">
            <div
              v-if="state.kind === 'loading'"
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
                <UButton
                  v-if="found"
                  icon="i-lucide-plus"
                  class="max-sm:hidden shrink-0"
                  @click="createIngredient"
                >
                  Créer l’ingrédient
                </UButton>
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

      <IngredientFormSlideover
        v-model:open="ingredientFormOpen"
        :ingredient="null"
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
