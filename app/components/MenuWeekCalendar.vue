<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { MealType } from '~/types/meal'
import type { MenuDayHeader, MenuDayTotals, MenuEntry, MenuMealTypeRow, MenuMemberRow, MenuPerson, MenuWeekEntries } from '~/types/menu'
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
  /** Autres membres du foyer : une ligne chacun sous celles du compte connecté (hors totaux des en-têtes). */
  members?: MenuMemberRow[]
  /** Compte connecté : nomme son propre bloc, dès qu'il y a d'autres membres. */
  self?: MenuPerson
}>(), {
  entries: () => ({}),
  continuous: false,
  members: () => [],
})

const emit = defineEmits<{
  add: [dayKey: string, mealTypeKey: MealType]
  /** "+" d'une ligne de membre, une fois la ligne du calendrier choisie. */
  'add-for-member': [memberId: string, dayKey: string, mealTypeKey: MealType]
  'select-entry': [entryId: string]
  'edit-entry': [entryId: string]
  'copy-entry': [entryId: string]
  'delete-entry': [entryId: string]
  /** Carte déposée dans la case (jour, ligne) : à enregistrer côté données. */
  'move-entry': [entryId: string, dayKey: string, mealTypeKey: MealType]
  /** Mode continu : le défilement s'est arrêté sur une autre semaine (son lundi). */
  'visible-week': [weekStart: Date]
  /** Une carte commence à être déplacée : le geste en cours n'est pas un balayage de semaine. */
  'drag-start': []
}>()

const scrollContainer = useTemplateRef<HTMLElement>('scrollContainer')
const headerStrip = useTemplateRef<HTMLElement>('headerStrip')

/** Glisser-déposer en cours : l'aimantation et le changement de semaine attendent la fin du geste. */
const isDragging = ref(false)

/** Liste vide partagée : une identité stable évite de réinitialiser inutilement les cases vides à chaque rendu. */
const NO_ENTRIES: MenuEntry[] = []

const entriesFor = (dayKey: string, mealTypeKey: string): MenuEntry[] =>
  props.entries[dayKey]?.[mealTypeKey] ?? NO_ENTRIES

/** Lignes des blocs de chaque personne : « Non compté » a son propre bloc, sous ceux du foyer. */
const blockMealTypes = computed(() => props.mealTypes.filter(row => row.key !== UNCOUNTED_MEAL_KEY))
const uncountedMealType = computed(() => props.mealTypes.find(row => row.key === UNCOUNTED_MEAL_KEY))

/**
 * Bloc « Non compté » : une ligne par personne, le compte connecté d'abord. `memberId` absent : ses propres repas
 * (ajout par `add`, cartes glissables vers ses autres lignes) ; sinon ceux d'un membre, dans son propre groupe.
 */
const uncountedRows = computed(() => [
  { key: 'self', person: props.self, memberId: undefined as string | undefined, entries: props.entries },
  ...props.members.map(member => ({ key: member.id, person: member as MenuPerson | undefined, memberId: member.id as string | undefined, entries: member.entries })),
])

/** Lignes rangées sous « Autres repas » tant qu'elles sont vides sur tous les jours de leur semaine (comme sur l'accueil). */
const COLLAPSIBLE_MEAL_TYPES: MealType[] = ['SNACK', 'EXCESS']

const isRowEmpty = (week: MenuDayHeader[], mealType: MealType) => week.every(day => !props.entries[day.key]?.[mealType]?.length)

/** Dépliées ou non, d'une semaine à l'autre pendant la session. */
const otherRowsOpen = useState('menus-other-rows-open', () => false)

/**
 * Lignes de chaque semaine (index de `weeks`) : repliées si vides sur ses 7 jours, sinon affichées. En mode continu,
 * chaque semaine a sa grille : un repas « En plus » de la semaine voisine n'ouvre pas la ligne dans celle affichée.
 */
const rowsByWeek = computed(() => weeks.value.map((week) => {
  const collapsed = blockMealTypes.value.filter(row => COLLAPSIBLE_MEAL_TYPES.includes(row.key) && isRowEmpty(week, row.key))
  return {
    collapsed,
    visible: otherRowsOpen.value ? blockMealTypes.value : blockMealTypes.value.filter(row => !collapsed.includes(row)),
    label: collapsed.map(row => row.label).join(', '),
  }
}))

