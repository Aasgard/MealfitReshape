<script setup lang="ts">
import type { Container } from '~/types/container'

/** Fiche d'un récipient : la pesée d'abord (l'action fréquente), puis la photo et le commentaire. */
const props = defineProps<{
  container: Container | null
}>()

const emit = defineEmits<{
  edit: []
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const { formatDate } = useDateFormat()

/** Change à chaque ouverture : la pesée repart de zéro (poids vide, 1 part). */
const weighingKey = ref(0)
watch(open, (isOpen) => {
  if (isOpen) weighingKey.value++
})

const imageFailed = ref(false)
watch(() => props.container?.imageUrl, () => { imageFailed.value = false })
</script>

<template>
  <USlideover v-model:open="open">
    <template #title>
      <div class="flex items-center gap-2 min-w-0">
        <span class="truncate">{{ container?.label }}</span>
        <UButton
          v-if="container"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Modifier ${container.label}`"
          @click="emit('edit')"
        />
      </div>
    </template>

    <template #body>
      <div v-if="container" class="flex flex-col gap-6">
        <ContainerWeighing :key="`${container.id}-${weighingKey}`" :tare="container.weight" />

        <img
          v-if="container.imageUrl && !imageFailed"
          :src="container.imageUrl"
          :alt="container.label"
          class="w-full max-h-72 rounded-xl border border-default object-cover bg-accented"
          @error="imageFailed = true"
        >

        <div v-if="container.comment">
          <p class="text-xs text-dimmed mb-1">Commentaire</p>
          <p class="text-sm text-muted whitespace-pre-line">{{ container.comment }}</p>
        </div>

        <div v-if="container.updatedAt">
          <p class="text-xs text-dimmed mb-1">Modifié le</p>
          <p class="text-sm text-muted">{{ formatDate(container.updatedAt) }}</p>
        </div>
      </div>
    </template>
  </USlideover>
</template>
