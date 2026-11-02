<script setup lang="ts">
/**
 * Historique des objectifs : les besoins du jour en vigueur à chaque date, en marches (une valeur vaut jusqu'au
 * changement suivant). Une valeur à la fois, choisie en haut (kcal par défaut, ou une macro en grammes). Le survol
 * (ou les flèches) surligne une période et en donne le détail ; le tableau dessous reprend toutes les valeurs.
 */
import type { TabsItem } from '@nuxt/ui'
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'
import type { DailyTargets } from '~/utils/dailyTargets'
import type { GoalPeriod } from '~/utils/profile'

const props = defineProps<{
  /** Historique du profil (`goalHistory`), du plus ancien au plus récent. */
  periods: GoalPeriod[]
}>()

type MetricKey = keyof DailyTargets

/** Couleurs des macros de l'app ; en sombre, un cran plus foncé pour le vert et l'ambre (palette validée). */
const METRICS: { key: MetricKey, label: string, letter?: string, unit: string, strokeClass: string, fillClass: string, dotClass: string, domainSteps: number[] }[] = [
  { key: 'calories', label: 'kcal', unit: 'kcal', strokeClass: 'stroke-(--ui-text-highlighted)', fillClass: 'fill-(--ui-text-highlighted)', dotClass: 'bg-(--ui-text-highlighted)', domainSteps: [250, 500, 1000] },
  { key: 'carbohydrates', label: 'Glucides', letter: 'G', unit: 'g', strokeClass: 'stroke-green-500 dark:stroke-green-600', fillClass: 'fill-green-500 dark:fill-green-600', dotClass: 'bg-green-500 dark:bg-green-600', domainSteps: [25, 50, 100, 200] },
  { key: 'protein', label: 'Protéines', letter: 'P', unit: 'g', strokeClass: 'stroke-red-700', fillClass: 'fill-red-700', dotClass: 'bg-red-700', domainSteps: [25, 50, 100, 200] },
  { key: 'fat', label: 'Lipides', letter: 'L', unit: 'g', strokeClass: 'stroke-amber-500 dark:stroke-amber-600', fillClass: 'fill-amber-500 dark:fill-amber-600', dotClass: 'bg-amber-500 dark:bg-amber-600', domainSteps: [25, 50, 100, 200] },
]
const MACROS = METRICS.slice(1)

const METRIC_ITEMS = METRICS.map(m => ({ label: m.label, value: m.key })) satisfies TabsItem[]

/** Valeur affichée, gardée pour la session. */
const metricKey = useState<MetricKey>('goal-history-metric', () => 'calories')
const metric = computed(() => METRICS.find(m => m.key === metricKey.value) ?? METRICS[0]!)

const today = format(new Date(), 'yyyy-MM-dd')

/** Une marche par changement de besoins, jusqu'au suivant (ou aujourd'hui) ; les périodes sans besoins n'en ajoutent pas. */
const steps = computed(() => {
  const withTargets = props.periods.filter(p => p.targets !== null && p.from <= today)
  return withTargets.map((p, i) => ({
    from: p.from,
    to: withTargets[i + 1]?.from ?? today,
    current: i === withTargets.length - 1,
    targets: p.targets as DailyTargets,
  }))
})

/** Au moins une semaine à l'écran, pour qu'un objectif du jour même reste lisible. */
const start = computed(() => {
  const first = steps.value[0]?.from ?? today
  const weekAgo = format(subDays(parseISO(today), 6), 'yyyy-MM-dd')
  return first < weekAgo ? first : weekAgo
})
const totalDays = computed(() => Math.max(differenceInCalendarDays(parseISO(today), parseISO(start.value)), 1))

// --- Dimensions ---

const HEIGHT = 220
const PAD = { top: 24, right: 56, bottom: 28, left: 44 }

const container = ref<HTMLElement | null>(null)
const width = ref(0)
let observer: ResizeObserver | null = null

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.round(entry!.contentRect.width)
  })
  if (container.value) observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())

watch(container, (element, previous) => {
  if (previous) observer?.unobserve(previous)
  if (element) observer?.observe(element)
})

const innerWidth = computed(() => Math.max(width.value - PAD.left - PAD.right, 1))
const innerHeight = HEIGHT - PAD.top - PAD.bottom
const x = (day: string) => PAD.left + (differenceInCalendarDays(parseISO(day), parseISO(start.value)) / totalDays.value) * innerWidth.value

const valueOf = (targets: DailyTargets) => targets[metric.value.key]

/** Échelle ronde à partir de zéro, en 4 graduations au plus. */
const domain = computed(() => {
  const max = Math.max(...steps.value.map(s => valueOf(s.targets)), 1)
  const choices = metric.value.domainSteps
  const step = choices.find(s => max / s <= 4) ?? choices.at(-1)!
  return { max: Math.max(Math.ceil(max / step - 1e-9) * step, step), step }
})

