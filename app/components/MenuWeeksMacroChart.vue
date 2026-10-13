<script setup lang="ts">
/**
 * Semaines des Menus : une barre par semaine empilant, du bas vers le haut, protéines, lipides et glucides (g par jour
 * complet), et une courbe à points des kcal moyennes par jour complet, sur un second axe. Mêmes moyennes que le résumé
 * « Moyenne / jour » (`summarizeMenuWeek`). La semaine affichée est surlignée ; cliquer une barre y mène.
 */
import type { TabsItem } from '@nuxt/ui'
import { addDays, getISOWeek, subWeeks } from 'date-fns'
import { buildEntriesByDay, summarizeMenuWeek } from '~/utils/menuEntries'
import { buildDays, formatWeekLabel, weekId } from '~/utils/menuWeek'

const props = defineProps<{
  /** Lundi de la semaine affichée dans le calendrier. */
  selectedWeekStart: Date
}>()

const emit = defineEmits<{
  'select-week': [weekStart: Date]
}>()

const RANGES = [
  { label: '8 sem.', value: '8' },
  { label: '3 mois', value: '13' },
  { label: '6 mois', value: '26' },
] satisfies TabsItem[]

const range = ref<string>('8')

/** Semaines qui finissent par celle affichée. */
const weekStarts = computed(() => {
  const count = Number(range.value)
  const first = subWeeks(props.selectedWeekStart, count - 1)
  return Array.from({ length: count }, (_, i) => addDays(first, i * 7))
})

/** Replié par défaut ; l'état est gardé pour la session. */
const open = useState('menus-weeks-chart-open', () => false)

/** Fermé, aucune requête : les repas de la période ne sont lus qu'à l'ouverture. */
const meals = useMealsBetween(() => (open.value ? { start: weekStarts.value[0]!, end: addDays(props.selectedWeekStart, 6) } : null))
const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()
const pending = computed(() => meals.pending.value || recipes.pending.value || ingredients.pending.value)

/** Ordre d'empilement demandé, du bas vers le haut. */
const STACK = [
  { key: 'protein', label: 'Protéines', fillClass: 'fill-red-700', dotClass: 'bg-red-700' },
  { key: 'fat', label: 'Lipides', fillClass: 'fill-amber-500', dotClass: 'bg-amber-500' },
  { key: 'carbohydrates', label: 'Glucides', fillClass: 'fill-green-500', dotClass: 'bg-green-500' },
] as const

const weeks = computed(() => {
  const entries = buildEntriesByDay(meals.value, recipesById.value, ingredientsById.value)
  return weekStarts.value.map((start) => {
    const summary = summarizeMenuWeek(entries, buildDays(start).map(day => day.key))
    return {
      start,
      key: weekId(start),
      summary: summary.completeDays ? summary : null,
      completeDays: summary.completeDays,
      selected: weekId(start) === weekId(props.selectedWeekStart),
    }
  })
})

type ChartWeek = (typeof weeks.value)[number]

const hasData = computed(() => weeks.value.some(w => w.summary))

// --- Dimensions ---

const HEIGHT = 220
const PAD = { top: 24, right: 48, bottom: 28, left: 40 }

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

// Le conteneur n'apparaît qu'une fois les données là : on l'observe à son arrivée.
watch(container, (element, previous) => {
  if (previous) observer?.unobserve(previous)
  if (element) observer?.observe(element)
})

const innerWidth = computed(() => Math.max(width.value - PAD.left - PAD.right, 1))
const innerHeight = HEIGHT - PAD.top - PAD.bottom
const slot = computed(() => innerWidth.value / Math.max(weeks.value.length, 1))
const barWidth = computed(() => Math.min(Math.max(slot.value * 0.6, 4), 36))

/** Échelle ronde à partir de zéro, en 5 graduations au plus. */
function niceDomain(max: number, steps: number[]) {
  const step = steps.find(s => max / s <= 4) ?? steps.at(-1)!
  return { max: Math.max(Math.ceil(max / step - 1e-9) * step, step), step }
}

