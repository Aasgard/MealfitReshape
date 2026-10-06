<script setup lang="ts">
/**
 * Champ photo d'un formulaire : aperçu, prise de vue (appareils tactiles), choix d'un fichier, lien externe
 * (si `allowUrl`) et retrait. Le formulaire parent fournit l'aperçu et reçoit le fichier choisi ou le lien saisi.
 */
const props = defineProps<{
  label: string
  previewUrl: string | null
  alt: string
  placeholderIcon: string
  placeholderText: string
  processing?: boolean
  /** Avancement de l'envoi (0 → 1) ; `null` hors envoi. */
  uploadProgress?: number | null
  error?: string | null
  disabled?: boolean
  /** Ajoute un bouton « Lien » pour saisir l'URL d'une image externe (`v-model:url`). */
  allowUrl?: boolean
}>()

const url = defineModel<string>('url', { default: '' })

const emit = defineEmits<{
  pick: [file: File]
  remove: []
}>()

const cameraInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)
const urlOpen = ref(false)

const isLocked = computed(() => props.disabled || props.processing)

/**
 * Boutons de la ligne d'actions, à parts égales, icône et libellé sur une ligne. Sur mobile, jusqu'à 4 boutons
 * se partagent la largeur : marges, espacement et texte resserrés pour que les libellés ne soient pas tronqués.
 */
const actionClass = 'min-w-0 flex-1 justify-center gap-1 px-1 text-xs sm:gap-1.5 sm:px-2.5 sm:text-sm'
const actionUi = { leadingIcon: 'size-3.5 sm:size-4' }

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Vide le champ pour pouvoir choisir à nouveau le même fichier.
  input.value = ''
  if (file) emit('pick', file)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm font-medium text-default">{{ label }}</p>
    <div class="relative h-44 overflow-hidden rounded-xl border border-default bg-accented">
      <img
        v-if="previewUrl"
        :src="previewUrl"
        :alt="alt"
        class="size-full object-cover"
      >
      <div v-else class="flex size-full flex-col items-center justify-center gap-2 text-dimmed">
        <UIcon :name="placeholderIcon" class="size-7" />
        <p class="text-xs">{{ placeholderText }}</p>
      </div>

      <div v-if="processing" class="absolute inset-0 flex items-center justify-center bg-default/70">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
      </div>

      <div
        v-if="uploadProgress != null"
        class="absolute inset-x-3 bottom-3 h-2 rounded-full bg-default/80 overflow-hidden"
        role="progressbar"
        aria-label="Envoi de la photo"
        :aria-valuenow="Math.round(uploadProgress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="h-full rounded-full bg-primary transition-all duration-500" :style="{ width: `${uploadProgress * 100}%` }" />
      </div>
    </div>

    <!-- Une seule ligne, boutons à parts égales sur toute la largeur : libellés courts pour tenir sur un téléphone. -->
    <div class="flex gap-1 sm:gap-2">
      <!-- La capture directe n'a de sens que sur un appareil tactile (téléphone, tablette). -->
      <UButton
        label="Photo"
        aria-label="Prendre une photo"
        icon="i-lucide-camera"
        color="neutral"
        variant="outline"
        size="sm"
        :class="`${actionClass} hidden pointer-coarse:flex`"
        :ui="actionUi"
        :disabled="isLocked"
        @click="cameraInput?.click()"
      />
      <UButton
        label="Importer"
        aria-label="Importer une image"
        icon="i-lucide-image-up"
        color="neutral"
        variant="outline"
        size="sm"
        :class="actionClass"
        :ui="actionUi"
        :disabled="isLocked"
        @click="galleryInput?.click()"
      />
      <!-- Un champ de saisie ne tiendrait pas dans la ligne sur un téléphone : il s'ouvre dans une bulle. -->
      <UPopover v-if="allowUrl" v-model:open="urlOpen">
        <UButton
          label="Lien"
          aria-label="Lien vers une image"
          icon="i-lucide-link"
          :color="url.trim() ? 'primary' : 'neutral'"
          variant="outline"
          size="sm"
          :class="actionClass"
          :ui="actionUi"
          :disabled="isLocked"
        />

        <template #content>
          <form class="flex w-[min(20rem,calc(100vw-2rem))] gap-2 p-2" @submit.prevent="urlOpen = false">
            <UInput
              v-model="url"
              type="url"
              inputmode="url"
              placeholder="https://..."
              aria-label="Lien vers une image"
              autofocus
              size="md"
              variant="outline"
              class="min-w-0 flex-1"
            />
            <UButton type="submit" label="OK" color="neutral" variant="outline" size="md" />
          </form>
        </template>
      </UPopover>
      <UButton
        v-if="previewUrl"
        label="Retirer"
        aria-label="Retirer l'image"
        icon="i-lucide-trash-2"
        color="neutral"
        variant="outline"
        size="sm"
        :class="actionClass"
        :ui="actionUi"
        :disabled="isLocked"
        @click="emit('remove')"
      />
    </div>
    <p v-if="error" class="text-xs text-error" role="alert">
      {{ error }}
    </p>

    <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFileChange">
    <input ref="galleryInput" type="file" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFileChange">
  </div>
</template>
