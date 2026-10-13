<script setup lang="ts">
/**
 * Bilan énergétique du suivi de poids : par semaine, le déficit moyen par jour complet (comme la moyenne des Menus) et
 * la variation de poids, en points reliés. Les deux axes sont liés par les kcal par kg du modèle : quand le poids suit
 * le déficit, les deux courbes se superposent. Dessiné en pixels réels, comme la courbe de poids.
 */
import type { TabsItem } from '@nuxt/ui'
import { addDays, getISOWeek, parseISO, startOfWeek, subWeeks } from 'date-fns'
import type { EnergyWeek } from '~/utils/energyBalance'
import { buildEntriesByDay, isCompleteDay, summarizeDay } from '~/utils/menuEntries'
import { dayKeyOf, formatWeekLabel, WEEK_STARTS_ON } from '~/utils/menuWeek'
import type { WeighIn } from '~/utils/weightTrend'

const props = defineProps<{
  /** Pesées triées par date. */
  points: WeighIn[]
}>()

const profile = useProfile()

const RANGES = [
  { label: '8 sem.', value: '8' },
  { label: '3 mois', value: '13' },
  { label: '6 mois', value: '26' },
] satisfies TabsItem[]

const range = ref<string>('8')

const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON })
const firstWeekStart = computed(() => subWeeks(currentWeekStart, Number(range.value)))

// --- Données : repas et séances de la période ---

const meals = useMealsBetween(() => ({ start: firstWeekStart.value, end: new Date() }))
const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()
const { workouts } = useWorkouts()

const pending = computed(() => meals.pending.value || recipes.pending.value || ingredients.pending.value)

/** kcal des jours complets seulement, comme la moyenne de la semaine dans les Menus. */
const eatenByDay = computed(() => {
  const byDay = new Map<string, number>()
  for (const [day, entries] of Object.entries(buildEntriesByDay(meals.value, recipesById.value, ingredientsById.value))) {
    if (isCompleteDay(entries)) byDay.set(day, summarizeDay(entries).kcal)
  }
  return byDay
})

const sessionsByDay = computed(() => {
  const byDay = new Map<string, { kcal: number, count: number }>()
  for (const workout of workouts.value) {
    if (workout.kcal === null) continue
    const day = dayKeyOf(workout.date.toDate())
    const current = byDay.get(day) ?? { kcal: 0, count: 0 }
    byDay.set(day, { kcal: current.kcal + workout.kcal, count: current.count + 1 })
  }
  return byDay
})

/** Le modèle a besoin de l'âge et de la taille ; le poids vient des pesées de chaque semaine. */
const bodyInput = computed(() => {
  if (profile.age === null || !profile.body.heightCm) return null
  return {
    sex: profile.body.sex,
    ageYears: profile.age,
    heightCm: profile.body.heightCm,
    measuredBodyFatPercent: profile.body.bodyFatPercent,
    pal: activityPal(profile.body.activity),
  }
})

/** Semaines terminées, de la plus ancienne à la plus récente, sans celles d'avant les premières données. */
const weeks = computed<EnergyWeek[]>(() => {
  const body = bodyInput.value
  if (!body) return []
  const weekStarts = Array.from({ length: Number(range.value) }, (_, i) => dayKeyOf(addDays(firstWeekStart.value, i * 7)))
  const all = buildEnergyWeeks({
    weekStarts,
    currentWeekStart: dayKeyOf(currentWeekStart),
    eatenByDay: eatenByDay.value,
    sessionsByDay: sessionsByDay.value,
    weighIns: props.points,
    body,
    // Même objectif que les résumés de l'accueil et des Menus, pour que les kcal restantes soient les mêmes.
    targetKcal: DAILY_TARGETS.calories,
  })
  const first = all.findIndex(w => w.energy || w.actualKg !== null)
  return first === -1 ? [] : all.slice(first)
})

