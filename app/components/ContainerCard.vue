<script setup lang="ts">
import type { Container } from '~/types/container'
import { formatGramsValue } from '~/utils/containerWeighing'

const props = defineProps<{
  container: Container
}>()

const emit = defineEmits<{
  /** Clic sur la carte : ouvre la pesée. */
  select: []
  edit: []
  delete: []
}>()

/** Photo cassée (supprimée de Storage, hors ligne...) : on retombe sur l'icône. */
const imageFailed = ref(false)
watch(() => props.container.imageUrl, () => { imageFailed.value = false })

const actionItems = computed(() => [
  [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => emit('edit') }],
  [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }],
])
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="`Peser avec ${container.label}`"
    class="rounded-xl border border-default bg-default overflow-hidden flex flex-col cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
    @click="emit('select')"
    @keydown.enter.self="emit('select')"
    @keydown.space.self.prevent="emit('select')"
  >
    <img
      v-if="container.imageUrl && !imageFailed"
      :src="container.imageUrl"
      :alt="container.label"
      loading="lazy"
      class="w-full h-36 object-cover bg-accented"
      @error="imageFailed = true"
    >
    <div v-else class="flex items-center justify-center w-full h-36 bg-accented" aria-hidden="true">
      <UIcon name="i-lucide-cooking-pot" class="size-6 text-dimmed" />
    </div>

    <div class="p-4 flex flex-col gap-2 flex-1">
      <div class="flex items-start justify-between gap-2">
        <p class="min-w-0 flex-1 font-semibold text-highlighted truncate">
          {{ container.label }}
        </p>
        <UDropdownMenu :items="actionItems" :ui="{ content: 'w-40' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Actions pour ${container.label}`"
            @click.stop
          />
        </UDropdownMenu>
      </div>

      <p class="flex items-baseline gap-1.5">
        <span class="text-2xl font-bold tabular-nums text-highlighted">{{ formatGramsValue(container.weight) }}</span>
        <span class="text-xs text-dimmed">g à vide</span>
      </p>

      <p class="text-xs text-dimmed truncate h-4 mt-auto">
        {{ container.comment }}
      </p>
    </div>
  </div>
</template>
