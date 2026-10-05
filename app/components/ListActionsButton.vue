<script setup lang="ts">
/** Bouton « ⋮ » d'une ligne de liste : rendu d'un UButton ghost neutral `xs`, en élément natif pour rester léger. Ouvre SharedActionsMenu. */
defineProps<{
  label: string
}>()
</script>

<template>
  <button
    type="button"
    aria-haspopup="menu"
    :aria-label="label"
    class="inline-flex items-center justify-center size-6 rounded-sm text-default transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
  >
    <UIcon name="i-lucide-ellipsis-vertical" class="size-4" />
  </button>
</template>
