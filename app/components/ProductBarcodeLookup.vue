<script setup lang="ts">
import { detectBarcodeInFile, SCANNER_ERROR_MESSAGES } from '~/composables/useBarcodeScanner'
import type { ScannerErrorKind } from '~/composables/useBarcodeScanner'
import type { OffProductDetails } from '~/utils/offNutrition'

/**
 * Lecture d'un code-barres : caméra, photo importée ou code saisi, puis recherche Open Food Facts.
 * Émet la fiche trouvée ; le parent en tire ce qu'il lui faut (macros d'un repas, champs d'un ingrédient).
 */
const emit = defineEmits<{
  found: [code: string, product: OffProductDetails]
}>()

const { state, lookup, retry, reset } = useOffProduct()

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

defineExpose({ openScanner })

// --- Code saisi ---

const manualOpen = ref(false)
const toggleManual = () => {
  manualOpen.value = !manualOpen.value
}
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
    if (code) lookup(code)
    else photoError.value = 'Aucun code-barres lisible sur cette photo. Cadrez-le de plus près, bien à plat et net.'
  } catch {
    photoError.value = 'Cette photo n’a pas pu être lue. Réessayez avec une autre image.'
  } finally {
    photoDecoding.value = false
  }
}

// --- Résultat ---

/** Produit trouvé : remis au parent, et le bloc revient à son état initial pour un prochain scan. */
watch(state, (current) => {
  if (current.kind !== 'done' || current.data.status !== 1 || !current.data.product) return
  emit('found', current.code, current.data.product)
  reset()
  manualOpen.value = false
  manualCode.value = ''
})

const notFoundCode = computed(() =>
  state.value.kind === 'done' && state.value.data.status !== 1 ? state.value.code : null,
)
</script>

<template>
  <div class="flex flex-col gap-2">
    <USkeleton
      v-if="state.kind === 'loading'"
      class="h-[4.5rem] rounded-lg"
      aria-busy="true"
      aria-label="Recherche du produit"
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
          Scanner un produit
        </UButton>
        <UTooltip :text="photoDecoding ? 'Lecture de la photo…' : 'Importer une photo'">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-image-up"
            :loading="photoDecoding"
            :aria-label="photoDecoding ? 'Lecture de la photo…' : 'Importer une photo'"
            @click="fileInput?.click()"
          />
        </UTooltip>
        <UTooltip text="Saisir le code">
          <UButton
            color="neutral"
            :variant="manualOpen ? 'soft' : 'outline'"
            icon="i-lucide-keyboard"
            aria-label="Saisir le code"
            :aria-pressed="manualOpen"
            @click="toggleManual"
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
            placeholder="Code EAN, ex : 3017624010701"
            aria-label="Code EAN"
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
        title="Open Food Facts ne répond pas"
        :description="`La fiche du code ${state.code} n’a pas pu être chargée.`"
        :actions="[{ label: 'Réessayer', color: 'error', variant: 'outline', icon: 'i-lucide-rotate-ccw', onClick: retry }]"
        orientation="horizontal"
      />

      <UAlert
        v-if="notFoundCode"
        color="neutral"
        variant="subtle"
        icon="i-lucide-search-x"
        title="Produit introuvable"
        :description="`Le code ${notFoundCode} n’est pas dans Open Food Facts : saisissez les valeurs de l’étiquette ci-dessous.`"
        close
        @update:open="reset"
      />
    </template>

    <ProductScannerOverlay
      v-model:open="scannerOpen"
      @detected="lookup"
      @error="scannerError = $event"
    />
  </div>
</template>