const summary = computed(() => summarizeEnergyWeeks(weeks.value))

/** kcal par kg retenues pour lier les deux axes : la moyenne des semaines (elles varient de quelques dizaines). */
const kcalPerKg = computed(() => {
  const values = weeks.value.flatMap(w => (w.energy ? [w.energy.kcalPerKg] : []))
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 7000
})

/** kcal/j de déficit ↔ kg/semaine : un déficit tenu 7 jours, divisé par les kcal par kg (perte = négatif). */
const kgPerWeekOf = (deficitKcal: number) => -(deficitKcal * 7) / kcalPerKg.value
const deficitOf = (kgPerWeek: number) => -(kgPerWeek * kcalPerKg.value) / 7

// --- Dimensions ---

const HEIGHT = 240
const PAD = { top: 28, right: 48, bottom: 28, left: 48 }

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

// --- Échelle commune, en kcal/j (la perte est convertie) ---

const series = computed(() => weeks.value.map(week => ({
  week,
  deficit: week.energy?.deficit ?? null,
  /** Variation constatée, convertie en kcal/j de déficit pour partager l'axe. */
  actualAsDeficit: week.actualKg === null ? null : deficitOf(week.actualKg),
})))

/**
 * Échelle resserrée sur les valeurs affichées (zéro n'est pas forcé) : les écarts d'une semaine à l'autre restent
 * lisibles. Une graduation entière de marge au plus de chaque côté.
 */
const yDomain = computed(() => {
  const values = series.value.flatMap(p => [p.deficit, p.actualAsDeficit].filter((v): v is number => v !== null))
  if (!values.length) return { min: 0, max: 100, step: 50 }
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = Math.max(rawMax - rawMin, 100)
  const step = [25, 50, 100, 200, 250, 500, 1000].find(s => span / s <= 5) ?? 1000
  const min = Math.floor(rawMin / step - 1e-9) * step
  return { min, max: Math.max(Math.ceil(rawMax / step + 1e-9) * step, min + step), step }
})

const x = (index: number) => PAD.left + ((index + 0.5) / Math.max(series.value.length, 1)) * innerWidth.value
const y = (deficit: number) => PAD.top + innerHeight - ((deficit - yDomain.value.min) / (yDomain.value.max - yDomain.value.min)) * innerHeight

const leftTicks = computed(() => {
  const { min, max, step } = yDomain.value
  const ticks = []
  for (let kcal = min; kcal <= max + 1e-9; kcal += step) {
    ticks.push({ value: kcal, y: y(kcal), label: kcal < 0 ? `−${formatKcal(kcal)}` : formatKcal(kcal) })
  }
  return ticks
})

/** Graduations rondes en kg/sem, placées sur le même axe (elles ne tombent pas sur les lignes de grille). */
const rightTicks = computed(() => {
  const { min, max } = yDomain.value
  const kgTop = kgPerWeekOf(max)
  const kgBottom = kgPerWeekOf(min)
  const span = kgBottom - kgTop
  const step = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find(s => span / s <= 5) ?? 1
  const decimals = step < 0.1 || step === 0.25 ? 2 : step < 1 ? 1 : 0
  const ticks = []
  for (let kg = Math.ceil(kgTop / step - 1e-9) * step; kg <= kgBottom + 1e-9; kg += step) {
    const rounded = Math.round(kg * 100) / 100
    ticks.push({ value: rounded, y: y(deficitOf(rounded)), label: formatSignedWeight(rounded, decimals) })
  }
  return ticks
})

const xTicks = computed(() => {
  const n = series.value.length
  const every = Math.max(1, Math.ceil(n / Math.max(Math.floor(innerWidth.value / 64), 1)))
  return series.value
    .map((p, i) => ({ i, x: x(i), label: `S${getISOWeek(parseISO(p.week.start))}` }))
    .filter(t => (n - 1 - t.i) % every === 0)
})

