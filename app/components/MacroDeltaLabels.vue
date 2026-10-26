<script setup lang="ts">
import type { MacroDelta } from '~/utils/ingredientSwap'

/**
 * Écart de macros d'un remplacement d'ingrédient, ex. « G −4 P +2 ». Seuls les écarts d'au moins 3 g sont montrés :
 * en dessous, on parle de macros proches.
 */
const props = defineProps<{ delta: MacroDelta }>()

const SIGNIFICANT_GRAMS = 3

const parts = computed(() =>
  ([
    { key: 'carbohydrates', letter: 'G', name: 'glucides', class: 'text-green-500' },
    { key: 'protein', letter: 'P', name: 'protéines', class: 'text-red-700 dark:text-red-500' },
    { key: 'fat', letter: 'L', name: 'lipides', class: 'text-amber-500' },
  ] as const)
    .map(macro => ({ ...macro, value: Math.round(props.delta[macro.key]) }))
    .filter(macro => Math.abs(macro.value) >= SIGNIFICANT_GRAMS)
)

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`
const description = computed(() =>
  parts.value.length
    ? parts.value.map(p => `${p.name} ${signed(p.value)} g`).join(', ')
    : 'macros proches de l\'original'
)
</script>

<template>
  <span class="tabular-nums" :title="description" :aria-label="description">
    <template v-if="parts.length">
      <span v-for="(part, idx) in parts" :key="part.key" :class="part.class">{{ idx ? ' ' : '' }}{{ part.letter }} {{ signed(part.value) }}</span>
    </template>
    <span v-else class="text-dimmed">Macros proches</span>
  </span>
</template>
