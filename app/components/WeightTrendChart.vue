<script setup lang="ts">
/**
 * Courbe de poids : pesées brutes (points), tendance 7 jours (ligne), projection du calculateur
 * (pointillés) et objectif (ligne horizontale). Dessinée en pixels réels à partir de la largeur
 * mesurée du conteneur, pour que les libellés gardent leur taille sur mobile.
 */
import { differenceInCalendarDays, format, parseISO, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { TrendPoint, WeightGoal } from '~/utils/weightTrend'

const props = defineProps<{
  points: TrendPoint[]
  goal: WeightGoal | null
  /** Bornes de la période affichée, au format `yyyy-MM-dd`. */
  from: string
  to: string
}>()

const HEIGHT = 260
const PAD = { top: 16, right: 12, bottom: 28, left: 36 }

const container = ref<HTMLElement | null>(null)
const width = ref(0)
let observer: ResizeObserver | null = null

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.round(entry!.contentRect.width)
  })
  observer.observe(container.value!)
})
onBeforeUnmount(() => observer?.disconnect())

const visible = computed(() => props.points.filter(p => p.date >= props.from && p.date <= props.to))

const fromDate = computed(() => parseISO(props.from))
const totalDays = computed(() => Math.max(differenceInCalendarDays(parseISO(props.to), fromDate.value), 1))
const innerWidth = computed(() => Math.max(width.value - PAD.left - PAD.right, 1))
const innerHeight = HEIGHT - PAD.top - PAD.bottom

/** Sommets de la projection sur la période : départ, éventuel palier à l'objectif, fin. */
const projection = computed(() => {
  const goal = props.goal
  if (!goal) return []
  const start = goal.startDate > props.from ? goal.startDate : props.from
  if (start > props.to) return []
  const dates = [start]
  const reach = projectionReachDate(goal)
  if (reach && reach > start && reach < props.to) dates.push(reach)
  dates.push(props.to)
  return dates.map(date => ({ date, weightKg: projectionAt(goal, date) }))
})

const yDomain = computed(() => {
  const values = visible.value.flatMap(p => [p.weightKg, p.trendKg])
  values.push(...projection.value.map(p => p.weightKg))
  if (props.goal) values.push(props.goal.targetWeightKg)
  if (values.length === 0) return { min: 0, max: 1, step: 1 }
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = Math.max((rawMax - rawMin) * 0.08, 0.3)
  const range = rawMax - rawMin + pad * 2
  const step = [0.5, 1, 2, 5, 10].find(s => range / s <= 5) ?? 10
  return {
    min: Math.floor((rawMin - pad) / step) * step,
    max: Math.ceil((rawMax + pad) / step) * step,
    step,
  }
})

const x = (date: string) => PAD.left + (differenceInCalendarDays(parseISO(date), fromDate.value) / totalDays.value) * innerWidth.value
const y = (kg: number) => PAD.top + innerHeight - ((kg - yDomain.value.min) / (yDomain.value.max - yDomain.value.min)) * innerHeight

const yTicks = computed(() => {
  const { min, max, step } = yDomain.value
  const ticks = []
  for (let kg = min; kg <= max + 1e-9; kg += step) ticks.push({ kg, y: y(kg), label: formatWeight(kg, step < 1 ? 1 : 0) })
  return ticks
})