/** Courbe interrompue là où une semaine n'a pas de valeur. */
const linePath = (pick: (p: (typeof series.value)[number]) => number | null) => {
  let d = ''
  let previous = false
  series.value.forEach((p, i) => {
    const value = pick(p)
    if (value === null) {
      previous = false
      return
    }
    d += `${previous ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(value).toFixed(1)} `
    previous = true
  })
  return d
}

/**
 * kcal restantes par jour, comme la jauge de l'accueil : objectif − (moyenne mangée des jours complets − séances), sur
 * le bilan net ; colorées comme la jauge (sous, dans, au-delà de l'objectif à ± 5 %).
 */
const remaining = (week: EnergyWeek) => {
  if (!week.energy) return null
  const netKcal = week.energy.eatenKcal - week.energy.sessions
  const kcal = Math.round(week.energy.targetKcal - netKcal)
  const status = targetStatus(netKcal, week.energy.targetKcal, DAILY_TARGET_TOLERANCE)
  return { kcal, label: kcal < 0 ? `+${-kcal}` : kcal > 0 ? `−${kcal}` : '0', color: TARGET_STATUS_COLOR[status], textClass: TARGET_STATUS_TEXT_CLASS[status] }
}

/** Sous ~30 px par semaine, les chiffres se chevaucheraient : seul celui de la semaine survolée reste. */
const showAllRemaining = computed(() => innerWidth.value / Math.max(series.value.length, 1) >= 30)

const deficitPath = computed(() => linePath(p => p.deficit))
const actualPath = computed(() => linePath(p => p.actualAsDeficit))

// --- Survol, toucher et clavier ---

const activeIndex = ref<number | null>(null)
const active = computed(() => (activeIndex.value === null ? null : series.value[activeIndex.value] ?? null))

function onPointerMove(event: PointerEvent) {
  if (!container.value || !series.value.length) return
  const px = event.clientX - container.value.getBoundingClientRect().left
  const slot = innerWidth.value / series.value.length
  activeIndex.value = Math.min(Math.max(Math.floor((px - PAD.left) / slot), 0), series.value.length - 1)
}

