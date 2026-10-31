<script setup lang="ts">
import type { MacroEstimate } from '#shared/types/macroEstimate'

/**
 * Scan My Meal en version compacte (onglet Macros de l'ajout d'un repas) : une photo et/ou une description, estimées
 * par Claude. Émet l'estimation et la description ; le parent en remplit ses champs, que l'on peut encore corriger.
 * La photo n'est pas conservée.
 */
const emit = defineEmits<{
  estimated: [estimate: MacroEstimate, description: string]
}>()

const { photo, description, estimating, error, canEstimate, submit, reset } = useMealEstimate()

/** Bloc replié par défaut : un seul bouton, à côté du scan de code-barres. */
const expanded = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)

const toggleExpanded = () => {
  expanded.value = !expanded.value
}

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  expanded.value = true
  await photo.pick(file)
}

async function estimate() {
  const text = description.value.trim()
  const result = await submit()
  if (!result) return
  emit('estimated', result, text)
  reset()
  expanded.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onPhotoSelected"
    >
    <!-- Sans `capture` : ouvre la galerie (photo déjà prise, capture d'écran) au lieu de l'appareil photo. -->
    <input
      ref="importInput"
      type="file"
      accept="image/*"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onPhotoSelected"
    >

    <div class="flex gap-2">
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-camera"
        class="flex-1 justify-center"
        :loading="photo.processing.value"
        @click="fileInput?.click()"
      >
        Photographier le repas
      </UButton>
      <UTooltip text="Importer une photo">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-image-up"
          aria-label="Importer une photo"
          :disabled="photo.processing.value"
          @click="importInput?.click()"
        />
      </UTooltip>
      <UTooltip text="Décrire le repas">
        <UButton
          color="neutral"
          :variant="expanded ? 'soft' : 'outline'"
          icon="i-lucide-text"
          aria-label="Décrire le repas"
          :aria-pressed="expanded"
          @click="toggleExpanded"
        />
      </UTooltip>
    </div>

    <form v-if="expanded" novalidate class="flex flex-col gap-2 rounded-lg border border-default p-2" @submit.prevent="estimate">
      <div v-if="photo.objectUrl.value" class="flex items-center gap-2">
        <img :src="photo.objectUrl.value" alt="Photo du repas" class="size-14 shrink-0 rounded-md object-cover">
        <span class="min-w-0 flex-1 text-xs text-muted">Photo prête, non conservée.</span>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-refresh-cw"
          aria-label="Reprendre la photo"
          @click="fileInput?.click()"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          aria-label="Retirer la photo"
          @click="photo.reset()"
        />
      </div>

      <UTextarea
        v-model="description"
        :rows="2"
        autoresize
        :maxlength="2000"
        :placeholder="photo.blob.value
          ? 'Précisions facultatives : quantités, cuisson, sauce…'
          : 'Ex. une assiette de pâtes carbonara, une grosse portion'"
        aria-label="Description du repas"
        class="w-full"
      />

      <p v-if="photo.error.value" role="alert" class="text-xs text-error">
        {{ photo.error.value }}
      </p>
      <p v-if="error" role="alert" class="text-xs text-error">
        {{ error }}
      </p>

      <UButton
        type="submit"
        icon="i-lucide-sparkles"
        class="justify-center"
        block
        :loading="estimating"
        :disabled="!canEstimate"
      >
        {{ estimating ? 'Estimation en cours…' : 'Estimer avec Claude' }}
      </UButton>
    </form>
  </div>
</template>
