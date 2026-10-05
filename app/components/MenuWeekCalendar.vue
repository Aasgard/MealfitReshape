<script setup lang="ts">
import type { MealType } from '~/types/meal'
import type { MenuDayHeader, MenuEntry, MenuMealTypeRow } from '~/types/menu'
import { DAILY_TARGET_TOLERANCE, TARGET_STATUS_TEXT_CLASS, targetStatus, type DailyTargets } from '~/utils/dailyTargets'
import { summarizeDay, UNCOUNTED_MEAL_KEY } from '~/utils/menuEntries'
import { DAYS_PER_WEEK } from '~/utils/menuWeek'

const props = withDefaults(defineProps<{
  /**
   * Jours affichés : une semaine, ou trois en mode `continuous` (précédente, affichée, suivante) pour que le
   * défilement passe d'une semaine à l'autre sans attente.
   */
  days: MenuDayHeader[]
  mealTypes: MenuMealTypeRow[]
  /** Repas/aliments par jour (date ISO) puis par type de repas : entries[dayKey][mealTypeKey]. */
  entries?: Record<string, Record<string, MenuEntry[]>>
  /** Objectifs du jour, pour la couleur des kcal en en-tête de colonne. */
  targets: DailyTargets
  /** Repas actuellement copié : mis en évidence, et les boutons "+" indiquent qu'ils vont le coller. */
  copiedEntryId?: string
  /** Mobile, tablette : colonnes de largeur fixe, défilement aimanté par jour, d'une semaine à l'autre. */
  continuous?: boolean
}>(), {
  entries: () => ({}),
  continuous: false,
})

const emit = defineEmits<{
  add: [dayKey: string, mealTypeKey: MealType]
  'select-entry': [entryId: string]
  'edit-entry': [entryId: string]
  'copy-entry': [entryId: string]
  'delete-entry': [entryId: string]
  /** Carte déposée dans la case (jour, ligne) : à enregistrer côté données. */
  'move-entry': [entryId: string, dayKey: string, mealTypeKey: MealType]
  /** Mode continu : le défilement s'est arrêté sur une autre semaine (son lundi). */
  'visible-week': [weekStart: Date]
}>()

const scrollContainer = useTemplateRef<HTMLElement>('scrollContainer')

/** Glisser-déposer en cours : l'aimantation et le changement de semaine attendent la fin du geste. */
const isDragging = ref(false)

/** Liste vide partagée : une identité stable évite de réinitialiser inutilement les cases vides à chaque rendu. */
const NO_ENTRIES: MenuEntry[] = []

const entriesFor = (dayKey: string, mealTypeKey: string): MenuEntry[] =>
  props.entries[dayKey]?.[mealTypeKey] ?? NO_ENTRIES

/** Lignes rangées sous « Autres repas » tant qu'elles sont vides sur tous les jours affichés (comme sur l'accueil). */
const COLLAPSIBLE_MEAL_TYPES: MealType[] = ['SNACK', 'EXCESS', 'NOTCOUNT']

const isRowEmpty = (mealType: MealType) => props.days.every(day => !props.entries[day.key]?.[mealType]?.length)

/** Lignes repliées : vides sur les jours affichés (en mode continu, les trois semaines, pour qu'elles ne sautent pas au défilement). */
const collapsedMealTypes = computed(() =>
  props.mealTypes.filter(row => COLLAPSIBLE_MEAL_TYPES.includes(row.key) && isRowEmpty(row.key)))

/** Dépliées ou non, d'une semaine à l'autre pendant la session. */
const otherRowsOpen = useState('menus-other-rows-open', () => false)

const visibleMealTypes = computed(() => otherRowsOpen.value
  ? props.mealTypes
  : props.mealTypes.filter(row => !collapsedMealTypes.value.includes(row)))

const otherRowsLabel = computed(() => collapsedMealTypes.value.map(row => row.label).join(', '))

/** Totaux de chaque jour pour son en-tête : kcal colorées selon l'objectif, et macros. */
const statusClassOf = (value: number, target: number) =>
  TARGET_STATUS_TEXT_CLASS[targetStatus(value, target, DAILY_TARGET_TOLERANCE)]

/**
 * Comme le résumé : la couleur des chiffres est celle du statut (bleu sous l'objectif, vert à ± 5 %, orange au-delà),
 * les lettres G / P / L restent neutres ; les couleurs propres aux macros sont réservées aux barres.
 */
