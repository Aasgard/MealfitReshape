<script setup lang="ts">
import type { MenuWeekMacroBalance } from '~/types/menu'

const props = defineProps<{
  averageKcal: number
  targetKcal: number
  overagePerDayKcal: number
  overageCount: number
  overageTotalKcal: number
  macros: MenuWeekMacroBalance
}>()

const macroTotal = computed(() => props.macros.carbohydrates + props.macros.protein + props.macros.fat)

/** Segments de la barre G/P/L, dans le même ordre et les mêmes couleurs que IngredientMacroSummary. */
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

const overageIsPositive = computed(() => props.overagePerDayKcal > 0)
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="rounded-xl border border-default bg-default p-4 flex flex-col gap-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
        Moyenne / jour
      </p>
      <p class="flex items-baseline gap-1.5">
        <span class="text-2xl font-bold text-highlighted tabular-nums">{{ averageKcal }}</span>
        <span class="text-sm text-muted">kcal</span>
      </p>
      <p class="text-xs text-dimmed">
        Objectif {{ targetKcal }} kcal
      </p>
    </div>

    <div class="rounded-xl border border-default bg-default p-4 flex flex-col gap-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
        Dérapages / jour
      </p>
      <p class="flex items-baseline gap-1.5">
        <span
          class="text-2xl font-bold tabular-nums"
          :class="overageIsPositive ? 'text-error' : 'text-highlighted'"
        >{{ overageIsPositive ? '+' : '' }}{{ overagePerDayKcal }}</span>
        <span class="text-sm text-muted">kcal</span>
      </p>
      <p class="text-xs text-dimmed">
        {{ overageCount }} écart{{ overageCount > 1 ? 's' : '' }} cette semaine · {{ overageTotalKcal }} kcal
      </p>
    </div>

    <div class="rounded-xl border border-default bg-default p-4 flex flex-col gap-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
        Équilibre de la semaine
      </p>
      <div class="flex items-center gap-x-3 gap-y-1 text-xs text-dimmed flex-wrap">
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
      </div>
      <div class="flex h-1.5 rounded-full bg-accented overflow-hidden gap-0.5">
        <div
          v-for="segment in macroSegments"
          :key="segment.key"
          class="h-full rounded-full transition-all duration-500"
          :class="segment.colorClass"
          :style="{ width: segment.width }"
        />
      </div>
      <p class="text-xs text-dimmed">
        Moyenne par jour
      </p>
    </div>
  </div>
</template>
