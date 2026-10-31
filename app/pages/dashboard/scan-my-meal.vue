<script setup lang="ts">
import { useCurrentUser } from 'vuefire'
import type { MacroEstimate } from '#shared/types/macroEstimate'

useSeoMeta({
  title: 'Dashboard - Scan My Meal - Mealfit',
  description: 'Dashboard - Scan My Meal - Mealfit',
})

const user = useCurrentUser()

// --- Photo : réduite dans le navigateur, jamais enregistrée ---

const photo = usePhotoDraft()
/** `capture` ouvre directement l'appareil photo sur mobile ; sans, le téléphone propose aussi la galerie et les fichiers. */
const cameraInput = ref<HTMLInputElement | null>(null)
const libraryInput = ref<HTMLInputElement | null>(null)

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await photo.pick(file)
}

function removePhoto() {
  photo.reset()
}

// --- Description : seule, ou en complément de la photo ---

const description = ref('')

// --- Estimation ---

const estimating = ref(false)
const estimate = ref<MacroEstimate | null>(null)
const estimateError = ref<string>()

const canEstimate = computed(() => !estimating.value && !photo.processing.value
  && (photo.blob.value !== null || description.value.trim() !== ''))

async function submit() {
  if (!canEstimate.value || !user.value) return

  estimating.value = true
  estimateError.value = undefined
  estimate.value = null
  try {
    const body = new FormData()
    if (photo.blob.value) body.append('photo', photo.blob.value, 'repas.jpg')
    body.append('description', description.value.trim())

    estimate.value = await $fetch<MacroEstimate>('/api/estimate-macros', {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${await user.value.getIdToken()}` },
    })
  } catch (error) {
    console.error('Estimation impossible :', error)
    // Message du serveur dans le corps JSON de l'erreur ; à défaut (hors ligne, délai dépassé), message générique.
    const serverMessage = (error as { data?: { message?: string } }).data?.message
    estimateError.value = serverMessage ?? 'L\'estimation a échoué. Vérifiez la connexion et réessayez.'
  } finally {
    estimating.value = false
  }
}

const RESULT_ROWS = [
  { key: 'kcal', label: 'Énergie', unit: 'kcal', dotClass: 'bg-accented' },
  { key: 'glucides', label: 'Glucides', unit: 'g', dotClass: 'bg-green-500' },
  { key: 'proteines', label: 'Protéines', unit: 'g', dotClass: 'bg-red-700' },
  { key: 'lipides', label: 'Lipides', unit: 'g', dotClass: 'bg-amber-500' },
] as const

const estimateJson = computed(() => estimate.value ? JSON.stringify(estimate.value, null, 2) : '')
</script>

<template>
  <UDashboardPanel id="scan-my-meal" :ui="{ body: 'min-h-0' }">
    <template #header>
      <UDashboardNavbar title="Scan My Meal">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col p-4 sm:p-6 overflow-auto">
        <div class="w-full max-w-2xl flex flex-col gap-6 text-default">
          <p class="text-sm text-muted">
            Photographiez votre repas, décrivez-le, ou les deux : Claude estime ses calories et ses macros.
            La photo n'est pas conservée.
          </p>

          <form class="flex flex-col gap-6" novalidate @submit.prevent="submit">
            <input
              ref="cameraInput"
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              @change="onPhotoSelected"
            >
            <input
              ref="libraryInput"
              type="file"
              accept="image/*"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              @change="onPhotoSelected"
            >

            <section class="flex flex-col gap-3" aria-label="Photo du repas">
              <div v-if="photo.objectUrl.value" class="relative overflow-hidden rounded-lg border border-default">
                <img :src="photo.objectUrl.value" alt="Photo du repas" class="w-full max-h-80 object-cover">
                <div class="absolute top-2 right-2 flex gap-2">
                  <UButton
                    color="neutral"
                    variant="solid"
                    size="sm"
                    icon="i-lucide-refresh-cw"
                    @click="libraryInput?.click()"
                  >
                    Changer
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="solid"
                    size="sm"
                    icon="i-lucide-x"
                    aria-label="Retirer la photo"
                    @click="removePhoto"
                  />
                </div>
              </div>

              <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UButton
                  size="xl"
                  block
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-camera"
                  class="justify-center"
                  :loading="photo.processing.value"
                  @click="cameraInput?.click()"
                >
                  Prendre une photo
                </UButton>
                <UButton
                  size="xl"
                  block
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-image"
                  class="justify-center"
                  :disabled="photo.processing.value"
                  @click="libraryInput?.click()"
                >
                  Importer une photo
                </UButton>
              </div>

              <p v-if="photo.error.value" role="alert" class="text-sm text-error">
                {{ photo.error.value }}
              </p>
            </section>

            <UFormField
              label="Description"
              :hint="photo.blob.value ? 'Facultative' : undefined"
              :ui="{ label: 'font-medium' }"
            >
              <UTextarea
                v-model="description"
                :rows="3"
                autoresize
                :maxlength="2000"
                :placeholder="photo.blob.value
                  ? 'Précisions : quantités, cuisson, sauce… ex. 150 g de pâtes cuites, une cuillère d\'huile d\'olive'
                  : 'Ex. une assiette de pâtes carbonara, une grosse portion, et un yaourt nature'"
                class="w-full"
              />
            </UFormField>

            <UButton
              type="submit"
              size="xl"
              block
              icon="i-lucide-sparkles"
              class="justify-center"
              :loading="estimating"
              :disabled="!canEstimate"
            >
              {{ estimating ? 'Estimation en cours…' : 'Estimer avec Claude' }}
            </UButton>
          </form>

          <UAlert
            v-if="estimateError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="estimateError"
          />

          <section v-if="estimate" class="flex flex-col gap-3" aria-label="Estimation">
            <h2 class="text-base font-semibold text-highlighted">
              Estimation
            </h2>

            <div class="overflow-hidden rounded-lg border border-default">
              <div
                v-for="row in RESULT_ROWS"
                :key="row.key"
                class="flex items-baseline gap-2 border-b border-default px-4 py-2.5 text-sm last:border-b-0"
              >
                <span class="size-2 rounded-full shrink-0 self-center" :class="row.dotClass" />
                <span class="text-highlighted">{{ row.label }}</span>
                <span class="ml-auto font-semibold tabular-nums text-highlighted">
                  {{ estimate[row.key] }} <span class="font-normal text-muted">{{ row.unit }}</span>
                </span>
              </div>
            </div>

            <details class="text-sm">
              <summary class="cursor-pointer text-muted hover:text-highlighted">
                Réponse JSON
              </summary>
              <pre class="mt-2 overflow-x-auto rounded-md bg-elevated p-3 text-xs text-default">{{ estimateJson }}</pre>
            </details>

            <p class="text-xs text-dimmed">
              Estimation indicative : une photo ne montre ni les quantités exactes ni les matières grasses cachées.
            </p>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
