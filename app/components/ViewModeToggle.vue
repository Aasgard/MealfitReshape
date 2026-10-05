<script setup lang="ts">
import type { ViewMode } from '~/composables/useViewMode'

const mode = defineModel<ViewMode>({ required: true })

const options: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'cards', label: 'Vue cartes', icon: 'i-lucide-layout-grid' },
  { value: 'list', label: 'Vue liste', icon: 'i-lucide-list' },
]
</script>

<template>
  <!-- Même groupe de boutons bascule que les filtres de type de plat (page Recettes). -->
  <div role="group" aria-label="Affichage" class="flex shrink-0 gap-1 rounded-lg bg-elevated p-1">
    <UTooltip v-for="option in options" :key="option.value" :text="option.label">
      <UButton
        :icon="option.icon"
        :color="mode === option.value ? 'primary' : 'neutral'"
        :variant="mode === option.value ? 'solid' : 'ghost'"
        size="sm"
        :aria-label="option.label"
        :aria-pressed="mode === option.value"
        @click="mode = option.value"
      />
    </UTooltip>
  </div>
</template>