function onKeydown(event: KeyboardEvent) {
  const last = series.value.length - 1
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

watch(range, () => {
  activeIndex.value = null
})

/** Légende et explication du graphique, repliées par défaut ; l'état est gardé pour la session. */
const legendOpen = useState('energy-balance-legend-open', () => false)

const tooltipStyle = computed(() => {
  if (activeIndex.value === null) return {}
  const px = x(activeIndex.value)
  const flip = px > width.value - 230
  return flip
    ? { right: `${width.value - px + 12}px`, top: `${PAD.top}px` }
    : { left: `${px + 12}px`, top: `${PAD.top}px` }
})

const weekLabel = (week: EnergyWeek) => formatWeekLabel(parseISO(week.start), parseISO(week.end), { short: true })

const deficitLabel = (deficit: number) => (deficit >= 0 ? 'Déficit' : 'Excédent')

const ariaLabel = computed(() => {
  const s = summary.value
  const base = `Déficit moyen par jour et variation de poids par semaine, sur ${series.value.length} semaines.`
  if (!s) return `${base} Flèches gauche et droite pour parcourir les semaines.`
  return `${base} En moyenne ${formatKcal(s.averageDeficit)} kcal/j de ${s.averageDeficit >= 0 ? 'déficit' : 'excédent'}, ${formatSignedWeight(s.expectedKg)} kg attendus, ${formatSignedWeight(s.actualKg)} kg constatés. Flèches gauche et droite pour parcourir les semaines.`
})
</script>

<template>
  <section aria-labelledby="energy-title" class="flex flex-col gap-4 rounded-xl border border-default bg-default p-4 sm:p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 id="energy-title" class="text-lg font-bold tracking-tight text-highlighted">
          Bilan énergétique
        </h2>
        <p v-if="summary" class="text-sm text-muted">
          Sur {{ summary.weeks }} {{ summary.weeks > 1 ? 'semaines complètes' : 'semaine complète' }},
          {{ summary.averageDeficit >= 0 ? 'déficit' : 'excédent' }} moyen de
          <span class="font-semibold tabular-nums text-highlighted">{{ formatKcal(summary.averageDeficit) }} kcal/j</span> :
          <span class="font-semibold tabular-nums text-highlighted">{{ formatSignedWeight(summary.expectedKg) }} kg</span> attendus,
          <span class="font-semibold tabular-nums text-primary">{{ formatSignedWeight(summary.actualKg) }} kg</span> constatés
        </p>
        <p v-else-if="bodyInput && !pending" class="text-sm text-muted">
          Ce que votre déficit de chaque semaine devrait faire sur la balance, et ce qu'elle a montré.
        </p>
      </div>
      <UTabs
        v-if="bodyInput"
        v-model="range"
        :items="RANGES"
        :content="false"
        variant="pill"
        size="xs"
        class="w-full sm:w-auto"
      />
    </div>

    <!-- Sans âge ni taille, pas de dépense d'entretien. -->
    <div v-if="!bodyInput" class="flex flex-col items-start gap-1">
      <p class="text-sm text-muted">
        Le déficit se calcule à partir de votre entretien, qui demande votre date de naissance et votre taille.
      </p>
      <UButton
        to="/dashboard/profil"
        label="Compléter mon profil"
        trailing-icon="i-lucide-arrow-right"
        color="neutral"
        variant="link"
        size="sm"
        class="-ms-2.5"
      />
    </div>

    <USkeleton v-else-if="pending && !series.length" class="w-full" :style="{ height: `${HEIGHT}px` }" />

    <p v-else-if="!series.length" class="py-6 text-sm text-dimmed">
      Aucune semaine terminée avec des jours complets (déjeuner et dîner saisis) ou des pesées sur la période.
    </p>

    <template v-else>
      <div
        ref="container"
        class="relative w-full touch-pan-y rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary"
        :class="{ 'opacity-60': pending }"
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
            <!-- Unités des deux axes, au-dessus de leurs graduations. -->
            <text :x="PAD.left - 8" y="12" text-anchor="end" fill="var(--ui-text-toned)">kcal/j</text>
            <text :x="width - PAD.right + 8" y="12" fill="var(--ui-primary)">kg/sem</text>

            <template v-for="tick in leftTicks" :key="`l-${tick.value}`">
              <line
                :x1="PAD.left"
                :x2="width - PAD.right"
                :y1="tick.y"
                :y2="tick.y"
                :stroke="tick.value === 0 ? 'var(--ui-border-accented)' : 'var(--ui-border)'"
              />
              <text :x="PAD.left - 8" :y="tick.y + 4" text-anchor="end" fill="var(--ui-text-toned)">{{ tick.label }}</text>
            </template>
            <text
              v-for="tick in rightTicks"
              :key="`r-${tick.value}`"
              :x="width - PAD.right + 8"
              :y="tick.y + 4"
              fill="var(--ui-primary)"
            >{{ tick.label }}</text>
            <text
              v-for="tick in xTicks"
              :key="`x-${tick.i}`"
              :x="tick.x"
              :y="HEIGHT - 8"
              text-anchor="middle"
              fill="var(--ui-text-dimmed)"
            >{{ tick.label }}</text>
          </g>

          <line
            v-if="active"
            :x1="x(activeIndex!)"
            :x2="x(activeIndex!)"
            :y1="PAD.top"
            :y2="HEIGHT - PAD.bottom"
            stroke="var(--ui-border-accented)"
          />

          <g :key="`${range}-${width > 0}`">
            <path
              v-if="deficitPath"
              :d="deficitPath"
              class="energy-line"
              pathLength="1"
              fill="none"
              stroke="var(--ui-text-muted)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              v-if="actualPath"
              :d="actualPath"
              class="energy-line"
              pathLength="1"
              fill="none"
              stroke="var(--ui-primary)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>

          <!-- Points : plein pour une semaine d'au moins 5 jours complets, creux en dessous. -->
          <template v-for="(p, i) in series" :key="p.week.start">
            <circle
              v-if="p.deficit !== null"
              :cx="x(i)"
              :cy="y(p.deficit)"
              :r="activeIndex === i ? 4.5 : 3.5"
              :fill="p.week.status === 'complete' ? 'var(--ui-text-muted)' : 'var(--ui-bg)'"
              stroke="var(--ui-text-muted)"
              stroke-width="1.5"
            />
            <circle
              v-if="p.actualAsDeficit !== null"
              :cx="x(i)"
              :cy="y(p.actualAsDeficit)"
              :r="activeIndex === i ? 5 : 4"
              fill="var(--ui-primary)"
              stroke="var(--ui-bg)"
              stroke-width="1.5"
            />
          </template>

          <!-- kcal restantes au-dessus de chaque point de déficit, détourées pour rester lisibles sur les courbes. -->
          <g class="text-[0.6875rem] font-semibold tabular-nums" style="font-feature-settings: 'tnum'; paint-order: stroke">
            <template v-for="(p, i) in series" :key="`kcal-${p.week.start}`">
              <text
                v-if="p.deficit !== null && remaining(p.week) && (showAllRemaining || activeIndex === i)"
                :x="x(i)"
                :y="y(p.deficit) - 9"
                text-anchor="middle"
                :fill="remaining(p.week)!.color"
                stroke="var(--ui-bg)"
                stroke-width="3"
                stroke-linejoin="round"
              >{{ remaining(p.week)!.label }}</text>
            </template>
          </g>
        </svg>

        <div
          v-if="active"
          class="pointer-events-none absolute w-56 rounded-lg border border-default bg-default p-3 text-xs"
          :style="tooltipStyle"
        >
          <p class="font-semibold text-highlighted">
            Semaine {{ getISOWeek(parseISO(active.week.start)) }}
          </p>
          <p class="text-dimmed">
            {{ weekLabel(active.week) }}
          </p>
          <dl class="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
            <template v-if="active.week.energy">
              <dt class="flex items-center gap-1.5 text-muted">
                <span class="size-2 rounded-full bg-(--ui-text-muted)" aria-hidden="true" />
                {{ deficitLabel(active.week.energy.deficit) }} / jour
              </dt>
              <dd class="text-end font-semibold text-highlighted">
                {{ formatKcal(active.week.energy.deficit) }} kcal
              </dd>
              <dt class="ps-3.5 text-muted">
                Soit attendu
              </dt>
              <dd class="text-end text-highlighted">
                {{ formatSignedWeight(active.week.energy.expectedKg, 2) }} kg
              </dd>
              <dt class="ps-3.5 text-muted">
                {{ remaining(active.week)!.kcal < 0 ? 'En trop' : 'Restantes' }}
              </dt>
              <dd class="text-end font-semibold" :class="remaining(active.week)!.textClass">
                {{ remaining(active.week)!.label }} kcal
              </dd>
            </template>
            <template v-else>
              <dt class="text-muted">
                Déficit / jour
              </dt>
              <dd class="text-end text-dimmed">
                —
              </dd>
            </template>
            <dt class="flex items-center gap-1.5 text-muted">
              <span class="size-2 rounded-full bg-primary" aria-hidden="true" />
              Constaté
            </dt>
            <dd class="text-end font-semibold" :class="active.week.actualKg === null ? 'text-dimmed' : 'text-primary'">
              {{ active.week.actualKg === null ? '—' : `${formatSignedWeight(active.week.actualKg, 2)} kg` }}
            </dd>
          </dl>
          <p class="mt-2 border-t border-default pt-2 text-dimmed">
            {{ active.week.loggedDays }} jour{{ active.week.loggedDays > 1 ? 's' : '' }} complet{{ active.week.loggedDays > 1 ? 's' : '' }} sur 7<template v-if="active.week.sessionCount">
              · {{ active.week.sessionCount }} séance{{ active.week.sessionCount > 1 ? 's' : '' }}
            </template>
          </p>
          <p v-if="active.week.energy" class="mt-1 text-dimmed">
            Entretien {{ formatKcal(active.week.energy.maintenanceKcal) }} − mangé {{ formatKcal(active.week.energy.eatenKcal) }}<template v-if="active.week.energy.sessions > 0">
              + séances {{ formatKcal(active.week.energy.sessions) }}
            </template>
          </p>
        </div>
      </div>

      <!-- Légende et explication, repliées par défaut : le graphique reste seul à l'écran. -->
      <UCollapsible v-model:open="legendOpen" class="-mt-1 flex flex-col">
        <button
          type="button"
          class="-mx-1.5 flex cursor-pointer items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <UIcon name="i-lucide-info" class="size-3.5 shrink-0" aria-hidden="true" />
          Lire le graphique
          <UIcon
            name="i-lucide-chevron-down"
            class="size-3.5 shrink-0 transition-transform duration-200"
            :class="{ 'rotate-180': legendOpen }"
            aria-hidden="true"
          />
        </button>

        <template #content>
          <div class="flex flex-col gap-3 pt-2">
            <ul class="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Légende">
              <li class="flex items-center gap-2">
                <svg width="22" height="10" aria-hidden="true">
                  <line x1="1" x2="21" y1="5" y2="5" stroke="var(--ui-text-muted)" stroke-width="1.5" stroke-linecap="round" />
                  <circle cx="11" cy="5" r="3" fill="var(--ui-text-muted)" />
                </svg>
                Déficit moyen / jour complet
              </li>
              <li class="flex items-center gap-2">
                <svg width="22" height="10" aria-hidden="true">
                  <line x1="1" x2="21" y1="5" y2="5" stroke="var(--ui-primary)" stroke-width="2.5" stroke-linecap="round" />
                  <circle cx="11" cy="5" r="3.5" fill="var(--ui-primary)" />
                </svg>
                Variation de poids / semaine
              </li>
              <li class="flex items-center gap-2">
                <svg width="10" height="10" aria-hidden="true">
                  <circle cx="5" cy="5" r="3.25" fill="var(--ui-bg)" stroke="var(--ui-text-muted)" stroke-width="1.5" />
                </svg>
                Moins de {{ MIN_LOGGED_DAYS }} jours complets
              </li>
              <li class="flex items-center gap-2">
                <span class="flex gap-0.5" aria-hidden="true">
                  <span class="size-2 rounded-full bg-info" />
                  <span class="size-2 rounded-full bg-success" />
                  <span class="size-2 rounded-full bg-warning" />
                </span>
                Chiffre : kcal restantes / jour, séances comprises
              </li>
            </ul>
            <p class="text-xs text-dimmed">
              Les deux axes sont liés : <span class="tabular-nums">1 000</span> kcal/j de déficit ≈
              <span class="tabular-nums">{{ formatSignedWeight(kgPerWeekOf(1000), 2) }}</span> kg/sem, à environ
              <span class="tabular-nums">{{ formatKcal(kcalPerKg) }}</span> kcal par kg pour votre composition. Quand le poids suit
              le déficit, les courbes se superposent ; d'une semaine à l'autre, l'eau et le sel les écartent, c'est le cumul qui compte.
            </p>
          </div>
        </template>
      </UCollapsible>
    </template>
  </section>
</template>

<style scoped>
.energy-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: draw-energy 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes draw-energy {
  from {
    stroke-dashoffset: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .energy-line {
    animation: none;
  }
}
</style>