const y = (value: number) => PAD.top + innerHeight - (value / domain.value.max) * innerHeight

const yTicks = computed(() => {
  const ticks = []
  for (let v = 0; v <= domain.value.max + 1e-9; v += domain.value.step) ticks.push({ value: v, y: y(v), label: v.toLocaleString('fr-FR') })
  return ticks
})

/** Dates des changements et aujourd'hui, en sautant celles qui chevaucheraient une date gardée (aujourd'hui d'abord). */
const xTicks = computed(() => {
  const days = [...new Set([...steps.value.map(s => s.from), today])].sort().reverse()
  const kept: { day: string, x: number }[] = []
  for (const day of days) {
    const px = x(day)
    if (kept.every(t => Math.abs(t.x - px) >= 52)) kept.push({ day, x: px })
  }
  return kept.map(t => ({ ...t, label: t.day === today ? 'Auj.' : formatDay(t.day) }))
})

/** Tracé en marches : horizontal jusqu'au changement, puis vertical vers la nouvelle valeur. */
const path = computed(() => steps.value
  .map((s, i) => `${i ? 'V' : `M ${x(s.from).toFixed(1)}`} ${y(valueOf(s.targets)).toFixed(1)} H ${x(s.to).toFixed(1)}`)
  .join(' '))

const lastValue = computed(() => {
  const last = steps.value.at(-1)
  return last ? valueOf(last.targets) : null
})

// --- Survol, toucher, clavier ---

const activeIndex = ref<number | null>(null)
const active = computed(() => (activeIndex.value === null ? null : steps.value[activeIndex.value] ?? null))

function onPointerMove(event: PointerEvent) {
  if (!container.value || !steps.value.length) return
  const px = event.clientX - container.value.getBoundingClientRect().left
  const offset = Math.round(((px - PAD.left) / innerWidth.value) * totalDays.value)
  const day = format(new Date(parseISO(start.value).getTime() + offset * 86_400_000), 'yyyy-MM-dd')
  activeIndex.value = Math.max(steps.value.findLastIndex(s => s.from <= day), 0)
}

function onKeydown(event: KeyboardEvent) {
  const last = steps.value.length - 1
  if (last < 0) return
  const current = activeIndex.value ?? last
  const next = { ArrowLeft: Math.max(current - 1, 0), ArrowRight: Math.min(current + 1, last), Home: 0, End: last }[event.key]
  if (next !== undefined) {
    event.preventDefault()
    activeIndex.value = next
  }
  else if (event.key === 'Escape') {
    activeIndex.value = null
  }
}

const tooltipStyle = computed(() => {
  if (!active.value) return {}
  const px = x(active.value.from)
  return px > width.value - 210
    ? { right: `${width.value - px + 8}px`, top: `${PAD.top}px` }
    : { left: `${px + 8}px`, top: `${PAD.top}px` }
})

/** « Depuis le 2 novembre », « Le 1 nov », « Du 20 oct au 1 nov » : le dernier jour est la veille du changement suivant. */
function periodLabel(step: { from: string, to: string, current: boolean }) {
  if (step.current) return `Depuis le ${formatDay(step.from, 'd MMMM')}`
  const lastDay = format(subDays(parseISO(step.to), 1), 'yyyy-MM-dd')
  return lastDay === step.from ? `Le ${formatDay(step.from)}` : `Du ${formatDay(step.from)} au ${formatDay(lastDay)}`
}

const ariaLabel = computed(() =>
  `Objectifs successifs en ${metric.value.key === 'calories' ? 'kcal' : `${metric.value.label.toLowerCase()} (g)`} par jour, depuis le ${formatDay(start.value, 'd MMMM')}. `
  + 'Flèches gauche et droite pour parcourir les objectifs.')

