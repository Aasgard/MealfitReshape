<script setup lang="ts">
import type { ScannerErrorKind } from '~/composables/useBarcodeScanner'

useSeoMeta({
  title: 'Dashboard - Scanner produit - Mealfit',
  description: 'Dashboard - Scanner produit - Mealfit',
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
  product?: { product_name?: string, product_name_fr?: string, brands?: string }
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
  manualCode.value = code
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
          <section class="rounded-xl border border-default p-4 sm:p-5 flex flex-col gap-4" aria-labelledby="scan-title">
            <div class="flex flex-col gap-1">
              <h2 id="scan-title" class="text-lg font-bold tracking-tight text-highlighted">
                Lire un code-barres
              </h2>
              <p class="text-sm text-muted">
                Visez le code-barres d’un emballage pour récupérer sa fiche Open Food Facts.
              </p>
            </div>

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

            <div class="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-6 gap-y-4 border-t border-default pt-4">
              <UFormField label="Depuis une photo" :error="photoError" :ui="{ label: 'font-medium', error: 'max-w-xs' }">
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-image-up"
                  :loading="photoDecoding"
                  @click="fileInput?.click()"
                >
                  {{ photoDecoding ? 'Lecture…' : 'Importer une photo' }}
                </UButton>
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  class="sr-only"
                  tabindex="-1"
                  aria-hidden="true"
                  @change="onPhotoSelected"
                >
              </UFormField>

              <form novalidate @submit.prevent="submitManualCode">
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
                      :ui="{ base: 'tabular-nums' }"
                    />
                    <UButton type="submit" color="neutral" variant="outline">
                      Rechercher
                    </UButton>
                  </div>
                </UFormField>
              </form>
            </div>
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
              <dl class="grid grid-cols-2 sm:grid-cols-[auto_auto_1fr] gap-px overflow-hidden rounded-xl border border-default bg-border">
                <div class="col-span-2 sm:col-span-1 bg-default p-4 flex flex-col gap-1">
                  <dt class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Code
                  </dt>
                  <dd class="text-2xl font-bold tabular-nums text-highlighted">
                    {{ state.code }}
                  </dd>
                </div>
                <div class="bg-default p-4 flex flex-col gap-1">
                  <dt class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Statut
                  </dt>
                  <dd class="flex items-center gap-1.5 text-sm font-medium" :class="found ? 'text-highlighted' : 'text-muted'">
                    <UIcon :name="found ? 'i-lucide-check' : 'i-lucide-search-x'" class="size-4 shrink-0" />
                    {{ found ? 'Produit trouvé' : 'Introuvable' }}
                  </dd>
                </div>
                <div class="bg-default p-4 flex flex-col gap-1 min-w-0">
                  <dt class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Produit
                  </dt>
                  <dd class="text-base font-semibold text-highlighted wrap-break-word" :class="{ 'text-dimmed! font-normal': !productName }">
                    {{ productName || (found ? 'Nom non renseigné' : '—') }}
                  </dd>
                  <dd class="text-xs text-muted wrap-break-word">
                    {{ productBrand || (found ? '—' : 'Ce code n’existe pas encore dans Open Food Facts.') }}
                  </dd>
                </div>
              </dl>

              <section class="rounded-xl border border-default flex flex-col overflow-hidden" aria-labelledby="json-title">
                <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-2.5">
                  <div class="flex items-baseline gap-2 min-w-0">
                    <h2 id="json-title" class="text-sm font-semibold text-highlighted truncate">
                      Réponse JSON
                    </h2>
                    <span class="text-xs text-dimmed tabular-nums shrink-0">{{ sizeLabel }}</span>
                  </div>
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
                <pre class="json-view max-h-[60vh] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word" tabindex="0" aria-label="Réponse JSON" v-html="highlightedJson" />
              </section>

              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-scan-barcode"
                block
                class="justify-center sm:w-auto sm:self-start"
                :disabled="cameraUnavailable"
                @click="openScanner"
              >
                Scanner un autre produit
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
