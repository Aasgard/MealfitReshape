<script setup lang="ts">
import { detectBarcodeInFile, SCANNER_ERROR_MESSAGES } from '~/composables/useBarcodeScanner'
import type { ScannerErrorKind } from '~/composables/useBarcodeScanner'
import type { IsbnBook } from '~/composables/useIsbnLookup'
import { isIsbn13, normalizeIsbn } from '~/utils/books'

/**
 * Lecture de l'ISBN d'un livre : caméra, photo du code-barres ou saisie, puis recherche Google Books / Open Library.
 * Émet l'ISBN et la fiche trouvée (`null` si aucun service ne la connaît) ; le parent remplit son formulaire.
 */
const emit = defineEmits<{
  found: [isbn: string, book: IsbnBook | null]
}>()

const { state, lookup, retry, reset } = useIsbnLookup()

const scannerOpen = ref(false)
const scannerError = ref<ScannerErrorKind | null>(null)
/** Code lu qui n'est pas un ISBN : un code de produit, ou le petit code du prix à côté. */
const notIsbnCode = ref<string | null>(null)

const cameraUnavailable = computed(() => scannerError.value === 'no-camera' || scannerError.value === 'insecure')

onMounted(() => {
  if (!navigator.mediaDevices?.getUserMedia) {
    scannerError.value = window.isSecureContext ? 'no-camera' : 'insecure'
  }
})

function openScanner() {
  scannerError.value = null
  notIsbnCode.value = null
  scannerOpen.value = true
}

defineExpose({ openScanner })

function onCode(code: string) {
  if (!isIsbn13(code)) {
    notIsbnCode.value = code
    return
  }
  notIsbnCode.value = null
  lookup(code)
}

// --- Code saisi ---

const manualOpen = ref(false)
const manualCode = ref('')
const manualError = ref<string>()

function submitManualCode() {
  const isbn = normalizeIsbn(manualCode.value)
  if (!isbn) {
    manualError.value = 'Un ISBN compte 13 chiffres (978… ou 979…), ou 10 pour les livres plus anciens.'
    return
  }
  manualError.value = undefined
  notIsbnCode.value = null
  lookup(isbn)
}

watch(manualCode, () => {
  manualError.value = undefined
})

// --- Photo importée ---

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
    if (code) onCode(code)
    else photoError.value = 'Aucun code-barres lisible sur cette photo. Cadrez-le de plus près, bien à plat et net.'
  } catch {
    photoError.value = 'Cette photo n’a pas pu être lue. Réessayez avec une autre image.'
  } finally {
    photoDecoding.value = false
  }
}

// --- Résultat ---

watch(state, (current) => {
  if (current.kind !== 'done') return
  emit('found', current.isbn, current.book)
  reset()
  manualOpen.value = false
  manualCode.value = ''
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <USkeleton
      v-if="state.kind === 'loading'"
      class="h-8 rounded-md"
      aria-busy="true"
      aria-label="Recherche du livre"
    />

    <template v-else>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-scan-barcode"
          class="flex-1 justify-center"
          :disabled="cameraUnavailable"
          @click="openScanner"
        >
          Scanner le code-barres
        </UButton>
        <UTooltip :text="photoDecoding ? 'Lecture de la photo…' : 'Importer une photo du code'">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-image-up"
            :loading="photoDecoding"
            :aria-label="photoDecoding ? 'Lecture de la photo…' : 'Importer une photo du code'"
            @click="fileInput?.click()"
          />
        </UTooltip>
        <UTooltip text="Saisir l'ISBN">
          <UButton
            color="neutral"
            :variant="manualOpen ? 'soft' : 'outline'"
            icon="i-lucide-keyboard"
            aria-label="Saisir l'ISBN"
            :aria-pressed="manualOpen"
            @click="manualOpen = !manualOpen"
          />
        </UTooltip>
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

      <form v-if="manualOpen" novalidate class="flex flex-col gap-1" @submit.prevent="submitManualCode">
        <div class="flex gap-2">
          <UInput
            v-model="manualCode"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="ISBN, ex : 9782501084543"
            aria-label="ISBN"
            variant="outline"
            class="min-w-0 flex-1"
            autofocus
            :color="manualError ? 'error' : undefined"
            :highlight="!!manualError"
            :ui="{ base: 'tabular-nums' }"
          />
          <UButton type="submit" color="neutral" variant="outline">
            Rechercher
          </UButton>
        </div>
        <p v-if="manualError" role="alert" class="text-xs text-error">
          {{ manualError }}
        </p>
      </form>

      <p v-if="photoError" role="alert" class="text-xs text-error text-center">
        {{ photoError }}
      </p>

      <UAlert
        v-if="notIsbnCode"
        color="neutral"
        variant="subtle"
        icon="i-lucide-barcode"
        title="Ce n'est pas un ISBN"
        :description="`Le code ${notIsbnCode} ne commence pas par 978 ou 979. Visez le code-barres au dos du livre, souvent près du prix.`"
        close
        @update:open="notIsbnCode = null"
      />

      <UAlert
        v-if="scannerError"
        color="neutral"
        variant="subtle"
        icon="i-lucide-camera-off"
        :description="SCANNER_ERROR_MESSAGES[scannerError]"
        :close="!cameraUnavailable"
        @update:open="scannerError = null"
      />

      <UAlert
        v-if="state.kind === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-wifi-off"
        title="Recherche impossible"
        :description="`Google Books et Open Library ne répondent pas pour l'ISBN ${state.isbn}.`"
        :actions="[{ label: 'Réessayer', color: 'error', variant: 'outline', icon: 'i-lucide-rotate-ccw', onClick: retry }]"
        orientation="horizontal"
      />
    </template>

    <ProductScannerOverlay
      v-model:open="scannerOpen"
      @detected="onCode"
      @error="scannerError = $event"
    />
  </div>
</template>