const gramsDomain = computed(() => niceDomain(
  Math.max(...weeks.value.map(w => (w.summary ? STACK.reduce((sum, m) => sum + w.summary!.macros[m.key], 0) : 0)), 1),
  [10, 20, 25, 50, 100, 200],
))
const kcalDomain = computed(() => niceDomain(
  Math.max(...weeks.value.map(w => w.summary?.averageKcal ?? 0), 1),
  [100, 200, 250, 500, 1000],
))

const x = (index: number) => PAD.left + (index + 0.5) * slot.value
const yGrams = (g: number) => PAD.top + innerHeight - (g / gramsDomain.value.max) * innerHeight
const yKcal = (kcal: number) => PAD.top + innerHeight - (kcal / kcalDomain.value.max) * innerHeight

const gramsTicks = computed(() => {
  const ticks = []
  for (let g = 0; g <= gramsDomain.value.max + 1e-9; g += gramsDomain.value.step) ticks.push({ value: g, y: yGrams(g) })
  return ticks
})
const kcalTicks = computed(() => {
  const ticks = []
  for (let kcal = 0; kcal <= kcalDomain.value.max + 1e-9; kcal += kcalDomain.value.step) {
    ticks.push({ value: kcal, y: yKcal(kcal), label: kcal.toLocaleString('fr-FR') })
  }
  return ticks
})

const xTicks = computed(() => {
  const n = weeks.value.length
  const every = Math.max(1, Math.ceil(n / Math.max(Math.floor(innerWidth.value / 56), 1)))
  return weeks.value
    .map((w, i) => ({ i, w, x: x(i), label: `S${getISOWeek(w.start)}` }))
    .filter(t => t.w.selected || (n - 1 - t.i) % every === 0)
})

/** Segments empilés d'une semaine ; 2 px de jour entre deux macros, comme la barre de composition. */
function segments(week: ChartWeek) {
  if (!week.summary) return []
  let base = 0
  return STACK.flatMap((macro) => {
    const grams = week.summary!.macros[macro.key]
    if (grams <= 0) return []
    const bottom = yGrams(base)
    base += grams
    const top = yGrams(base)
    return [{ key: macro.key, fillClass: macro.fillClass, y: top + 1, height: Math.max(bottom - top - 2, 0.5) }]
  })
}

/** Courbe des kcal, interrompue sur une semaine sans jour complet. */
const kcalPath = computed(() => {
  let d = ''
  let previous = false
  weeks.value.forEach((w, i) => {
    if (!w.summary) {
      previous = false
      return
    }
    d += `${previous ? 'L' : 'M'} ${x(i).toFixed(1)} ${yKcal(w.summary.averageKcal).toFixed(1)} `
    previous = true
  })
  return d
})

// --- Survol, toucher, clavier ---

const activeIndex = ref<number | null>(null)
const active = computed(() => (activeIndex.value === null ? null : weeks.value[activeIndex.value] ?? null))

const indexAt = (event: PointerEvent) => {
  const px = event.clientX - container.value!.getBoundingClientRect().left
  return Math.min(Math.max(Math.floor((px - PAD.left) / slot.value), 0), weeks.value.length - 1)
}

function onPointerMove(event: PointerEvent) {
  if (container.value && weeks.value.length) activeIndex.value = indexAt(event)
}

function onClick(event: PointerEvent) {
  if (!container.value) return
  const week = weeks.value[indexAt(event)]
  if (week && !week.selected) emit('select-week', week.start)
}

function onKeydown(event: KeyboardEvent) {
  const last = weeks.value.length - 1
  if (last < 0) return
  const current = activeIndex.value ?? weeks.value.findIndex(w => w.selected)
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
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const week = active.value
    if (week && !week.selected) emit('select-week', week.start)
  }
  else if (event.key === 'Escape') {
    activeIndex.value = null
  }
}

watch(range, () => {
  activeIndex.value = null
})

const tooltipStyle = computed(() => {
  if (activeIndex.value === null) return {}
  const px = x(activeIndex.value)
  const flip = px > width.value - 210
  return flip
    ? { right: `${width.value - px + barWidth.value / 2 + 8}px`, top: `${PAD.top}px` }
    : { left: `${px + barWidth.value / 2 + 8}px`, top: `${PAD.top}px` }
})

