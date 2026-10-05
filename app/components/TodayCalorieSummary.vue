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

/** Rythme affiché, en centièmes de kg/sem (arrondi comme le chiffre). */
const roundedRate = computed(() => Math.round((props.weightProgress?.rateKgPerWeek ?? 0) * 100))

const trendIcon = computed(() =>
  roundedRate.value < 0 ? 'i-lucide-trending-down' : roundedRate.value > 0 ? 'i-lucide-trending-up' : 'i-lucide-move-right',
)

/** Orange à l'inverse de l'objectif (hausse pour une perte, baisse pour une prise) ; sinon gris sur mobile, noir sur PC. */
const trendClass = computed(() => (props.weightProgress?.againstGoal ? 'text-warning' : 'text-muted lg:text-highlighted'))

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
        Résumé
      </p>
      <p v-if="!open" class="text-xs text-dimmed">
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
      <!--
        À gauche la jauge et les calories, à droite les macros empilées : les deux colonnes ont la même hauteur
        (les macros se répartissent sur celle de la jauge et des calories). Les chiffres dessous (mobile, tablette) ; lg+ : jauge, kcal, macros, poids en 4 colonnes.
      -->
      <div class="grid h-full grid-cols-[auto_minmax(0,1fr)] content-center gap-x-5 gap-y-3 px-4 pb-4 sm:px-5 sm:pb-5 lg:grid-cols-[auto_auto_minmax(0,16rem)_auto] lg:justify-between lg:gap-x-8">
        <div class="flex flex-col gap-1.5">
          <div
            class="relative mx-auto w-32 lg:w-36"
            role="img"
            :aria-label="isOver ? `${-remainingKcal} kcal au-dessus de l'objectif` : `${remainingKcal} kcal restantes sur l'objectif`"
          >
            <!-- Cadré au plus près de l'arc (bouts arrondis compris), pour que sa hauteur soit celle des macros. -->
            <svg viewBox="0 12 200 154" class="block w-full" fill="none" stroke-width="16" stroke-linecap="round" aria-hidden="true">
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
            <div class="absolute inset-x-0 flex -translate-y-1/2 flex-col items-center" style="top: 57%">
              <p class="text-3xl font-bold tabular-nums" :class="TARGET_STATUS_TEXT_CLASS[kcalStatus]">
                {{ isOver ? '+' : '' }}{{ Math.abs(remainingKcal) }}
              </p>
              <p class="text-xs text-dimmed">
                {{ isOver ? 'kcal en trop' : 'kcal restantes' }}
              </p>
            </div>
          </div>

          <!-- Mobile : kcal mangées / objectif au format des macros ; la jauge leur tient lieu de barre. lg+ : 2e colonne. -->
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 lg:hidden">
            <p class="truncate text-xs text-dimmed">
              Calories
            </p>
            <p class="text-xs tabular-nums">
              <span class="font-semibold text-highlighted">{{ eatenKcal }}</span>
              <span class="text-dimmed"> / {{ targets.calories }}</span>
            </p>
          </div>
        </div>

        <!-- lg+ : kcal mangées / objectif et « En plus », au format des chiffres de la dernière colonne. -->
        <div class="hidden flex-col justify-center gap-y-4 whitespace-nowrap lg:flex">
          <p class="flex items-baseline gap-1" :title="`${eatenKcal} kcal mangées sur un objectif de ${targets.calories} kcal`">
            <UIcon name="i-lucide-flame" class="size-4 shrink-0 self-center text-highlighted" aria-hidden="true" />
            <span class="sr-only">Mangées :</span>
            <span class="text-xl font-bold tabular-nums text-highlighted">{{ eatenKcal }}</span>
            <span class="text-sm text-muted"><span class="tabular-nums">/ {{ targets.calories }}</span> kcal</span>
          </p>
          <p class="flex items-baseline gap-1" :title="`${extraKcal} kcal en plus (hors plan)`">
            <UIcon name="i-lucide-candy-off" class="size-4 shrink-0 self-center text-highlighted" aria-hidden="true" />
            <span class="sr-only">En plus :</span>
            <span class="text-xl font-bold tabular-nums" :class="extraKcal > 0 ? 'text-warning' : 'text-highlighted'">
              {{ extraKcal > 0 ? '+' : '' }}{{ extraKcal }}
            </span>
            <span class="text-sm text-muted">kcal</span>
          </p>
        </div>

        <!-- Libellé et valeur sur une ligne, barre dessous ; réparties sur la hauteur de la jauge et des calories. -->
        <div class="flex flex-col justify-between gap-3">
          <div v-for="macro in macroRows" :key="macro.key" class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
            <p class="truncate text-xs text-dimmed">
              {{ macro.label }}
            </p>
            <p class="text-xs tabular-nums">
              <span class="font-semibold" :class="macro.statusClass">{{ macro.eaten }}</span>
              <span class="text-dimmed"> / {{ macro.target }} g</span>
            </p>
            <div class="col-span-2 mt-1.5 h-1.5 overflow-hidden rounded-full bg-accented">
              <div class="h-full rounded-full transition-all duration-500" :class="macro.colorClass" :style="{ width: macro.width }" />
            </div>
          </div>
        </div>

        <!--
          Chiffres sans libellés, chacun précédé de son picto, à la même taille ; la couleur porte sur le chiffre.
          Mobile, tablette : une seule ligne sous la jauge, répartie sur la largeur ; lg+ : dernière colonne, sans « En plus »
          (passé dans la 2e colonne).
        -->
        <div
          class="col-span-2 flex flex-nowrap items-center justify-between gap-x-3 whitespace-nowrap border-t border-default pt-3 lg:col-span-1 lg:flex-col lg:items-start lg:justify-center lg:gap-y-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
          :class="!weightProgress && 'lg:hidden'"
        >
          <p class="flex items-baseline gap-1 lg:hidden" :title="`${extraKcal} kcal en plus (hors plan)`">
            <UIcon name="i-lucide-candy-off" class="size-4 shrink-0 self-center text-highlighted" aria-hidden="true" />
            <span class="sr-only">En plus :</span>
            <span class="text-base font-bold tabular-nums min-[380px]:text-lg lg:text-xl" :class="extraKcal > 0 ? 'text-warning' : 'text-muted'">
              {{ extraKcal > 0 ? '+' : '' }}{{ extraKcal }}
            </span>
            <span class="text-xs text-muted lg:text-sm">kcal</span>
          </p>
          <!-- Jamais de poids brut ici : le rythme de la tendance et la part de l'objectif. -->
          <p
            v-if="weightProgress && weightProgress.rateKgPerWeek !== null"
            class="flex items-baseline gap-1"
            title="Tendance du poids sur 4 semaines"
          >
            <UIcon :name="trendIcon" class="size-4 shrink-0 self-center text-highlighted" aria-hidden="true" />
            <span class="sr-only">Tendance du poids :</span>
            <span class="text-base font-bold tabular-nums min-[380px]:text-lg lg:text-xl" :class="trendClass">
              {{ formatSignedWeight(weightProgress.rateKgPerWeek, 2) }}
            </span>
            <span class="text-xs text-muted lg:text-sm">kg/sem</span>
          </p>
          <p
            v-if="weightProgress && weightProgress.goalPercent !== null"
            class="flex items-baseline gap-1"
            :title="`${weightProgress.goalPercent} % de l'objectif de poids atteint`"
          >
            <UIcon name="i-lucide-target" class="size-4 shrink-0 self-center text-highlighted" aria-hidden="true" />
            <span class="sr-only">Objectif de poids atteint :</span>
            <span class="text-base font-bold tabular-nums text-muted min-[380px]:text-lg lg:text-xl lg:text-highlighted">{{ weightProgress.goalPercent }}</span>
            <span class="text-xs text-muted lg:text-sm">%</span>
          </p>
        </div>
      </div>
    </template>
  </UCollapsible>
</template>
