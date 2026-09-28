<script setup lang="ts">
/**
 * Silhouette de face, dessinée comme un schéma de fiche technique : chaque zone porte un ruban
 * (ellipse) à l'endroit où l'on mesure, relié par une ligne de cote à son étiquette.
 * Les membres sont mesurés du côté droit de la personne, donc à gauche du dessin.
 * Les étiquettes sont des boutons HTML posés sur le SVG : elles restent lisibles et accessibles.
 */
import type { MeasurementZoneKey, ZoneSummary } from '~/utils/measurements'

const props = defineProps<{
  summaries: ZoneSummary[]
  /** Silhouette grisée, sans étiquettes cliquables (aucune séance). */
  disabled?: boolean
}>()

const selected = defineModel<MeasurementZoneKey | null>('selected', { default: null })

const VIEW_W = 440
const VIEW_H = 520
/** La silhouette est dessinée autour de x = 200 puis décalée pour laisser deux colonnes d'étiquettes. */
const FIGURE_OFFSET = 20
const LEFT_EDGE = 124
const RIGHT_EDGE = 316

/** Position du ruban de chaque zone, en coordonnées de la silhouette (avant décalage). */
const BANDS: Record<MeasurementZoneKey, { y: number, x1: number, x2: number, side: 'left' | 'right' }> = {
  neck: { y: 84, x1: 190, x2: 210, side: 'left' },
  chest: { y: 142, x1: 155, x2: 245, side: 'right' },
  arm: { y: 152, x1: 134, x2: 152, side: 'left' },
  waist: { y: 205, x1: 163, x2: 237, side: 'right' },
  hips: { y: 252, x1: 158, x2: 242, side: 'right' },
  thigh: { y: 318, x1: 162, x2: 197, side: 'left' },
  calf: { y: 432, x1: 166, x2: 194, side: 'left' },
}

/** Moitié gauche du contour (cou → épaule → bras → flanc → jambe → entrejambe), reflétée pour l'autre moitié. */
const HALF_OUTLINE = [
  'M 191 72 L 190 92',
  'C 176 96, 158 97, 150 104',
  'C 140 112, 134 140, 132 170',
  'C 130 205, 126 245, 124 282',
  'C 123 292, 126 300, 132 300',
  'C 138 300, 140 292, 139 282',
  'C 140 250, 144 215, 146 185',
  'C 148 165, 150 148, 154 136',
  'C 154 160, 158 185, 163 205',
  'C 166 222, 159 236, 158 252',
  'C 156 275, 160 300, 163 330',
  'C 166 365, 168 385, 169 400',
  'C 170 412, 164 432, 170 460', 'C 173 478, 177 492, 180 500',
  'C 181 508, 190 510, 196 506',
  'C 196 480, 194 440, 194 400',
  'C 194 360, 198 320, 200 296',
].join(' ')

const zones = computed(() => props.summaries.map((summary) => {
  const band = BANDS[summary.zone.key]
  const x1 = band.x1 + FIGURE_OFFSET
  const x2 = band.x2 + FIGURE_OFFSET
  return {
    summary,
    key: summary.zone.key,
    side: band.side,
    band: { cx: (x1 + x2) / 2, cy: band.y, rx: (x2 - x1) / 2 },
    leader: band.side === 'left'
      ? { x1: LEFT_EDGE, x2: x1 - 3, y: band.y }
      : { x1: x2 + 3, x2: RIGHT_EDGE, y: band.y },
    labelStyle: band.side === 'left'
      ? { right: `${100 - (LEFT_EDGE / VIEW_W) * 100}%`, top: `${(band.y / VIEW_H) * 100}%` }
      : { left: `${(RIGHT_EDGE / VIEW_W) * 100}%`, top: `${(band.y / VIEW_H) * 100}%` },
  }
}))

function select(key: MeasurementZoneKey) {
  if (!props.disabled) selected.value = key
}
</script>

<template>
  <div class="relative mx-auto w-full" :style="{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }">
    <svg
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      class="absolute inset-0 size-full"
      :class="disabled && 'opacity-40'"
      fill="none"
      aria-hidden="true"
    >
      <g :transform="`translate(${FIGURE_OFFSET} 0)`" stroke="var(--ui-border-accented)" stroke-width="1.5" stroke-linejoin="round">
        <!-- Remplit le fin coin central laissé entre les deux moitiés (du cou à l'entrejambe). -->
        <polygon points="191,72 209,72 200,296" fill="var(--ui-bg-elevated)" stroke="none" />
        <ellipse cx="200" cy="46" rx="22" ry="27" fill="var(--ui-bg-elevated)" />
        <path :d="HALF_OUTLINE" fill="var(--ui-bg-elevated)" />
        <path :d="HALF_OUTLINE" fill="var(--ui-bg-elevated)" transform="translate(400 0) scale(-1 1)" />
      </g>

      <g v-for="z in zones" :key="z.key" class="transition-colors duration-200">
        <line
          :x1="z.leader.x1"
          :x2="z.leader.x2"
          :y1="z.leader.y"
          :y2="z.leader.y"
          :stroke="selected === z.key ? 'var(--ui-primary)' : 'var(--ui-text-dimmed)'"
          stroke-width="1"
          :stroke-dasharray="selected === z.key ? undefined : '2 3'"
        />
        <ellipse
          :cx="z.band.cx"
          :cy="z.band.cy"
          :rx="z.band.rx"
          ry="4"
          :stroke="selected === z.key ? 'var(--ui-primary)' : 'var(--ui-text-muted)'"
          :stroke-width="selected === z.key ? 2.5 : 1.5"
        />
      </g>
    </svg>

    <button
      v-for="z in zones"
      :key="`label-${z.key}`"
      type="button"
      class="group absolute flex -translate-y-1/2 cursor-pointer flex-col rounded-md px-1.5 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
      :class="[
        z.side === 'left' ? 'items-end text-end' : 'items-start text-start',
        selected === z.key ? 'bg-primary/10' : 'hover:bg-elevated',
      ]"
      :style="z.labelStyle"
      :disabled="disabled"
      :aria-pressed="selected === z.key"
      :aria-label="z.summary.latest
        ? `${z.summary.zone.label} : ${formatCm(z.summary.latest.valueCm)} cm${z.summary.sinceStartCm !== null ? `, ${formatSignedCm(z.summary.sinceStartCm)} cm depuis le départ` : ''}`
        : `${z.summary.zone.label} : pas encore mesuré`"
      @click="select(z.key)"
    >
      <span
        class="text-xs font-semibold uppercase leading-tight tracking-wide"
        :class="selected === z.key ? 'text-primary' : 'text-dimmed'"
      >{{ z.summary.zone.label }}</span>
      <span class="flex items-baseline gap-1.5 whitespace-nowrap tabular-nums leading-tight">
        <span class="text-sm font-bold text-highlighted sm:text-base">{{ z.summary.latest ? formatCm(z.summary.latest.valueCm) : '—' }}</span>
        <span v-if="z.summary.sinceStartCm !== null" class="text-xs text-muted">{{ formatSignedCm(z.summary.sinceStartCm) }}</span>
      </span>
    </button>
  </div>
</template>