const dayTotals = computed(() => Object.fromEntries(props.days.map((day) => {
  const { kcal, macros } = summarizeDay(props.entries[day.key] ?? {})
  const macroItems = ([['G', 'carbohydrates'], ['P', 'protein'], ['L', 'fat']] as const).map(([letter, key]) => ({
    letter,
    value: macros[key],
    statusClass: statusClassOf(macros[key], props.targets[key]),
  }))
  return [day.key, { kcal, macroItems, statusClass: statusClassOf(kcal, props.targets.calories) }]
})))

/**
 * Une grille par semaine, chacune avec sa colonne figée de types de repas : la hauteur d'une ligne ne dépend que des
 * jours de sa semaine, pas d'une case bien remplie dans la semaine voisine (mode continu).
 */
const weeks = computed(() => Array.from(
  { length: Math.ceil(props.days.length / DAYS_PER_WEEK) },
  (_, w) => props.days.slice(w * DAYS_PER_WEEK, (w + 1) * DAYS_PER_WEEK),
))

/** Mode continu : colonnes de largeur fixe (la grille doit être aussi large qu'elles pour que la colonne figée colle). */
const CONTINUOUS_GRID_STYLE = { gridTemplateColumns: `3.5rem repeat(${DAYS_PER_WEEK}, 9.5rem)` }

// --- Position du défilement ---

const dayHeaders = () => [...(scrollContainer.value?.querySelectorAll<HTMLElement>('[data-day-key]') ?? [])]
const stickyWidth = () => scrollContainer.value?.querySelector<HTMLElement>('[data-sticky-corner]')?.offsetWidth ?? 0

/** Position (dans le contenu défilant) du bord gauche de l'en-tête de jour `index`. */
const headerOffset = (index: number) => {
  const container = scrollContainer.value
  const header = dayHeaders()[index]
  if (!container || !header) return null
  return header.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft
}

/** Amène la colonne `index` juste à droite de la colonne figée des types de repas. */
const scrollToColumn = (index: number, behavior: ScrollBehavior = 'instant') => {
  const offset = headerOffset(index)
  if (offset !== null) scrollContainer.value?.scrollTo({ left: offset - stickyWidth(), behavior })
}

/** Premier jour visible à droite de la colonne figée (celui sur lequel le défilement s'est aimanté). */
const firstVisibleIndex = () => {
  const container = scrollContainer.value
  if (!container) return 0
  const edge = container.getBoundingClientRect().left + stickyWidth()
  const index = dayHeaders().findIndex(header => header.getBoundingClientRect().right > edge + 1)
  return Math.max(index, 0)
}

/** Semaine affichée : la seule, ou celle du milieu en mode continu. */
const selectedWeekOffset = () => (props.continuous ? DAYS_PER_WEEK : 0)

/** Ouvre la semaine sur aujourd'hui s'il en fait partie, sinon sur son lundi. Sans défilement, le navigateur borne à 0. */
const scrollToSelectedWeek = () => {
  const first = selectedWeekOffset()
  const week = props.days.slice(first, first + DAYS_PER_WEEK)
  const todayIndex = week.findIndex(d => d.isSelected)
  scrollToColumn(first + Math.max(todayIndex, 0))
}

/**
 * Position à rétablir quand les jours sont recalculés après un changement de semaine venu du défilement : la grille
 * est recentrée sur la nouvelle semaine, décalée d'autant, sans que l'écran ne bouge.
 */
let pendingScrollLeft: number | null = null

/**
 * Mode continu : hauteur de la semaine affichée. Le défilement vertical s'arrête à sa dernière ligne au lieu de
 * descendre dans le vide laissé par une semaine voisine plus longue (coupée à cette hauteur jusqu'à ce qu'on y arrive).
 */
const selectedWeekHeight = ref<number | null>(null)
const weekResizeObserver = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver(([entry]) => {
      selectedWeekHeight.value = entry ? (entry.target as HTMLElement).offsetHeight : null
    })

const observeSelectedWeek = () => {
  weekResizeObserver?.disconnect()
  const grid = props.continuous
    ? scrollContainer.value?.querySelector<HTMLElement>(`[data-week="${selectedWeekOffset() / DAYS_PER_WEEK}"]`)
    : null
  if (grid) weekResizeObserver?.observe(grid)
  else selectedWeekHeight.value = null
}
onBeforeUnmount(() => weekResizeObserver?.disconnect())

onMounted(() => {
  scrollToSelectedWeek()
  observeSelectedWeek()
})
watch(() => props.days, () => {
  const container = scrollContainer.value
  if (container && pendingScrollLeft !== null) container.scrollLeft = pendingScrollLeft
  else scrollToSelectedWeek()
  pendingScrollLeft = null
  observeSelectedWeek()
}, { flush: 'post' })
watch(() => props.continuous, () => {
  scrollToSelectedWeek()
  observeSelectedWeek()
}, { flush: 'post' })