const weekLabel = (start: Date) => formatWeekLabel(start, addDays(start, 6), { short: true })

const ariaLabel = computed(() =>
  `Moyenne par jour complet des ${weeks.value.length} semaines jusqu'à celle du ${weekLabel(props.selectedWeekStart)} : `
  + 'protéines, lipides et glucides empilés en grammes, kcal en courbe. Flèches gauche et droite pour parcourir les semaines, Entrée pour afficher la semaine.')
</script>

<template>
  <UCollapsible v-model:open="open" class="flex shrink-0 flex-col rounded-xl border border-default bg-default">
    <!-- En-tête repliable, sur le modèle du résumé « Moyenne / jour » juste au-dessus. -->
    <button
      type="button"
      class="flex w-full cursor-pointer items-center gap-3 rounded-xl p-4 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
    >
      <span id="menu-weeks-title" class="flex-1 text-xs font-semibold uppercase tracking-wide text-dimmed">
        Semaine par semaine
      </span>
      <span class="hidden text-xs text-dimmed sm:inline">Macros et kcal / jour complet</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-dimmed transition-transform duration-200"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      />
    </button>

    <template #content>
      <section aria-labelledby="menu-weeks-title" class="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
        <UTabs
          v-model="range"
          :items="RANGES"
          :content="false"
          variant="pill"
          size="xs"
          class="w-full sm:w-auto sm:self-end"
        />
    
        <USkeleton v-if="pending && !hasData" class="w-full" :style="{ height: `${HEIGHT}px` }" />
    
        <p v-else-if="!hasData" class="py-6 text-sm text-dimmed">
          Aucun jour complet (déjeuner et dîner saisis) sur ces semaines.
        </p>
    
        <template v-else>
          <div
            ref="container"
            class="relative w-full cursor-pointer touch-pan-y rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary"
            :class="{ 'opacity-60': pending }"
            :style="{ height: `${HEIGHT}px` }"
            tabindex="0"
            role="img"
            :aria-label="ariaLabel"
            @pointermove="onPointerMove"
            @pointerleave="activeIndex = null"
            @click="onClick"
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
              <!-- Semaine affichée dans le calendrier : la même teinte que la colonne du jour. -->
              <template v-for="(w, i) in weeks" :key="`bg-${w.key}`">
                <rect
                  v-if="w.selected || activeIndex === i"
                  :x="x(i) - slot / 2"
                  :y="PAD.top - 8"
                  :width="slot"
                  :height="innerHeight + 8"
                  rx="3"
                  :class="w.selected ? 'fill-primary/5' : 'fill-elevated/60'"
                />
              </template>
    
              <g class="text-xs tabular-nums" style="font-feature-settings: 'tnum'">
                <text :x="PAD.left - 8" y="12" text-anchor="end" fill="var(--ui-text-muted)">g/j</text>
                <text :x="width - PAD.right + 8" y="12" fill="var(--ui-text-highlighted)">kcal/j</text>
    
                <template v-for="tick in gramsTicks" :key="`g-${tick.value}`">
                  <line
                    :x1="PAD.left"
                    :x2="width - PAD.right"
                    :y1="tick.y"
                    :y2="tick.y"
                    :stroke="tick.value === 0 ? 'var(--ui-border-accented)' : 'var(--ui-border)'"
                  />
                  <text :x="PAD.left - 8" :y="tick.y + 4" text-anchor="end" fill="var(--ui-text-dimmed)">{{ tick.value }}</text>
                </template>
                <text
                  v-for="tick in kcalTicks"
                  :key="`k-${tick.value}`"
                  :x="width - PAD.right + 8"
                  :y="tick.y + 4"
                  fill="var(--ui-text-dimmed)"
                >{{ tick.label }}</text>
                <text
                  v-for="tick in xTicks"
                  :key="`x-${tick.w.key}`"
                  :x="tick.x"
                  :y="HEIGHT - 8"
                  text-anchor="middle"
                  :class="tick.w.selected ? 'font-semibold' : ''"
                  :fill="tick.w.selected ? 'var(--ui-primary)' : 'var(--ui-text-dimmed)'"
                >{{ tick.label }}</text>
              </g>
    
              <!-- Barres empilées : protéines, lipides, glucides du bas vers le haut. -->
              <g v-for="(w, i) in weeks" :key="`bar-${w.key}`">
                <rect
                  v-for="segment in segments(w)"
                  :key="segment.key"
                  class="macro-segment"
                  :class="segment.fillClass"
                  :x="x(i) - barWidth / 2"
                  :y="segment.y"
                  :width="barWidth"
                  :height="segment.height"
                  rx="2"
                />
              </g>
    
              <path
                v-if="kcalPath"
                :key="`${range}-${width > 0}`"
                :d="kcalPath"
                class="kcal-line"
                pathLength="1"
                fill="none"
                stroke="var(--ui-text-highlighted)"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <template v-for="(w, i) in weeks" :key="`dot-${w.key}`">
                <circle
                  v-if="w.summary"
                  :cx="x(i)"
                  :cy="yKcal(w.summary.averageKcal)"
                  :r="activeIndex === i ? 5 : 4"
                  fill="var(--ui-text-highlighted)"
                  stroke="var(--ui-bg)"
                  stroke-width="2"
                />
              </template>
            </svg>
    
            <div
              v-if="active"
              class="pointer-events-none absolute w-48 rounded-lg border border-default bg-default p-3 text-xs"
              :style="tooltipStyle"
            >
              <p class="font-semibold text-highlighted">
                Semaine {{ getISOWeek(active.start) }}
              </p>
              <p class="text-dimmed">
                {{ weekLabel(active.start) }}
              </p>
              <dl v-if="active.summary" class="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                <dt class="flex items-center gap-1.5 text-muted">
                  <span class="size-2 rounded-full bg-(--ui-text-highlighted)" aria-hidden="true" />
                  Énergie
                </dt>
                <dd class="text-end font-semibold text-highlighted">
                  {{ active.summary.averageKcal.toLocaleString('fr-FR') }} <span class="font-normal text-dimmed">kcal</span>
                </dd>
                <template v-for="macro in [...STACK].reverse()" :key="macro.key">
                  <dt class="flex items-center gap-1.5 text-muted">
                    <span class="size-2 rounded-full" :class="macro.dotClass" aria-hidden="true" />
                    {{ macro.label }}
                  </dt>
                  <dd class="text-end text-highlighted">
                    {{ active.summary.macros[macro.key] }} <span class="text-dimmed">g</span>
                  </dd>
                </template>
              </dl>
              <p class="mt-2 border-t border-default pt-2 text-dimmed">
                <template v-if="active.completeDays">
                  {{ active.completeDays }} jour{{ active.completeDays > 1 ? 's' : '' }} complet{{ active.completeDays > 1 ? 's' : '' }} sur 7
                </template>
                <template v-else>
                  Aucun jour complet
                </template>
                <template v-if="!active.selected">
                  · cliquer pour l'afficher
                </template>
              </p>
            </div>
          </div>
    
          <ul class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Légende">
            <li v-for="macro in STACK" :key="macro.key" class="flex items-center gap-1.5">
              <span class="size-2 rounded-full" :class="macro.dotClass" aria-hidden="true" />
              {{ macro.label }} <span class="text-dimmed">g</span>
            </li>
            <li class="flex items-center gap-1.5">
              <svg width="20" height="10" aria-hidden="true">
                <line x1="1" x2="19" y1="5" y2="5" stroke="var(--ui-text-highlighted)" stroke-width="2" stroke-linecap="round" />
                <circle cx="10" cy="5" r="3" fill="var(--ui-text-highlighted)" />
              </svg>
              kcal
            </li>
          </ul>
        </template>
      </section>
    </template>
  </UCollapsible>
</template>

<style scoped>
.macro-segment {
  transition: y 500ms cubic-bezier(0.16, 1, 0.3, 1), height 500ms cubic-bezier(0.16, 1, 0.3, 1);
}

.kcal-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: draw-kcal 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes draw-kcal {
  from {
    stroke-dashoffset: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .macro-segment {
    transition: none;
  }

  .kcal-line {
    animation: none;
  }
}
</style>