/** Tableau, du plus récent au plus ancien. */
const rows = computed(() => [...steps.value].reverse())
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="!steps.length" class="py-6 text-sm text-dimmed">
      Aucun objectif enregistré pour l'instant.
    </p>

    <template v-else>
      <UTabs
        v-model="metricKey"
        :items="METRIC_ITEMS"
        :content="false"
        variant="pill"
        size="xs"
        aria-label="Valeur affichée"
        class="w-full sm:w-auto sm:self-start"
      />

      <div
        ref="container"
        class="relative w-full touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :style="{ height: `${HEIGHT}px` }"
        tabindex="0"
        role="img"
        :aria-label="ariaLabel"
        @pointermove="onPointerMove"
        @pointerleave="activeIndex = null"
        @keydown="onKeydown"
        @blur="activeIndex = null"
      >
        <svg
          v-if="width > 0"
          :width="width"
          :height="HEIGHT"
          :viewBox="`0 0 ${width} ${HEIGHT}`"
          class="block overflow-visible"
          aria-hidden="true"
        >
          <!-- Période survolée. -->
          <rect
            v-if="active"
            :x="x(active.from)"
            :y="PAD.top - 8"
            :width="Math.max(x(active.to) - x(active.from), 2)"
            :height="innerHeight + 8"
            rx="3"
            class="fill-elevated/60"
          />

          <g class="text-xs tabular-nums" style="font-feature-settings: 'tnum'">
            <text :x="PAD.left - 8" y="12" text-anchor="end" fill="var(--ui-text-muted)">{{ metric.unit }}/j</text>

            <template v-for="tick in yTicks" :key="`y-${tick.value}`">
              <line
                :x1="PAD.left"
                :x2="width - PAD.right"
                :y1="tick.y"
                :y2="tick.y"
                :stroke="tick.value === 0 ? 'var(--ui-border-accented)' : 'var(--ui-border)'"
              />
              <text :x="PAD.left - 8" :y="tick.y + 4" text-anchor="end" fill="var(--ui-text-dimmed)">{{ tick.label }}</text>
            </template>

            <text
              v-for="tick in xTicks"
              :key="`x-${tick.day}`"
              :x="tick.x"
              :y="HEIGHT - 8"
              text-anchor="middle"
              fill="var(--ui-text-dimmed)"
            >{{ tick.label }}</text>

            <!-- Valeur actuelle au bout de la courbe. -->
            <text
              v-if="lastValue !== null"
              :x="x(today) + 8"
              :y="y(lastValue) + 4"
              fill="var(--ui-text-highlighted)"
              class="font-semibold"
            >{{ formatNumber(lastValue) }}</text>
          </g>

          <path
            :key="metric.key"
            :d="path"
            :class="metric.strokeClass"
            class="history-line"
            pathLength="1"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Un point à chaque changement, cerclé du fond. -->
          <circle
            v-for="(step, i) in steps"
            :key="`dot-${step.from}`"
            :cx="x(step.from)"
            :cy="y(valueOf(step.targets))"
            :r="activeIndex === i ? 5 : 4"
            :class="metric.fillClass"
            stroke="var(--ui-bg)"
            stroke-width="2"
          />
        </svg>

        <div
          v-if="active"
          class="pointer-events-none absolute w-48 rounded-lg border border-default bg-default p-3 text-xs"
          :style="tooltipStyle"
        >
          <p class="font-semibold text-highlighted">
            {{ periodLabel(active) }}
          </p>
          <dl class="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
            <template v-for="m in METRICS" :key="m.key">
              <dt class="flex items-center gap-1.5" :class="m.key === metric.key ? 'text-highlighted' : 'text-muted'">
                <span class="size-2 rounded-full" :class="m.dotClass" aria-hidden="true" />
                {{ m.key === 'calories' ? 'Énergie' : m.label }}
              </dt>
              <dd class="text-end text-highlighted" :class="{ 'font-semibold': m.key === metric.key }">
                {{ formatNumber(active.targets[m.key]) }} <span class="font-normal text-dimmed">{{ m.unit }}</span>
              </dd>
            </template>
          </dl>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg border border-default">
        <table class="w-full text-sm tabular-nums">
          <caption class="sr-only">
            Objectifs successifs, du plus récent au plus ancien
          </caption>
          <thead>
            <tr class="border-b border-default text-xs uppercase tracking-wide text-dimmed">
              <th scope="col" class="px-4 py-2 text-start font-semibold">
                Période
              </th>
              <th scope="col" class="px-2 py-2 text-end font-semibold">
                kcal
              </th>
              <th v-for="macro in MACROS" :key="macro.key" scope="col" class="px-2 py-2 text-end font-semibold last:pe-4">
                <abbr :title="macro.label" class="no-underline">{{ macro.letter }}</abbr>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="row in rows" :key="row.from">
              <th scope="row" class="px-4 py-2.5 text-start font-normal text-highlighted">
                {{ periodLabel(row) }}
              </th>
              <td class="px-2 py-2.5 text-end font-semibold text-highlighted">
                {{ formatNumber(row.targets.calories) }}
              </td>
              <td v-for="macro in MACROS" :key="macro.key" class="px-2 py-2.5 text-end text-muted last:pe-4">
                {{ formatNumber(row.targets[macro.key]) }} g
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* La courbe se redessine à chaque changement de valeur affichée. */
.history-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: draw-history 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes draw-history {
  from {
    stroke-dashoffset: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .history-line {
    animation: none;
  }
}
</style>
