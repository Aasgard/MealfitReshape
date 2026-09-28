<script setup lang="ts">
/**
 * Courbe d'une zone de mensuration. Avec peu de séances, chaque point porte sa valeur et sa date :
 * pas d'infobulle à chercher. Dessinée en pixels réels pour garder des libellés lisibles sur mobile.
 */
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { ZonePoint } from '~/utils/measurements'

const props = defineProps<{
  points: ZonePoint[]
}>()

const HEIGHT = 190
const PAD = { top: 28, right: 24, bottom: 28, left: 24 }
/** Au-delà, seuls le premier et le dernier point sont annotés pour éviter les chevauchements. */
const MAX_LABELLED_POINTS = 6

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

const first = computed(() => props.points[0]!)
const totalDays = computed(() => Math.max(differenceInCalendarDays(parseISO(props.points.at(-1)!.date), parseISO(first.value.date)), 1))

const yDomain = computed(() => {
  const values = props.points.map(p => p.valueCm)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max((max - min) * 0.15, 0.5)
  return { min: min - pad, max: max + pad }
})

const x = (date: string) => PAD.left + (differenceInCalendarDays(parseISO(date), parseISO(first.value.date)) / totalDays.value) * (width.value - PAD.left - PAD.right)
const y = (cm: number) => PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - (cm - yDomain.value.min) / (yDomain.value.max - yDomain.value.min))

const dots = computed(() => props.points.map((p, i) => {
  const isEdge = i === 0 || i === props.points.length - 1
  return {
    ...p,
    cx: x(p.date),
    cy: y(p.valueCm),
    labelled: props.points.length <= MAX_LABELLED_POINTS || isEdge,
    anchor: i === 0 ? 'start' : i === props.points.length - 1 ? 'end' : 'middle',
    isLast: i === props.points.length - 1,
  }
}))

const linePath = computed(() => dots.value.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.cx.toFixed(1)} ${d.cy.toFixed(1)}`).join(' '))

/** Ligne de référence à la première mesure : l'écart se lit contre elle. */
const baselineY = computed(() => y(first.value.valueCm))
</script>

<template>
  <div ref="container" class="w-full" :style="{ height: `${HEIGHT}px` }">
    <svg
      v-if="width > 0"
      :width="width"
      :height="HEIGHT"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      class="block overflow-visible"
      aria-hidden="true"
    >
      <line
        :x1="PAD.left"
        :x2="width - PAD.right"
        :y1="baselineY"
        :y2="baselineY"
        stroke="var(--ui-border-accented)"
        stroke-dasharray="3 4"
      />
      <path
        :key="linePath"
        :d="linePath"
        class="zone-line"
        pathLength="1"
        fill="none"
        stroke="var(--ui-primary)"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <g v-for="d in dots" :key="d.date" class="text-xs tabular-nums">
        <circle
          :cx="d.cx"
          :cy="d.cy"
          :r="d.isLast ? 5 : 3.5"
          :fill="d.isLast ? 'var(--ui-primary)' : 'var(--ui-bg)'"
          stroke="var(--ui-primary)"
          stroke-width="2"
        />
        <template v-if="d.labelled">
          <text
            :x="d.cx"
            :y="d.cy - 12"
            :text-anchor="d.anchor"
            :font-weight="d.isLast ? 700 : 500"
            :fill="d.isLast ? 'var(--ui-text-highlighted)' : 'var(--ui-text-muted)'"
          >{{ formatCm(d.valueCm) }}</text>
          <text
            :x="d.cx"
            :y="HEIGHT - 6"
            :text-anchor="d.anchor"
            fill="var(--ui-text-dimmed)"
          >{{ format(parseISO(d.date), 'd MMM', { locale: fr }) }}</text>
        </template>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.zone-line {
  stroke-dasharray: 1;
  animation: draw-zone 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes draw-zone {
  from {
    stroke-dashoffset: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .zone-line {
    animation: none;
  }
}
</style>
