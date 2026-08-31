<script setup lang="ts">
import type { IngredientMacros } from '~/utils/ingredientNutrition'

const props = withDefaults(defineProps<{
  macros: IngredientMacros
  showBar?: boolean
}>(), {
  showBar: true,
})

const macroTotal = computed(() => props.macros.carbohydrates + props.macros.protein + props.macros.fat)

/** Segments de la barre de composition, dans l’ordre G/P/L utilisé partout ailleurs ; les macros à 0 sont omises pour éviter un segment invisible collé à un gap. */
const macroSegments = computed(() => {
  if (macroTotal.value <= 0) return []
  return ([
    { key: 'carbohydrates', value: props.macros.carbohydrates, colorClass: 'bg-green-500' },
    { key: 'protein', value: props.macros.protein, colorClass: 'bg-red-700' },
    { key: 'fat', value: props.macros.fat, colorClass: 'bg-amber-500' },
  ] as const)
    .filter(segment => segment.value > 0)
    .map(segment => ({ ...segment, width: `${(segment.value / macroTotal.value) * 100}%` }))
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dimmed">
      <span class="flex items-center gap-1 shrink-0">
        <span class="size-2 rounded-full bg-green-500 shrink-0" />
        G <span class="font-medium text-highlighted tabular-nums">{{ macros.carbohydrates }}g</span>
      </span>
      <span class="flex items-center gap-1 shrink-0">
        <span class="size-2 rounded-full bg-red-700 shrink-0" />
        P <span class="font-medium text-highlighted tabular-nums">{{ macros.protein }}g</span>
      </span>
      <span class="flex items-center gap-1 shrink-0">
        <span class="size-2 rounded-full bg-amber-500 shrink-0" />
        L <span class="font-medium text-highlighted tabular-nums">{{ macros.fat }}g</span>
      </span>
      <p class="flex items-baseline gap-1 shrink-0 ml-auto">
        <span class="font-semibold text-highlighted tabular-nums">{{ macros.calories }}</span>
        <span>kcal</span>
      </p>
    </div>
    <div v-if="showBar" class="flex h-1.5 rounded-full bg-accented overflow-hidden gap-0.5">
      <div
        v-for="segment in macroSegments"
        :key="segment.key"
        class="h-full rounded-full transition-all duration-500"
        :class="segment.colorClass"
        :style="{ width: segment.width }"
      />
    </div>
  </div>
</template>