/** Mode continu : une fois le défilement arrêté, la semaine du jour au bord gauche devient la semaine affichée. */
/**
 * Arrêt à cheval sur deux semaines : aimante vers celle qui occupe au moins la moitié de la zone visible (hors colonne
 * figée) — son lundi au bord gauche, ou la fin de la semaine d'avant calée au bord droit. `true` si un défilement est
 * lancé (la semaine affichée sera réévaluée à son arrêt).
 */
const snapToMajorityWeek = (container: HTMLElement) => {
  const box = container.getBoundingClientRect()
  const left = box.left + stickyWidth()
  const visible = box.right - left
  const overlaps = [...container.querySelectorAll<HTMLElement>('[data-week]')]
    .map((grid) => {
      const rect = grid.getBoundingClientRect()
      return { rect, share: Math.max(0, Math.min(rect.right, box.right) - Math.max(rect.left, left)) / visible }
    })
    .filter(week => week.share > 0)
  if (overlaps.length !== 2) return false

  const [before, after] = overlaps as [typeof overlaps[number], typeof overlaps[number]]
  const target = after.share >= 0.5
    ? after.rect.left - box.left
    : before.rect.right - box.right
  if (Math.abs(target) < 1) return false
  container.scrollBy({ left: target, behavior: 'smooth' })
  return true
}

const settleOnVisibleWeek = () => {
  const container = scrollContainer.value
  if (!props.continuous || isDragging.value || !container) return
  if (snapToMajorityWeek(container)) return

  const weekShift = Math.floor(firstVisibleIndex() / DAYS_PER_WEEK) - 1
  const newMonday = props.days[(weekShift + 1) * DAYS_PER_WEEK]
  const shiftedBy = (headerOffset((weekShift + 1) * DAYS_PER_WEEK) ?? 0) - (headerOffset(DAYS_PER_WEEK) ?? 0)
  if (!weekShift || !newMonday) return

  // La semaine visible devient celle du milieu : tout le contenu se décale d'autant de semaines.
  pendingScrollLeft = container.scrollLeft - shiftedBy
  emit('visible-week', newMonday.date)
}

/** `scrollend` n'existe pas partout (Safari) : on attend un court moment sans défilement. */
const SCROLL_SETTLE_MS = 120
let settleTimeout: ReturnType<typeof setTimeout> | undefined
const onScroll = () => {
  clearTimeout(settleTimeout)
  settleTimeout = setTimeout(settleOnVisibleWeek, SCROLL_SETTLE_MS)
}
onBeforeUnmount(() => clearTimeout(settleTimeout))

const onDragEnd = () => {
  isDragging.value = false
  onScroll()
}

defineExpose({
  /** Mode continu : fait défiler d'une semaine (± 1) ; la nouvelle semaine est annoncée par `visible-week` à l'arrêt. */
  scrollByWeeks(delta: number) {
    const weekStartIndex = Math.floor(firstVisibleIndex() / DAYS_PER_WEEK) * DAYS_PER_WEEK
    scrollToColumn(weekStartIndex + delta * DAYS_PER_WEEK, 'smooth')
  },
})
</script>

