<script setup lang="ts">
/**
 * Petite prise débranchée à côté d'un réglage pas encore raccordé : la valeur est en dur dans l'app (ou pas enregistrée).
 * Le détail s'affiche au survol, au focus ou au toucher.
 */
withDefaults(defineProps<{
  text?: string
}>(), {
  text: 'Pas encore raccordé : valeur en dur, ce réglage n\'a pas d\'effet dans l\'app.',
})
</script>

<template>
  <UTooltip :text="text" :content="{ side: 'top' }" :ui="{ content: 'max-w-64 h-auto whitespace-normal', text: 'whitespace-normal' }">
    <span
      tabindex="0"
      role="img"
      :aria-label="text"
      class="inline-flex shrink-0 cursor-help rounded-sm text-warning outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <UIcon name="i-lucide-unplug" class="size-3.5" />
    </span>
  </UTooltip>
</template>