const memberEntriesFor = (member: MenuMemberRow, dayKey: string, mealTypeKey: string): MenuEntry[] =>
  member.entries[dayKey]?.[mealTypeKey] ?? NO_ENTRIES

/**
 * Lignes du bloc d'un membre pour une semaine : les mêmes que celles du compte connecté ; tant que « Autres repas » est
 * replié, les lignes repliables n'y paraissent que si ce membre y a un repas cette semaine-là.
 */
const memberMealTypes = (member: MenuMemberRow, week: MenuDayHeader[]) => otherRowsOpen.value
  ? blockMealTypes.value
  : blockMealTypes.value.filter(row => !COLLAPSIBLE_MEAL_TYPES.includes(row.key)
    || week.some(day => member.entries[day.key]?.[row.key]?.length))

/** Blocs nommés (bande et avatar dans la colonne figée) seulement quand le calendrier en montre plusieurs. */
const ownBlockPerson = computed(() => (props.members.length ? props.self : undefined))

/**
 * Repas partagés : une même recette au même repas du même jour chez plusieurs personnes. Pour chaque carte concernée,
 * les autres convives, dont les avatars s'affichent sur la carte.
 */
const companionsByEntry = computed(() => {
  const blocks: { person: MenuPerson, entries: MenuWeekEntries }[] = props.members.map(member => ({ person: member, entries: member.entries }))
  if (!blocks.length) return {}
  if (props.self) blocks.unshift({ person: props.self, entries: props.entries })

  const tables = new Map<string, { person: MenuPerson, entryId: string }[]>()
  for (const { person, entries } of blocks) {
    for (const [dayKey, byMealType] of Object.entries(entries)) {
      for (const [mealTypeKey, list] of Object.entries(byMealType)) {
        for (const entry of list) {
          if (!entry.recipeId) continue
          const key = `${dayKey}|${mealTypeKey}|${entry.recipeId}`
          const table = tables.get(key) ?? []
          table.push({ person, entryId: entry.id })
          tables.set(key, table)
        }
      }
    }
  }

  const companions: Record<string, MenuPerson[]> = {}
  for (const table of tables.values()) {
    for (const { person, entryId } of table) {
      const others = table.map(seat => seat.person).filter((other, i, all) => other.id !== person.id && all.findIndex(p => p.id === other.id) === i)
      if (others.length) companions[entryId] = others
    }
  }
  return companions
})

/** Totaux de chaque jour pour son en-tête : kcal colorées selon l'objectif, et macros. */
const statusClassOf = (value: number, target: number) =>
  TARGET_STATUS_TEXT_CLASS[targetStatus(value, target, DAILY_TARGET_TOLERANCE)]

/**
 * Comme le résumé : la couleur des chiffres est celle du statut (bleu sous l'objectif, vert à ± 5 %, orange au-delà),
 * les lettres G / P / L restent neutres ; les couleurs propres aux macros sont réservées aux barres.
 */