<template>
  <!--
    Mode continu (mobile, tablette) : le calendrier prend la hauteur que lui laisse la page et défile à l'intérieur, la
    ligne des jours reste visible en haut. PC : hauteur naturelle, la page défile et la ligne des jours avec elle.
  -->
  <div class="flex flex-col rounded-xl border border-default bg-default overflow-hidden">
    <!-- Mode continu : le défilement s'arrête au début d'un jour (juste après la colonne figée). -->
    <div
      ref="scrollContainer"
      :class="[
        continuous ? 'min-h-0 flex-1 overflow-auto overscroll-contain' : 'overflow-x-auto',
        continuous && !isDragging ? 'snap-x snap-mandatory scroll-pl-14' : '',
      ]"
      @scroll.passive="onScroll"
    >
      <!-- items-start : une semaine moins remplie garde ses lignes basses au lieu de s'étirer à la hauteur de sa voisine. -->
      <div
        :class="continuous ? 'flex w-max items-start overflow-y-clip' : ''"
        :style="continuous && selectedWeekHeight ? { height: `${selectedWeekHeight}px` } : undefined"
      >
        <div
          v-for="(week, w) in weeks"
          :key="week[0]!.key"
          class="grid"
          :data-week="w"
          :class="[continuous ? 'snap-end' : 'min-w-220 grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]', w > 0 && 'border-l border-default']"
          :style="continuous ? CONTINUOUS_GRID_STYLE : undefined"
        >
          <div data-sticky-corner class="sticky left-0 border-b border-r border-default bg-elevated" :class="continuous ? 'top-0 z-30' : 'z-10'" />
          <div
            v-for="day in week"
            :key="`head-${day.key}`"
            :data-day-key="day.key"
            class="snap-start border-b border-r border-default last:border-r-0 px-2 py-2 text-center"
            :class="[
              day.isSelected ? 'bg-[color-mix(in_oklch,var(--ui-primary)_5%,var(--ui-bg-elevated))]' : 'bg-elevated',
              continuous && 'sticky top-0 z-20',
            ]"
          >
            <p
              class="text-xs font-semibold uppercase tracking-wide"
              :class="day.isSelected ? 'text-primary' : 'text-dimmed'"
            >
              {{ day.dayLabel }} <span class="tabular-nums" :class="day.isSelected ? 'text-primary' : 'text-highlighted'">{{ day.dateLabel }}</span>
            </p>
            <!-- Totaux du jour, sous les yeux pendant qu'on le remplit : kcal colorées selon l'objectif (bleu, vert, orange). -->
            <p class="mt-1 text-sm font-bold tabular-nums" :class="dayTotals[day.key]!.kcal ? dayTotals[day.key]!.statusClass : 'text-dimmed'">
              {{ dayTotals[day.key]!.kcal }} <span class="text-xs font-normal text-muted">kcal</span>
            </p>
            <p class="text-xs tabular-nums text-dimmed">
              <template v-for="(macro, i) in dayTotals[day.key]!.macroItems" :key="macro.letter">
                {{ i ? ' ' : '' }}{{ macro.letter }}<span class="font-semibold" :class="dayTotals[day.key]!.kcal ? macro.statusClass : ''">{{ macro.value }}</span>
              </template>
            </p>
          </div>
  
          <template v-for="mealType in visibleMealTypes" :key="mealType.key">
            <!-- Icône seule ; le libellé reste lisible au survol et par les lecteurs d'écran. -->
            <div
              class="sticky left-0 z-10 border-b border-r border-default px-1 py-2 flex items-center justify-center bg-elevated"
              :title="[mealType.label, mealType.avgLabel].filter(Boolean).join(' · ')"
            >
              <UIcon :name="mealType.icon" class="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span class="sr-only">{{ mealType.label }}<template v-if="mealType.avgLabel"> ({{ mealType.avgLabel }})</template></span>
            </div>
            <MenuWeekCell
              v-for="day in week"
              :key="`${mealType.key}-${day.key}`"
              :entries="entriesFor(day.key, mealType.key)"
              :copied-entry-id="copiedEntryId"
              :is-highlighted="day.isSelected"
              :hide-nutrition="mealType.key === UNCOUNTED_MEAL_KEY"
              @add="emit('add', day.key, mealType.key)"
              @select-entry="emit('select-entry', $event)"
              @edit-entry="emit('edit-entry', $event)"
              @copy-entry="emit('copy-entry', $event)"
              @delete-entry="emit('delete-entry', $event)"
              @move-entry="emit('move-entry', $event, day.key, mealType.key)"
              @drag-start="isDragging = true"
              @drag-end="onDragEnd"
            />
          </template>
  
          <!-- Lignes vides rangées : une seule bande pour les déplier ; son texte reste visible pendant le défilement. -->
          <template v-if="collapsedMealTypes.length">
            <!-- Icône dans la colonne des types de repas, comme les autres lignes ; toute la bande reste cliquable. -->
            <button
              type="button"
              data-copy-control
              class="sticky left-0 z-10 flex cursor-pointer items-center justify-center border-r border-default bg-elevated px-1 py-2 text-muted transition-colors hover:text-highlighted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              :aria-expanded="otherRowsOpen"
              :aria-label="otherRowsOpen ? 'Masquer les lignes vides' : `Afficher les autres repas : ${otherRowsLabel}`"
              @click="otherRowsOpen = !otherRowsOpen"
            >
              <UIcon
                name="i-lucide-chevron-down"
                class="size-5 shrink-0 transition-transform duration-200"
                :class="otherRowsOpen && 'rotate-180'"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              data-copy-control
              class="flex cursor-pointer items-center bg-elevated/50 py-2 text-xs text-muted transition-colors hover:bg-elevated hover:text-highlighted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              style="grid-column: 2 / -1"
              tabindex="-1"
              aria-hidden="true"
              @click="otherRowsOpen = !otherRowsOpen"
            >
              <span class="sticky left-14 flex items-center gap-1.5 px-3">
                {{ otherRowsOpen ? 'Masquer les lignes vides' : 'Autres repas' }}
                <span v-if="!otherRowsOpen" class="text-dimmed">· {{ otherRowsLabel }}</span>
              </span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