const xTicks = computed(() => {
  const count = Math.min(Math.max(Math.floor(innerWidth.value / 90), 2), 6)
  return Array.from({ length: count }, (_, i) => {
    const date = format(addDays(fromDate.value, Math.round((totalDays.value * i) / (count - 1))), 'yyyy-MM-dd')
    return { date, x: x(date), label: format(parseISO(date), 'd MMM', { locale: fr }), anchor: i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle' }
  })
})

/** Tendance découpée en segments : un trou de plus de 4 jours interrompt la ligne. */
const trendSegments = computed(() => {
  const segments: string[] = []
  let current = ''
  let previous: TrendPoint | null = null
  for (const p of visible.value) {
    const gap = previous ? differenceInCalendarDays(parseISO(p.date), parseISO(previous.date)) : 0
    const command = !previous || gap > TREND_GAP_BREAK_DAYS ? 'M' : 'L'
    if (command === 'M' && current) {
      segments.push(current)
      current = ''
    }
    current += `${command} ${x(p.date).toFixed(1)} ${y(p.trendKg).toFixed(1)} `
    previous = p
  }
  if (current) segments.push(current)
  return segments
})

const projectionPath = computed(() =>
  projection.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date).toFixed(1)} ${y(p.weightKg).toFixed(1)}`).join(' '),
)

const lastPoint = computed(() => visible.value[visible.value.length - 1] ?? null)

// --- Survol, toucher et clavier ---

const activeIndex = ref<number | null>(null)
const active = computed(() => (activeIndex.value === null ? null : visible.value[activeIndex.value] ?? null))

function onPointerMove(event: PointerEvent) {
  if (!container.value || visible.value.length === 0) return
  const px = event.clientX - container.value.getBoundingClientRect().left
  let best = 0
  let bestDistance = Infinity
  visible.value.forEach((p, i) => {
    const distance = Math.abs(x(p.date) - px)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  })
  activeIndex.value = best
}

function onKeydown(event: KeyboardEvent) {
  const last = visible.value.length - 1
  if (last < 0) return
  const current = activeIndex.value ?? last
  const next = {
    ArrowLeft: Math.max(current - 1, 0),
    ArrowRight: Math.min(current + 1, last),
    Home: 0,
    End: last,
  }[event.key]
  if (next !== undefined) {
    event.preventDefault()
    activeIndex.value = next
  }
  else if (event.key === 'Escape') {
    activeIndex.value = null
  }
}

watch(() => [props.from, props.to, props.points], () => {
  activeIndex.value = null
})

const tooltipStyle = computed(() => {
  if (!active.value) return {}
  const px = x(active.value.date)
  const flip = px > width.value - 190
  return flip
    ? { right: `${width.value - px + 12}px`, top: `${PAD.top}px` }
    : { left: `${px + 12}px`, top: `${PAD.top}px` }
})

const ariaLabel = computed(() => {
  const first = visible.value[0]
  const last = lastPoint.value
  if (!first || !last) return 'Aucune pesée sur la période'
  return `Tendance du poids du ${format(parseISO(first.date), 'd MMMM', { locale: fr })} au ${format(parseISO(last.date), 'd MMMM', { locale: fr })} : de ${formatWeight(first.trendKg)} à ${formatWeight(last.trendKg)} kg. Flèches gauche et droite pour parcourir les pesées.`
})
</script>

<template>
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
      <g class="text-xs tabular-nums" style="font-feature-settings: 'tnum'">
        <template v-for="tick in yTicks" :key="`y-${tick.kg}`">
          <line
            :x1="PAD.left"
            :x2="width - PAD.right"
            :y1="tick.y"
            :y2="tick.y"
            stroke="var(--ui-border)"
          />
          <text
            :x="PAD.left - 8"
            :y="tick.y + 4"
            text-anchor="end"
            fill="var(--ui-text-dimmed)"
          >{{ tick.label }}</text>
        </template>
        <text
          v-for="tick in xTicks"
          :key="`x-${tick.date}`"
          :x="tick.x"
          :y="HEIGHT - 8"
          :text-anchor="tick.anchor"
          fill="var(--ui-text-dimmed)"
        >{{ tick.label }}</text>
      </g>

      <g v-if="goal">
        <line
          :x1="PAD.left"
          :x2="width - PAD.right"
          :y1="y(goal.targetWeightKg)"
          :y2="y(goal.targetWeightKg)"
          stroke="var(--ui-text-muted)"
          stroke-width="1"
        />
        <text
          :x="PAD.left + 6"
          :y="y(goal.targetWeightKg) - 6"
          class="text-xs font-semibold"
          fill="var(--ui-text-muted)"
        >Objectif {{ formatWeight(goal.targetWeightKg) }} kg</text>
      </g>

      <path
        v-if="projectionPath"
        :d="projectionPath"
        fill="none"
        stroke="var(--ui-text-dimmed)"
        stroke-width="1.5"
        stroke-dasharray="4 4"
      />

      <circle
        v-for="p in visible"
        :key="`dot-${p.id}`"
        :cx="x(p.date)"
        :cy="y(p.weightKg)"
        r="2.5"
        fill="var(--ui-text-dimmed)"
        fill-opacity="0.7"
      />

      <g :key="`${from}-${to}-${width > 0}`">
        <path
          v-for="(segment, i) in trendSegments"
          :key="i"
          :d="segment"
          class="trend-line"
          pathLength="1"
          fill="none"
          stroke="var(--ui-primary)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>

      <g v-if="lastPoint && !active">
        <circle
          :cx="x(lastPoint.date)"
          :cy="y(lastPoint.trendKg)"
          r="4.5"
          fill="var(--ui-primary)"
          stroke="var(--ui-bg)"
          stroke-width="2"
        />
        <text
          :x="x(lastPoint.date) - 8"
          :y="y(lastPoint.trendKg) - 10"
          text-anchor="end"
          class="text-xs font-semibold tabular-nums"
          fill="var(--ui-text-highlighted)"
        >{{ formatWeight(lastPoint.trendKg) }} kg</text>
      </g>

      <g v-if="active">
        <line
          :x1="x(active.date)"
          :x2="x(active.date)"
          :y1="PAD.top"
          :y2="HEIGHT - PAD.bottom"
          stroke="var(--ui-border-accented)"
        />
        <circle
          :cx="x(active.date)"
          :cy="y(active.weightKg)"
          r="4"
          fill="var(--ui-text-muted)"
          stroke="var(--ui-bg)"
          stroke-width="2"
        />
        <circle
          :cx="x(active.date)"
          :cy="y(active.trendKg)"
          r="4.5"
          fill="var(--ui-primary)"
          stroke="var(--ui-bg)"
          stroke-width="2"
        />
      </g>
    </svg>

    <div
      v-if="active"
      class="pointer-events-none absolute w-44 rounded-lg border border-default bg-default p-3 text-xs"
      :style="tooltipStyle"
    >
      <p class="font-semibold text-highlighted first-letter:uppercase">
        {{ format(parseISO(active.date), 'EEEE d MMMM', { locale: fr }) }}
      </p>
      <dl class="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
        <dt class="text-muted">
          Pesée
        </dt>
        <dd class="text-end text-highlighted">
          {{ formatWeight(active.weightKg) }} kg
        </dd>
        <dt class="text-muted">
          Tendance
        </dt>
        <dd class="text-end font-semibold text-primary">
          {{ formatWeight(active.trendKg) }} kg
        </dd>
        <template v-if="goal && active.date >= goal.startDate">
          <dt class="text-muted">
            Projection
          </dt>
          <dd class="text-end text-highlighted">
            {{ formatWeight(projectionAt(goal, active.date)) }} kg
          </dd>
        </template>
      </dl>
      <p v-if="active.note" class="mt-2 border-t border-default pt-2 text-muted">
        {{ active.note }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.trend-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: draw-trend 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes draw-trend {
  from {
    stroke-dashoffset: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .trend-line {
    animation: none;
  }
}
</style>