const dayTotals = computed<Record<string, MenuDayTotals>>(() => Object.fromEntries(props.days.map((day) => {
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

/**
 * Mode continu : colonnes de largeur fixe (la grille doit être aussi large qu'elles pour que la colonne figée colle).
 * Colonne figée réduite à l'avatar (2,75 rem) ; les jours se partagent exactement la place restante, à au moins
 * 9,5 rem chacun, et deux au moins : deux jours entiers sur un téléphone, davantage sur une tablette (voir `measureDayWidth`).
 */
const FROZEN_COLUMN_PX = 44
const MIN_DAY_WIDTH_PX = 152
/** Toujours au moins deux jours côte à côte, quitte à les rétrécir sous `MIN_DAY_WIDTH_PX` sur un petit téléphone. */
const MIN_VISIBLE_DAYS = 2
const dayWidth = ref(MIN_DAY_WIDTH_PX)
const CONTINUOUS_GRID_STYLE = computed(() => ({
  gridTemplateColumns: `${FROZEN_COLUMN_PX}px repeat(${DAYS_PER_WEEK}, ${dayWidth.value}px)`,
}))

const measureDayWidth = () => {
  const container = scrollContainer.value
  if (!props.continuous || !container) return
  const available = container.clientWidth - FROZEN_COLUMN_PX
  const visibleDays = Math.max(MIN_VISIBLE_DAYS, Math.floor(available / MIN_DAY_WIDTH_PX))
  const width = Math.floor((available / visibleDays) * 100) / 100
  if (width > 0 && Math.abs(width - dayWidth.value) > 0.01) dayWidth.value = width
}

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

// --- Bandes des personnes ---

/**
 * PC : la grille ne défile pas en largeur (la page passe en mode continu quand elle manque de place), donc la ligne des
 * jours et les bandes (`data-band`) collent à la page en CSS (`sticky`), les bandes juste sous la ligne des jours, dont
 * la hauteur est mesurée ici (moins 1 px : la bande passe sous la bordure basse de la ligne des jours, sans fente
 * entre les deux). Chaque bande colle jusqu'au bas de la grille ; la suivante glisse par-dessus.
 */
const headHeight = ref(0)
const headResizeObserver = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver(([entry]) => {
      // Hauteur exacte (fractionnaire) : un arrondi laisserait une fente entre la ligne des jours et les bandes.
      headHeight.value = entry?.borderBoxSize[0]?.blockSize ?? entry?.target.getBoundingClientRect().height ?? 0
    })
const observeHead = () => {
  headResizeObserver?.disconnect()
  const head = props.continuous ? null : scrollContainer.value?.querySelector<HTMLElement>('[data-head]')
  if (head) headResizeObserver?.observe(head)
}
onBeforeUnmount(() => headResizeObserver?.disconnect())

/**
 * Mode continu : la grille défile en largeur dans son propre conteneur, où ses bandes ne peuvent pas coller à la page.
 * Une couche posée sur la grille donne à chaque bloc de la semaine affichée un couloir à sa place exacte (mesurée à
 * chaque changement de mise en page, pas au défilement) ; la copie de sa bande y colle en CSS (`sticky`) sous la ligne
 * des jours, et le bas du couloir la pousse quand le bloc se termine : le navigateur la déplace sans retard.
 */
const root = useTemplateRef<HTMLElement>('root')
const stripHeight = ref(0)
const lanes = ref<{ key: string, top: number, height: number }[]>([])

const measureLanes = () => {
  const grid = scrollContainer.value?.querySelector<HTMLElement>(`[data-week="${selectedWeekOffset() / DAYS_PER_WEEK}"]`)
  if (!props.continuous || !ownBlockPerson.value || !root.value || !grid) {
    // Assigner un nouveau tableau vide relancerait le rendu, puis `onUpdated`, puis cette mesure : en boucle.
    if (lanes.value.length) lanes.value = []
    return
  }
  stripHeight.value = headerStrip.value?.getBoundingClientRect().height ?? 0
  const rootTop = root.value.getBoundingClientRect().top + root.value.clientTop
  const gridBox = grid.getBoundingClientRect()
  const blockEnds = [...grid.querySelectorAll<HTMLElement>('[data-block-spacer]')].map(spacer => spacer.getBoundingClientRect().top)
  const seen = new Set<string>()
  const next: typeof lanes.value = []
  for (const cell of grid.querySelectorAll<HTMLElement>('[data-band]')) {
    const key = cell.dataset.band!
    if (seen.has(key)) continue
    seen.add(key)
    const top = cell.getBoundingClientRect().top
    const end = blockEnds.find(blockEnd => blockEnd > top) ?? gridBox.bottom
    next.push({ key, top: top - rootTop, height: end - top })
  }
  // Même mise en page : pas de nouveau rendu (il relancerait la mesure).
  const same = next.length === lanes.value.length && next.every((lane, i) => {
    const old = lanes.value[i]!
    return old.key === lane.key && Math.abs(old.top - lane.top) < 0.5 && Math.abs(old.height - lane.height) < 0.5
  })
  if (!same) lanes.value = next
}

const lanesResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
  measureDayWidth()
  measureLanes()
  measureMaxScrollX()
})
const observeLanes = () => {
  lanesResizeObserver?.disconnect()
  if (scrollContainer.value) lanesResizeObserver?.observe(scrollContainer.value)
  if (headerStrip.value) lanesResizeObserver?.observe(headerStrip.value)
}
onBeforeUnmount(() => lanesResizeObserver?.disconnect())

/** Copie de bande d'un couloir : le compte connecté (ses totaux), un membre (ses kcal) ou « Non compté ». */
const laneBandOf = (key: string) => {
  if (key === 'self') return props.self ? { kind: 'self' as const, person: props.self } : null
  if (key === 'uncounted') return uncountedMealType.value ? { kind: 'uncounted' as const, mealType: uncountedMealType.value } : null
  const member = props.members.find(m => m.id === key)
  return member ? { kind: 'member' as const, person: member, kcalByDay: member.kcalByDay } : null
}

const memberKcal = (memberId: string, dayKey: string) => props.members.find(m => m.id === memberId)?.kcalByDay[dayKey]

/**
 * Mode continu : la ligne des jours et les copies de bandes suivent le défilement horizontal de la grille. Avec les
 * animations liées au défilement (`.menu-follow-x`, sur la timeline `--menu-x` de la grille), le navigateur les décale
 * en même temps qu'elle ; sinon (Firefox), on recopie `scrollLeft` à chaque événement, avec une image de retard.
 */
const followsScrollNatively = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()')

/** Défilement horizontal possible de la grille : l'animation va de 0 à cette distance. */
const maxScrollX = ref(0)
const measureMaxScrollX = () => {
  const container = scrollContainer.value
  const max = container ? container.scrollWidth - container.clientWidth : 0
  if (max !== maxScrollX.value) maxScrollX.value = max
}

/** Copies de bandes, recalées par `scrollLeft` quand le navigateur ne sait pas lier une animation au défilement. */
const laneStrips = new Set<HTMLElement>()
const collectLaneStrip = (element: Element | ComponentPublicInstance | null) => {
  if (!(element instanceof HTMLElement) || followsScrollNatively) return
  laneStrips.add(element)
  if (scrollContainer.value) element.scrollLeft = scrollContainer.value.scrollLeft
}
const syncLaneStrips = (scrollLeft: number) => {
  for (const strip of laneStrips) {
    if (strip.isConnected) strip.scrollLeft = scrollLeft
    else laneStrips.delete(strip)
  }
}

onMounted(() => {
  measureDayWidth()
  observeHead()
  observeLanes()
  measureLanes()
  measureMaxScrollX()
})
onUpdated(() => {
  measureDayWidth()
  observeHead()
  observeLanes()
  measureLanes()
  measureMaxScrollX()
})

/** Largeur des jours recalculée (montage, rotation, redimensionnement) : la grille se recale sur la semaine affichée. */
watch(dayWidth, () => scrollToSelectedWeek(), { flush: 'post' })

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

/** La bande des jours (mode continu) suit le défilement horizontal de la grille. */
const onBodyScroll = () => {
  const strip = headerStrip.value
  const container = scrollContainer.value
  if (!followsScrollNatively && container) {
    if (strip) strip.scrollLeft = container.scrollLeft
    syncLaneStrips(container.scrollLeft)
  }
  onScroll()
}

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
  <div
    ref="root"
    class="relative flex flex-col rounded-xl border border-default bg-default overflow-clip"
    :style="continuous && followsScrollNatively ? { timelineScope: '--menu-x', '--menu-max-x': `${maxScrollX}px` } : undefined"
  >
    <!--
      Pas de commentaire avant la racine : elle doit rester unique (glissement de <Transition> sur PC).
      Mode continu (mobile, tablette) : la page défile ; la ligne des jours est une bande à part, collée en haut de la zone
      qui défile (sous l'en-tête du panneau), qui suit le défilement horizontal de la grille ; juste dessous, la copie de
      chaque bande, collée par son couloir (voir `measureLanes`). PC : elles collent en haut, dans la grille.
      `overflow-clip` (et non `hidden`) : arrondit les coins sans empêcher la ligne des jours et les bandes de coller.
    -->
    <div v-if="continuous" class="sticky top-0 z-40">
      <!-- Coin, hors du contenu qui suit la grille (et de son défilement de secours) : il reste à gauche, comme la colonne figée. -->
      <div class="absolute inset-y-0 left-0 z-10 w-11 border-b border-r border-default bg-elevated" />
      <div ref="headerStrip" class="overflow-hidden border-b border-default bg-elevated">
        <div class="flex w-max" :class="followsScrollNatively && 'menu-follow-x'">
          <div
            v-for="(week, w) in weeks"
            :key="`head-${week[0]!.key}`"
            class="grid"
            :class="w > 0 && 'border-l border-default'"
            :style="CONTINUOUS_GRID_STYLE"
          >
            <div class="sticky left-0 z-10 border-r border-default bg-elevated" />
            <MenuWeekDayHead
              v-for="day in week"
              :key="`head-${day.key}`"
              :day="day"
              :totals="ownBlockPerson ? undefined : dayTotals[day.key]"
              class="border-r border-default last:border-r-0"
            />
          </div>
        </div>
      </div>
    </div>

    <!--
      Mode continu : couloirs des blocs de la semaine affichée, posés sur la grille (voir `measureLanes`). Dans chacun, la
      copie de sa bande colle sous la ligne des jours tant que le bloc est à l'écran ; au repos, elle recouvre exactement
      la vraie bande. Seules les colonnes de la semaine affichée sont peintes : pendant un balayage, les semaines voisines
      gardent leurs propres bandes.
    -->
    <div v-if="lanes.length" class="pointer-events-none absolute inset-x-0 top-0 z-30" aria-hidden="true">
      <div
        v-for="lane in lanes"
        :key="lane.key"
        class="absolute inset-x-0"
        :style="{ top: `${lane.top}px`, height: `${lane.height}px` }"
      >
        <div
          v-if="laneBandOf(lane.key)"
          class="sticky"
          :style="{ top: `${stripHeight}px` }"
        >
          <!-- Case figée, posée hors du contenu qui suit la grille ; sa copie invisible ci-dessous garde la hauteur. -->
          <div class="pointer-events-auto absolute inset-y-0 left-0 z-10 flex w-11 items-center justify-center border-b border-r border-default bg-elevated">
            <UIcon v-if="laneBandOf(lane.key)!.kind === 'uncounted'" :name="uncountedMealType!.icon" class="size-9 shrink-0 text-muted" />
            <UAvatar v-else :src="laneBandOf(lane.key)!.person?.photoUrl" :alt="laneBandOf(lane.key)!.person?.name" size="lg" />
          </div>
          <div :ref="collectLaneStrip" class="overflow-hidden">
            <div class="flex w-max" :class="followsScrollNatively && 'menu-follow-x'">
              <div
                v-for="(week, w) in weeks"
                :key="`lane-${week[0]!.key}`"
                class="grid"
                :class="w > 0 && 'border-l border-transparent'"
                :style="CONTINUOUS_GRID_STYLE"
              >
                <template v-if="w === selectedWeekOffset() / DAYS_PER_WEEK">
                  <div class="invisible flex flex-col items-center justify-center gap-0.5 border-b border-r border-default px-0.5 py-1.5">
                    <template v-if="laneBandOf(lane.key)!.kind === 'uncounted'">
                      <UIcon :name="uncountedMealType!.icon" class="size-9 shrink-0 text-muted" />
                    </template>
                    <template v-else>
                      <UAvatar :src="laneBandOf(lane.key)!.person?.photoUrl" :alt="laneBandOf(lane.key)!.person?.name" size="lg" />
                    </template>
                  </div>
                  <template v-for="day in week" :key="`lane-${lane.key}-${day.key}`">
                    <MenuWeekDayTotals
                      v-if="lane.key === 'self'"
                      :totals="dayTotals[day.key]!"
                      class="pointer-events-auto flex flex-col justify-center border-b border-r border-default px-2 py-1.5 last:border-r-0"
                      :class="day.isSelected ? 'bg-[color-mix(in_oklch,var(--ui-primary)_5%,var(--ui-bg-elevated))]' : 'bg-elevated'"
                    />
                    <div
                      v-else
                      class="pointer-events-auto flex items-center justify-center border-b border-r border-default px-2 py-1.5 text-xs tabular-nums text-dimmed last:border-r-0"
                      :class="day.isSelected ? 'bg-[color-mix(in_oklch,var(--ui-primary)_5%,var(--ui-bg-elevated))]' : 'bg-elevated'"
                    >
                      <template v-if="lane.key !== 'uncounted'">
                        <template v-if="memberKcal(lane.key, day.key)">
                          <span class="font-semibold text-toned">{{ memberKcal(lane.key, day.key) }}</span>&nbsp;kcal
                        </template>
                        <template v-else>–</template>
                      </template>
                    </div>
                  </template>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!--
      Mode continu : défilement horizontal, qui s'arrête au début d'un jour (juste après la colonne figée).
      PC : pas de défilement propre (la grille tient en largeur), pour que la ligne des jours et les bandes des personnes
      (`data-sticky-bands`) collent à la page.
    -->
    <div
      ref="scrollContainer"
      class="group/menu"
      :class="continuous && !isDragging ? 'overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-pl-11' : continuous ? 'overflow-x-auto overscroll-x-contain' : ''"
      :data-sticky-bands="continuous ? undefined : ''"
      :style="{ '--menu-head-h': `${Math.max(headHeight - 1, 0)}px`, scrollTimeline: continuous && followsScrollNatively ? '--menu-x x' : undefined }"
      @scroll.passive="onBodyScroll"
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
          <!-- Mode continu : coin et en-têtes de hauteur nulle, gardés comme repères de colonnes (aimantation, calculs). -->
          <div
            data-sticky-corner
            class="sticky left-0"
            :class="continuous ? 'h-0' : 'top-0 z-50 border-b border-r border-default bg-elevated'"
            :data-head="continuous ? undefined : ''"
          />
          <template v-if="continuous">
            <div
              v-for="day in week"
              :key="`mark-${day.key}`"
              :data-day-key="day.key"
              class="h-0 snap-start"
            />
          </template>
          <template v-else>
            <MenuWeekDayHead
              v-for="day in week"
              :key="`head-${day.key}`"
              :data-day-key="day.key"
              :day="day"
              :totals="ownBlockPerson ? undefined : dayTotals[day.key]"
              data-head
              class="sticky top-0 z-40 border-b border-r border-default last:border-r-0"
            />
          </template>

          <!--
            Un sous-grille par bloc (mêmes colonnes) : sur PC, sa bande colle dans son bloc seulement, et la fin du bloc la
            pousse vers le haut ; puis la marge blanche passe, et la bande du bloc suivant prend la place.
          -->
          <div class="col-span-full grid grid-cols-subgrid">
            <!--
              Avec d'autres membres, le bloc du compte connecté est nommé comme les leurs : même bande, qui porte ses totaux
              du jour colorés selon l'objectif (l'en-tête de colonne ne montre alors que le jour).
            -->
            <template v-if="ownBlockPerson">
              <div
                data-band="self"
                class="sticky left-0 z-10 group-data-[sticky-bands]/menu:z-30 group-data-[sticky-bands]/menu:top-(--menu-head-h) flex flex-col items-center justify-center gap-0.5 border-b border-r border-default bg-elevated px-0.5 py-1.5"
                :title="ownBlockPerson.name"
              >
                <UAvatar :src="ownBlockPerson.photoUrl" :alt="ownBlockPerson.name" size="lg" />
              </div>
              <MenuWeekDayTotals
                v-for="day in week"
                :key="`self-total-${day.key}`"
                :totals="dayTotals[day.key]!"
                data-band="self"
                class="group-data-[sticky-bands]/menu:z-20 group-data-[sticky-bands]/menu:sticky group-data-[sticky-bands]/menu:top-(--menu-head-h) flex flex-col justify-center border-b border-r border-default px-2 py-1.5 last:border-r-0"
                :class="day.isSelected ? 'bg-[color-mix(in_oklch,var(--ui-primary)_5%,var(--ui-bg-elevated))]' : 'bg-elevated'"
              />
            </template>

            <template v-for="mealType in rowsByWeek[w]!.visible" :key="mealType.key">
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
                :companions="companionsByEntry"
                :copied-entry-id="copiedEntryId"
                :is-highlighted="day.isSelected"
                :hide-nutrition="mealType.key === UNCOUNTED_MEAL_KEY"
                @add="emit('add', day.key, mealType.key)"
                @select-entry="emit('select-entry', $event)"
                @edit-entry="emit('edit-entry', $event)"
                @copy-entry="emit('copy-entry', $event)"
                @delete-entry="emit('delete-entry', $event)"
                @move-entry="emit('move-entry', $event, day.key, mealType.key)"
                @drag-start="isDragging = true; emit('drag-start')"
                @drag-end="onDragEnd"
              />
            </template>
    
            <!-- Lignes vides rangées : une seule bande pour les déplier ; son texte reste visible pendant le défilement. -->
            <template v-if="rowsByWeek[w]!.collapsed.length">
              <!-- Icône dans la colonne des types de repas, comme les autres lignes ; toute la bande reste cliquable. -->
              <button
                type="button"
                data-copy-control
                class="sticky left-0 z-10 flex cursor-pointer items-center justify-center border-b border-r border-default bg-elevated px-1 py-2 text-muted transition-colors hover:text-highlighted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                :aria-expanded="otherRowsOpen"
                :aria-label="otherRowsOpen ? 'Masquer les lignes vides' : `Afficher les autres repas : ${rowsByWeek[w]!.label}`"
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
                class="flex cursor-pointer items-center border-b border-default bg-elevated/50 py-2 text-xs text-muted transition-colors hover:bg-elevated hover:text-highlighted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                style="grid-column: 2 / -1"
                tabindex="-1"
                aria-hidden="true"
                @click="otherRowsOpen = !otherRowsOpen"
              >
                <span class="sticky left-11 flex items-center gap-1.5 px-3">
                  {{ otherRowsOpen ? 'Masquer les lignes vides' : 'Autres repas' }}
                  <span v-if="!otherRowsOpen" class="text-dimmed">· {{ rowsByWeek[w]!.label }}</span>
                </span>
              </button>
            </template>
          </div>

          <!--
            Autres membres du foyer : un bloc chacun, ouvert par une bande à son nom et ses kcal du jour, puis les mêmes
            lignes que ci-dessus. Leurs cartes ne se déposent que dans leur propre bloc (`group`), et leurs repas ne
            comptent pas dans les totaux des en-têtes de colonne.
          -->
          <template v-for="member in members" :key="member.id">
            <!-- Respiration entre deux personnes : les blocs se lisent séparément. -->
            <div data-block-spacer class="col-span-full h-3 border-b border-default bg-default" aria-hidden="true" />
            <div class="col-span-full grid grid-cols-subgrid">
              <!-- Dans la colonne figée : le membre reste nommé pendant le défilement ; nom complet au survol. -->
              <div
                :data-band="member.id"
                class="sticky left-0 z-10 group-data-[sticky-bands]/menu:z-30 group-data-[sticky-bands]/menu:top-(--menu-head-h) flex flex-col items-center justify-center gap-0.5 border-b border-r border-default bg-elevated px-0.5 py-1.5"
                :title="member.name"
              >
                <UAvatar :src="member.photoUrl" :alt="member.name" size="lg" />
              </div>
              <!-- Kcal du jour du membre, en gris : les objectifs affichés sont ceux du compte connecté, pas les siens. -->
              <div
                v-for="day in week"
                :key="`${member.id}-total-${day.key}`"
                :data-band="member.id"
                class="group-data-[sticky-bands]/menu:z-20 group-data-[sticky-bands]/menu:sticky group-data-[sticky-bands]/menu:top-(--menu-head-h) flex items-center justify-center border-b border-r border-default px-2 py-1.5 text-xs tabular-nums text-dimmed last:border-r-0"
                :class="day.isSelected ? 'bg-[color-mix(in_oklch,var(--ui-primary)_5%,var(--ui-bg-elevated))]' : 'bg-elevated'"
              >
                <template v-if="member.kcalByDay[day.key]">
                  <span class="font-semibold text-toned">{{ member.kcalByDay[day.key] }}</span>&nbsp;kcal
                </template>
                <template v-else>–</template>
              </div>
              <template v-for="mealType in memberMealTypes(member, week)" :key="`${member.id}-${mealType.key}`">
                <div
                  class="sticky left-0 z-10 border-b border-r border-default px-1 py-2 flex items-center justify-center bg-elevated"
                  :title="[mealType.label, member.name].join(' · ')"
                >
                  <UIcon :name="mealType.icon" class="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span class="sr-only">{{ mealType.label }} de {{ member.name }}</span>
                </div>
                <MenuWeekCell
                  v-for="day in week"
                  :key="`${member.id}-${mealType.key}-${day.key}`"
                  :entries="memberEntriesFor(member, day.key, mealType.key)"
                  :companions="companionsByEntry"
                  :copied-entry-id="copiedEntryId"
                  :is-highlighted="day.isSelected"
                  :hide-nutrition="mealType.key === UNCOUNTED_MEAL_KEY"
                  :group="`menu-meals-${member.id}`"
                  @add="emit('add-for-member', member.id, day.key, mealType.key)"
                  @select-entry="emit('select-entry', $event)"
                  @edit-entry="emit('edit-entry', $event)"
                  @copy-entry="emit('copy-entry', $event)"
                  @delete-entry="emit('delete-entry', $event)"
                  @move-entry="emit('move-entry', $event, day.key, mealType.key)"
                  @drag-start="isDragging = true; emit('drag-start')"
                  @drag-end="onDragEnd"
                />
              </template>
            </div>
          </template>

          <!--
            « Non compté » : hors des blocs de chacun, présenté comme un bloc de plus (bande à son nom), avec une ligne par
            personne. Hors totaux : sa bande n'affiche pas de kcal.
          -->
          <template v-if="uncountedMealType">
            <div data-block-spacer class="col-span-full h-3 border-b border-default bg-default" aria-hidden="true" />
            <div class="col-span-full grid grid-cols-subgrid">
              <div
                data-band="uncounted"
                class="sticky left-0 z-10 group-data-[sticky-bands]/menu:z-30 group-data-[sticky-bands]/menu:top-(--menu-head-h) flex flex-col items-center justify-center gap-0.5 border-b border-r border-default bg-elevated px-0.5 py-1.5"
                :title="[uncountedMealType.label, uncountedMealType.avgLabel].filter(Boolean).join(' · ')"
              >
                <UIcon :name="uncountedMealType.icon" class="size-9 shrink-0 text-muted" aria-hidden="true" />
                <span class="sr-only">{{ uncountedMealType.label }}</span>
              </div>
              <div
                v-for="day in week"
                :key="`uncounted-band-${day.key}`"
                data-band="uncounted"
                class="group-data-[sticky-bands]/menu:z-20 group-data-[sticky-bands]/menu:sticky group-data-[sticky-bands]/menu:top-(--menu-head-h) border-b border-r border-default last:border-r-0"
                :class="day.isSelected ? 'bg-[color-mix(in_oklch,var(--ui-primary)_5%,var(--ui-bg-elevated))]' : 'bg-elevated'"
              />
              <template v-for="row in uncountedRows" :key="`uncounted-${row.key}`">
                <!-- Avatar de la personne, ou l'icône de la ligne quand le compte connecté n'a pas de profil de foyer. -->
                <div
                  class="sticky left-0 z-10 border-b border-r border-default px-1 py-2 flex items-center justify-center bg-elevated"
                  :title="[uncountedMealType.label, row.person?.name].filter(Boolean).join(' · ')"
                >
                  <UAvatar v-if="row.person" :src="row.person.photoUrl" :alt="row.person.name" size="2xs" aria-hidden="true" />
                  <UIcon v-else :name="uncountedMealType.icon" class="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span class="sr-only">{{ uncountedMealType.label }}<template v-if="row.person"> de {{ row.person.name }}</template></span>
                </div>
                <MenuWeekCell
                  v-for="day in week"
                  :key="`uncounted-${row.key}-${day.key}`"
                  :entries="row.entries[day.key]?.[UNCOUNTED_MEAL_KEY] ?? NO_ENTRIES"
                  :companions="companionsByEntry"
                  :copied-entry-id="copiedEntryId"
                  :is-highlighted="day.isSelected"
                  hide-nutrition
                  :group="row.memberId ? `menu-meals-${row.memberId}` : 'menu-meals'"
                  @add="row.memberId ? emit('add-for-member', row.memberId, day.key, UNCOUNTED_MEAL_KEY) : emit('add', day.key, UNCOUNTED_MEAL_KEY)"
                  @select-entry="emit('select-entry', $event)"
                  @edit-entry="emit('edit-entry', $event)"
                  @copy-entry="emit('copy-entry', $event)"
                  @delete-entry="emit('delete-entry', $event)"
                  @move-entry="emit('move-entry', $event, day.key, UNCOUNTED_MEAL_KEY)"
                  @drag-start="isDragging = true; emit('drag-start')"
                  @drag-end="onDragEnd"
                />
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * Mode continu : contenu qui suit le défilement horizontal de la grille (timeline `--menu-x`, déclarée sur la grille et
 * partagée par `timeline-scope` sur la racine) ; décalé de 0 à `--menu-max-x` en même temps qu'elle, sans retard.
 */
@supports (animation-timeline: scroll()) {
  .menu-follow-x {
    animation: menu-follow-x linear both;
    animation-timeline: --menu-x;
  }
}

@keyframes menu-follow-x {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(calc(-1 * var(--menu-max-x, 0px)));
  }
}
</style>
