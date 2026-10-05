<script setup lang="ts">
import type { MenuWeekMacroBalance } from '~/types/menu'
import { DAILY_TARGET_TOLERANCE, TARGET_STATUS_COLOR, TARGET_STATUS_TEXT_CLASS, targetStatus, type DailyTargets } from '~/utils/dailyTargets'
import type { WeightProgress } from '~/utils/weightTrend'

const props = defineProps<{
  targets: DailyTargets
  /** Kcal mangées le jour affiché, "En plus" compris. */
  eatenKcal: number
  /** Part "En plus" des kcal mangées. */
  extraKcal: number
  macros: MenuWeekMacroBalance
  /** Suivi du poids au jour affiché (rythme, part de l'objectif) ; absent sans pesée. */
  weightProgress?: WeightProgress | null
}>()

/** Vert si le rythme suit la projection, orange s'il s'en écarte, neutre sans projection. */
const paceClass = computed(() => {
  const onPace = props.weightProgress?.onPace
  return onPace === true ? 'text-success' : onPace === false ? 'text-warning' : 'text-highlighted'
})

/** Partagé entre les jours : le panneau garde son état quand on change de jour. */
const open = useState('today-calorie-summary-open', () => true)

const remainingKcal = computed(() => props.targets.calories - props.eatenKcal)
const isOver = computed(() => remainingKcal.value < 0)
/** Bleu tant que l'objectif n'est pas atteint, vert à ± 5 %, orange au-delà. */
const kcalStatus = computed(() => targetStatus(props.eatenKcal, props.targets.calories, DAILY_TARGET_TOLERANCE))

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
  return {
    key,
    label,
    colorClass,
    eaten,
    target,
    width: `${Math.min(1, eaten / target) * 100}%`,
    statusClass: TARGET_STATUS_TEXT_CLASS[targetStatus(eaten, target, DAILY_TARGET_TOLERANCE)],
  }
}))
</script>

<template>
  <UCollapsible v-model:open="open" class="flex flex-col rounded-xl border border-default bg-default" :ui="{ content: 'flex-1' }">
    <button
      type="button"
      class="flex w-full cursor-pointer items-center gap-3 rounded-xl p-4 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
    >
      <p class="flex-1 text-xs font-semibold uppercase tracking-wide text-dimmed">
        Résumé calorique
      </p>
      <p v-if="open" class="text-xs text-dimmed">
        Objectif <span class="tabular-nums">{{ targets.calories }}</span> kcal
      </p>
      <p v-else class="text-xs text-dimmed">
        <span class="font-semibold tabular-nums" :class="TARGET_STATUS_TEXT_CLASS[kcalStatus]">{{ isOver ? '+' : '' }}{{ Math.abs(remainingKcal) }}</span>
        {{ isOver ? 'kcal en trop' : 'kcal restantes' }}
      </p>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-muted transition-transform duration-200"
        :class="open && 'rotate-180'"
      />
    </button>

    <template #content>
      <!-- Mobile : kcal à droite de la jauge, macros dessous ; sm+ : kcal et macros empilés à droite. -->
      <div class="grid h-full grid-cols-[auto_minmax(0,1fr)] content-center items-center gap-x-5 gap-y-5 px-4 pb-4 sm:gap-x-6 sm:px-5 sm:pb-5">
        <div
          class="relative w-32 sm:row-span-2 sm:w-48"
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
              :style="{ stroke: TARGET_STATUS_COLOR[kcalStatus] }"
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
            <p class="text-3xl font-bold tabular-nums sm:text-4xl" :class="TARGET_STATUS_TEXT_CLASS[kcalStatus]">
              {{ isOver ? '+' : '' }}{{ Math.abs(remainingKcal) }}
            </p>
            <p class="text-xs text-dimmed">
              {{ isOver ? 'kcal en trop' : 'kcal restantes' }}
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8 sm:self-end">
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
          <!-- Jamais de poids brut ici : le rythme de la tendance, sinon la part de l'objectif seule. -->
          <div v-if="weightProgress">
            <template v-if="weightProgress.rateKgPerWeek !== null">
              <p class="flex items-baseline gap-1">
                <span class="text-2xl font-bold tabular-nums" :class="paceClass">
                  {{ formatSignedWeight(weightProgress.rateKgPerWeek, 2) }}
                </span>
                <span class="text-sm text-muted">kg/sem</span>
              </p>
              <p class="text-xs text-dimmed">
                <template v-if="weightProgress.goalPercent !== null">
                  <span class="tabular-nums">{{ weightProgress.goalPercent }}</span> % de l'objectif
                </template>
                <template v-else>
                  Rythme 4 semaines
                </template>
              </p>
            </template>
            <template v-else>
              <p class="flex items-baseline gap-1">
                <span class="text-2xl font-bold tabular-nums text-highlighted">{{ weightProgress.goalPercent }}</span>
                <span class="text-sm text-muted">%</span>
              </p>
              <p class="text-xs text-dimmed">
                De l'objectif poids
              </p>
            </template>
          </div>
        </div>

        <div class="col-span-2 grid grid-cols-3 gap-4 sm:col-span-1 sm:col-start-2 sm:self-start">
          <div v-for="macro in macroRows" :key="macro.key" class="min-w-0">
            <p class="text-xs text-dimmed">
              {{ macro.label }}
            </p>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accented">
              <div class="h-full rounded-full transition-all duration-500" :class="macro.colorClass" :style="{ width: macro.width }" />
            </div>
            <p class="mt-1.5 text-xs tabular-nums">
              <span class="font-semibold" :class="macro.statusClass">{{ macro.eaten }}</span>
              <span class="text-dimmed"> / {{ macro.target }} g</span>
            </p>
          </div>
        </div>
      </div>
    </template>
  </UCollapsible>
</template>
