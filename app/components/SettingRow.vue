<script setup lang="ts">
/**
 * Ligne de fiche : libellé (et précision) à gauche, valeur ou contrôle aligné à droite.
 * `stack` passe le contrôle sous le libellé sur mobile, pour les contrôles larges (listes, groupes de boutons).
 */
withDefaults(defineProps<{
  label: string
  hint?: string
  error?: string
  /** Id du contrôle, pour relier le libellé. */
  for?: string
  stack?: boolean
}>(), {
  stack: false,
})
</script>

<template>
  <div
    class="grid gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5"
    :class="stack ? 'grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center' : 'grid-cols-[minmax(0,1fr)_auto] items-center'"
  >
    <div class="flex min-w-0 flex-col gap-0.5">
      <label v-if="$props.for" :for="$props.for" class="text-sm font-medium text-highlighted">{{ label }}</label>
      <span v-else class="text-sm font-medium text-highlighted">{{ label }}</span>
      <p v-if="hint || $slots.hint" class="text-xs text-muted text-pretty">
        <slot name="hint">
          {{ hint }}
        </slot>
      </p>
    </div>
    <div class="flex min-w-0 items-center gap-2" :class="stack ? 'sm:justify-end' : 'justify-end'">
      <slot />
    </div>
    <p v-if="error" class="text-xs text-error sm:col-span-2" :class="!stack && 'col-span-2'" role="alert">
      {{ error }}
    </p>
  </div>
</template>
