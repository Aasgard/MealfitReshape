<script setup lang="ts">
import type { MenuWeekMacroBalance } from '~/types/menu'
import type { DailyTargets } from '~/utils/dailyTargets'

const props = defineProps<{
  targets: DailyTargets
  /** Kcal mangées aujourd'hui, "En plus" compris. */
  eatenKcal: number
  /** Part "En plus" des kcal mangées. */
  extraKcal: number
  macros: MenuWeekMacroBalance
}>()

const remainingKcal = computed(() => props.targets.calories - props.eatenKcal)
const isOver = computed(() => remainingKcal.value < 0)

// Jauge : arc de 270° (ouvert vers le bas) tracé avec un cercle dont on ne garde que 75 % du pourtour.
const GAUGE_RADIUS = 80
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS
const GAUGE_ARC = GAUGE_CIRCUMFERENCE * 0.75

const shareOfTarget = (kcal: number) => Math.max(0, Math.min(1, kcal / props.targets.calories))
const plannedShare = computed(() => shareOfTarget(props.eatenKcal - props.extraKcal))
/** Le "En plus" prolonge l'arc du plan ; ensemble, ils ne dépassent jamais la jauge. */
const extraShare = computed(() => Math.min(shareOfTarget(props.extraKcal), 1 - plannedShare.value))
const plannedLength = computed(() => plannedShare.value * GAUGE_ARC)
const extraLength = computed(() => extraShare.value * GAUGE_ARC)

const macroRows = computed(() => ([
  { key: 'carbohydrates', label: 'Glucides', colorClass: 'bg-green-500' },
  { key: 'protein', label: 'Protéines', colorClass: 'bg-red-700' },
  { key: 'fat', label: 'Lipides', colorClass: 'bg-amber-500' },
] as const).map(({ key, label, colorClass }) => {
  const eaten = props.macros[key]
  const target = props.targets[key]
  return { key, label, colorClass, eaten, target, width: `${Math.min(1, eaten / target) * 100}%`, isOver: eaten > target }
}))
</script>

<template>
  <div class="flex flex-col rounded-xl border border-default bg-default p-4 sm:p-5">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
        Résumé calorique
      </p>
      <p class="text-xs text-dimmed">
        Objectif <span class="tabular-nums">{{ targets.calories }}</span> kcal
      </p>
    </div>

    <div class="mt-4 flex flex-1 flex-col items-center gap-6 sm:flex-row">
      <div
        class="relative w-44 shrink-0 sm:w-48"
        role="img"
        :aria-label="isOver ? `${-remainingKcal} kcal au-dessus de l'objectif` : `${remainingKcal} kcal restantes sur l'objectif`"
      >
        <svg viewBox="0 0 200 172" class="block w-full" fill="none" stroke-width="16" stroke-linecap="round" aria-hidden="true">
          <circle
            cx="100"
            cy="100"
            :r="GAUGE_RADIUS"
            transform="rotate(135 100 100)"
            :stroke-dasharray="`${GAUGE_ARC} ${GAUGE_CIRCUMFERENCE}`"
            style="stroke: var(--ui-bg-accented)"
          />
          <circle
            v-if="plannedLength > 0"
            class="transition-[stroke-dasharray] duration-500"
            cx="100"
            cy="100"
            :r="GAUGE_RADIUS"
            transform="rotate(135 100 100)"
            :stroke-dasharray="`${plannedLength} ${GAUGE_CIRCUMFERENCE}`"
            style="stroke: var(--ui-primary)"
          />
          <circle
            v-if="extraLength > 0"
            class="transition-[stroke-dasharray] duration-500"
            cx="100"
            cy="100"
            :r="GAUGE_RADIUS"
            transform="rotate(135 100 100)"
            :stroke-dasharray="`${extraLength} ${GAUGE_CIRCUMFERENCE}`"
            :stroke-dashoffset="-plannedLength"
            style="stroke: var(--ui-warning)"
          />
        </svg>
        <div class="absolute inset-x-0 flex -translate-y-1/2 flex-col items-center" style="top: 58%">
          <p class="text-4xl font-bold tabular-nums" :class="isOver ? 'text-warning' : 'text-highlighted'">
            {{ isOver ? '+' : '' }}{{ Math.abs(remainingKcal) }}
          </p>
          <p class="text-xs text-dimmed">
            {{ isOver ? 'kcal en trop' : 'kcal restantes' }}
          </p>
        </div>
      </div>

      <div class="flex w-full min-w-0 flex-1 flex-col gap-5">
        <div class="flex items-start gap-8">
          <div>
            <p class="flex items-baseline gap-1">
              <span class="text-2xl font-bold tabular-nums text-highlighted">{{ eatenKcal }}</span>
              <span class="text-sm text-muted">kcal</span>
            </p>
            <p class="text-xs text-dimmed">
              Mangées
            </p>
          </div>
          <div>
            <p class="flex items-baseline gap-1">
              <span class="text-2xl font-bold tabular-nums" :class="extraKcal > 0 ? 'text-warning' : 'text-highlighted'">
                {{ extraKcal > 0 ? '+' : '' }}{{ extraKcal }}
              </span>
              <span class="text-sm text-muted">kcal</span>
            </p>
            <p class="text-xs text-dimmed">
              En plus
            </p>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div v-for="macro in macroRows" :key="macro.key" class="min-w-0">
            <p class="text-xs text-dimmed">
              {{ macro.label }}
            </p>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accented">
              <div class="h-full rounded-full transition-all duration-500" :class="macro.colorClass" :style="{ width: macro.width }" />
            </div>
            <p class="mt-1.5 text-xs tabular-nums">
              <span class="font-semibold" :class="macro.isOver ? 'text-warning' : 'text-highlighted'">{{ macro.eaten }}</span>
              <span class="text-dimmed"> / {{ macro.target }} g</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
