<script setup lang="ts">
import { addDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { VueDraggable } from 'vue-draggable-plus'
import type { ExportFormat, PlannedMealType } from '~/utils/profile'

useSeoMeta({
  title: 'Dashboard - Réglages - Mealfit',
  description: 'Dashboard - Réglages - Mealfit',
})

const { settings, reset } = useAppSettings()
const profile = useProfile()
const route = useRoute()
const toast = useToast()

const SECTIONS = [
  { id: 'repas', label: 'Repas & objectifs', icon: 'i-lucide-utensils' },
  { id: 'menus', label: 'Menus', icon: 'i-lucide-calendar-days' },
  { id: 'courses', label: 'Liste de courses', icon: 'i-lucide-shopping-cart' },
  { id: 'suivi', label: 'Suivi', icon: 'i-lucide-ruler' },
] as const

type SectionId = typeof SECTIONS[number]['id']

// --- Enregistrement automatique : chaque section affiche « Enregistré » après un changement ---

const saved = reactive<Record<SectionId, number>>({ repas: 0, menus: 0, courses: 0, suivi: 0 })
let resetting = false

/** `valid` : pas de « Enregistré » tant que la section affiche une erreur. */
function track(section: SectionId, source: () => unknown, valid: () => boolean = () => true) {
  watch(source, () => {
    if (!resetting && valid()) saved[section]++
  }, { deep: true })
}

track('repas', () => [settings.value.mealShares, settings.value.snackHasTarget, settings.value.mealTolerance, settings.value.dayTolerance], () => mealSharesTotal(settings.value) === 100)
track('menus', () => settings.value.householdPortions)
track('courses', () => [settings.value.shoppingDay, settings.value.aisleOrder, settings.value.pantry, settings.value.roundUpPieces, settings.value.exportFormat])
track('suivi', () => [settings.value.trackedZones, settings.value.showGoalProjection])

function withoutTracking(change: () => void) {
  resetting = true
  change()
  nextTick(() => (resetting = false))
}

function resetAll() {
  const snapshot = structuredClone(toRaw(settings.value))
  withoutTracking(reset)
  toast.add({
    title: 'Réglages rétablis',
    description: 'Les valeurs par défaut sont de retour, y compris l\'ordre des rayons et le garde-manger.',
    color: 'neutral',
    icon: 'i-lucide-rotate-ccw',
    actions: [{ label: 'Annuler', color: 'neutral', variant: 'outline', onClick: () => withoutTracking(() => (settings.value = snapshot)) }],
  })
}

// --- Navigation entre sections ---

const activeSection = ref<SectionId>('repas')
let observer: IntersectionObserver | undefined
/** Pendant un défilement lancé par le sommaire, la section cliquée reste sélectionnée. */
let navigating: ReturnType<typeof setTimeout> | undefined

function goTo(id: SectionId) {
  activeSection.value = id
  clearTimeout(navigating)
  navigating = setTimeout(() => (navigating = undefined), 900)
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}

/** La dernière section, courte, n'atteint jamais la bande observée : on la sélectionne en bas de page. */
function onScroll(event: Event) {
  if (navigating) return
  const el = event.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) activeSection.value = SECTIONS.at(-1)!.id
}

onMounted(() => {
  const hash = route.hash.slice(1)
  if (SECTIONS.some(s => s.id === hash)) {
    activeSection.value = hash as SectionId
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }))
  }
  document.getElementById('repas')?.closest('.overflow-y-auto')?.addEventListener('scroll', onScroll, { passive: true })
  observer = new IntersectionObserver((entries) => {
    if (navigating) return
    const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
    if (visible) activeSection.value = visible.target.id as SectionId
  }, { rootMargin: '-20% 0px -60% 0px' })
  for (const section of SECTIONS) {
    const el = document.getElementById(section.id)
    if (el) observer.observe(el)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(navigating)
  document.getElementById('repas')?.closest('.overflow-y-auto')?.removeEventListener('scroll', onScroll)
})

// --- Repas & objectifs ---

const SHARE_BAR_CLASSES: Record<PlannedMealType, string> = {
  BREAKFAST: 'bg-primary',
  LUNCH: 'bg-primary/65',
  DINER: 'bg-primary/40',
  SNACK: 'bg-primary/20',
}

const activeMeals = computed(() => activeMealShares(settings.value))
const sharesTotal = computed(() => mealSharesTotal(settings.value))
const sharesOk = computed(() => sharesTotal.value === 100)
const dailyKcal = computed(() => profile.targets?.calories ?? null)

const shareSegments = computed(() => {
  const total = Math.max(sharesTotal.value, 100)
  return activeMeals.value
    .filter(key => settings.value.mealShares[key] > 0)
    .map(key => ({ key, label: MEAL_SHARE_LABELS[key], width: `${(settings.value.mealShares[key] / total) * 100}%`, cls: SHARE_BAR_CLASSES[key] }))
})

const mealKcal = (key: PlannedMealType) =>
  dailyKcal.value ? Math.round((dailyKcal.value * settings.value.mealShares[key]) / 100) : null

watch(() => settings.value.snackHasTarget, (on) => {
  if (on && settings.value.mealShares.SNACK === 0) settings.value.mealShares.SNACK = 10
})

/** Rééquilibre en ajustant le déjeuner, le repas le plus gros. */
function balanceShares() {
  const others = activeMeals.value.filter(k => k !== 'LUNCH').reduce((sum, k) => sum + settings.value.mealShares[k], 0)
  settings.value.mealShares.LUNCH = Math.max(0, 100 - others)
}

const toleranceExample = computed(() => {
  const kcal = mealKcal('LUNCH')
  if (!kcal) return null
  const t = settings.value.mealTolerance / 100
  return { low: Math.round(kcal * (1 - t)), high: Math.round(kcal * (1 + t)) }
})

const dayToleranceExample = computed(() => {
  const kcal = dailyKcal.value
  if (!kcal) return null
  const t = settings.value.dayTolerance / 100
  return { low: Math.round(kcal * (1 - t)), high: Math.round(kcal * (1 + t)) }
})

// --- Liste de courses ---

const dayItems = WEEK_DAYS.map((label, value) => ({ label, value }))

const shoppingPeriod = computed(() => {
  const today = new Date()
  const todayIndex = (today.getDay() + 6) % 7
  const start = addDays(today, (settings.value.shoppingDay - todayIndex + 7) % 7)
  const end = addDays(start, 6)
  const short = (d: Date) => format(d, 'EEE d', { locale: fr }).replace('.', '')
  return `${short(start)} → ${short(end)} ${format(end, 'MMM', { locale: fr }).replace('.', '')}`
})

const aisles = computed({
  get: () => settings.value.aisleOrder.map(id => AISLE_BY_ID[id]!).filter(Boolean),
  set: list => (settings.value.aisleOrder = list.map(a => a.id)),
})

const aisleOrderChanged = computed(() => settings.value.aisleOrder.join() !== DEFAULT_AISLE_ORDER.join())

function moveAisle(index: number, delta: -1 | 1) {
  const order = [...settings.value.aisleOrder]
  const target = index + delta
  if (target < 0 || target >= order.length) return
  ;[order[index], order[target]] = [order[target]!, order[index]!]
  settings.value.aisleOrder = order
  nextTick(() => {
    const id = order[target]
    const same = document.getElementById(`aisle-${id}-${delta < 0 ? 'up' : 'down'}`) as HTMLButtonElement | null
    const other = document.getElementById(`aisle-${id}-${delta < 0 ? 'down' : 'up'}`)
    ;(same && !same.disabled ? same : other)?.focus()
  })
}

function resetAisles() {
  settings.value.aisleOrder = [...DEFAULT_AISLE_ORDER]
}

const EXPORT_FORMATS: { value: ExportFormat, label: string, icon: string }[] = [
  { value: 'todoist', label: 'Todoist', icon: 'i-lucide-list-checks' },
  { value: 'text', label: 'Texte brut', icon: 'i-lucide-file-text' },
]

/** Aperçu sur trois articles d'exemple, dans l'ordre des rayons choisi. */
const exportPreview = computed(() => {
  const round = settings.value.roundUpPieces
  const sample = [
    { aisle: 'vegetables', label: 'Courgette', qty: round ? '3 pièces (520 g)' : '520 g' },
    { aisle: 'dairy', label: 'Skyr nature', qty: '500 g' },
    { aisle: 'cereals_starches', label: 'Riz basmati', qty: '300 g' },
  ].sort((a, b) => settings.value.aisleOrder.indexOf(a.aisle) - settings.value.aisleOrder.indexOf(b.aisle))
  if (settings.value.exportFormat === 'todoist') return sample.map(s => `${s.label} — ${s.qty}`).join('\n')
  return sample.map(s => `${AISLE_BY_ID[s.aisle]!.label.toUpperCase()}\n- ${s.label} : ${s.qty}`).join('\n\n')
})

// --- Suivi ---

/** La dernière zone cochée est verrouillée : il en faut au moins une. */
const zoneItems = computed(() => MEASUREMENT_ZONES.map(zone => ({
  label: zone.label,
  value: zone.key,
  disabled: settings.value.trackedZones.length === 1 && settings.value.trackedZones[0] === zone.key,
})))

</script>

<template>
  <UDashboardPanel id="reglages">
    <template #header>
      <UDashboardNavbar title="Réglages">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            aria-label="Rétablir les réglages par défaut"
            @click="resetAll"
          >
            <span class="hidden sm:inline">Rétablir par défaut</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto grid w-full max-w-5xl items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
        <!-- Sommaire -->
        <nav aria-label="Sections des réglages" class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:sticky lg:top-0">
          <ul class="flex gap-1 lg:flex-col">
            <li v-for="section in SECTIONS" :key="section.id">
              <a
                :href="`#${section.id}`"
                class="flex items-center gap-2 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                :class="activeSection === section.id ? 'bg-elevated font-medium text-highlighted' : 'text-muted hover:bg-elevated/50 hover:text-highlighted'"
                :aria-current="activeSection === section.id ? 'location' : undefined"
                @click.prevent="goTo(section.id)"
              >
                <UIcon :name="section.icon" class="size-4 shrink-0" :class="activeSection === section.id && 'text-primary'" />
                {{ section.label }}
              </a>
            </li>
          </ul>
          <p class="mt-4 hidden text-xs text-dimmed text-pretty lg:block">
            Chaque changement est enregistré tout de suite.
          </p>
        </nav>

        <div class="flex min-w-0 flex-col gap-6">
          <!-- Repas & objectifs -->
          <section id="repas" aria-labelledby="repas-title" class="flex scroll-mt-4 flex-col rounded-xl border border-default bg-default">
            <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="repas-title" class="text-lg font-bold tracking-tight text-highlighted">
                Repas & objectifs
              </h2>
              <SavedHint :stamp="saved.repas" />
            </header>

            <div class="flex flex-col gap-4 border-t border-default px-4 py-4 sm:px-5">
              <div class="flex flex-col gap-0.5">
                <p class="text-sm font-medium text-highlighted">
                  Répartition des kcal du jour
                </p>
                <p class="text-xs text-dimmed">
                  Chaque repas reçoit sa part de l'objectif du jour.
                </p>
              </div>

              <div
                class="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-accented"
                role="img"
                :aria-label="`Répartition : ${activeMeals.map(k => `${MEAL_SHARE_LABELS[k]} ${settings.mealShares[k]} %`).join(', ')}`"
              >
                <div
                  v-for="segment in shareSegments"
                  :key="segment.key"
                  class="h-full rounded-full transition-[width] duration-300 ease-out"
                  :class="segment.cls"
                  :style="{ width: segment.width }"
                />
              </div>

              <ul class="grid gap-px overflow-hidden rounded-lg border border-default bg-border" :class="activeMeals.length > 3 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'">
                <li v-for="key in activeMeals" :key="key" class="flex items-center justify-between gap-3 bg-default px-3 py-2.5 sm:flex-col sm:items-stretch">
                  <label :for="`share-${key}`" class="flex items-center gap-2 text-sm text-highlighted">
                    <span class="size-2 shrink-0 rounded-full" :class="SHARE_BAR_CLASSES[key]" />
                    {{ MEAL_SHARE_LABELS[key] }}
                  </label>
                  <div class="flex items-center gap-2 sm:justify-between">
                    <span v-if="mealKcal(key) !== null" class="text-xs tabular-nums text-dimmed">≈ {{ formatNumber(mealKcal(key)!) }} kcal</span>
                    <UInputNumber
                      :id="`share-${key}`"
                      v-model="settings.mealShares[key]"
                      :min="0"
                      :max="100"
                      :step="5"
                      size="sm"
                      class="w-28"
                      :format-options="{ style: 'unit', unit: 'percent' }"
                      :ui="{ base: 'tabular-nums' }"
                      :increment="{ 'aria-label': `Augmenter ${MEAL_SHARE_LABELS[key]}` }"
                      :decrement="{ 'aria-label': `Diminuer ${MEAL_SHARE_LABELS[key]}` }"
                    />
                  </div>
                </li>
              </ul>

              <div class="flex flex-wrap items-center justify-between gap-2 text-xs" :class="sharesOk ? 'text-muted' : 'text-error'" role="status">
                <p class="flex items-center gap-1.5">
                  <UIcon :name="sharesOk ? 'i-lucide-check' : 'i-lucide-circle-alert'" class="size-3.5 shrink-0" />
                  Total <span class="font-semibold tabular-nums">{{ sharesTotal }} %</span>
                  <template v-if="!sharesOk">
                    : {{ sharesTotal < 100 ? `il manque ${100 - sharesTotal} %` : `${sharesTotal - 100} % de trop` }}.
                  </template>
                </p>
                <UButton
                  v-if="!sharesOk"
                  label="Ajuster le déjeuner"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  @click="balanceShares"
                />
              </div>
              <p v-if="!dailyKcal" class="text-xs text-dimmed">
                Définissez vos besoins du jour dans le <ULink to="/dashboard/profil" class="text-muted underline underline-offset-2 hover:text-highlighted">profil</ULink> pour voir les kcal par repas.
              </p>
            </div>

            <div class="divide-y divide-default border-t border-default">
              <SettingRow label="Objectif pour la collation" hint="Sinon, la collation compte dans le total du jour, sans anneau.">
                <USwitch v-model="settings.snackHasTarget" aria-label="Donner un objectif à la collation" />
              </SettingRow>

              <SettingRow label="Repas atteint à ±" for="tol-meal">
                <template #hint>
                  <template v-if="toleranceExample">
                    Déjeuner atteint entre <span class="tabular-nums">{{ formatNumber(toleranceExample.low) }}</span> et <span class="tabular-nums">{{ formatNumber(toleranceExample.high) }}</span> kcal
                  </template>
                  <template v-else>
                    Marge autour de l'objectif d'un repas
                  </template>
                </template>
                <UInputNumber
                  id="tol-meal"
                  v-model="settings.mealTolerance"
                  :min="1"
                  :max="30"
                  size="sm"
                  class="w-28"
                  :format-options="{ style: 'unit', unit: 'percent' }"
                />
              </SettingRow>

              <SettingRow label="Journée atteinte à ±" for="tol-day">
                <template #hint>
                  <template v-if="dayToleranceExample">
                    Entre <span class="tabular-nums">{{ formatNumber(dayToleranceExample.low) }}</span> et <span class="tabular-nums">{{ formatNumber(dayToleranceExample.high) }}</span> kcal, macros comprises
                  </template>
                  <template v-else>
                    Marge autour des objectifs de la journée
                  </template>
                </template>
                <UInputNumber
                  id="tol-day"
                  v-model="settings.dayTolerance"
                  :min="1"
                  :max="20"
                  size="sm"
                  class="w-28"
                  :format-options="{ style: 'unit', unit: 'percent' }"
                />
              </SettingRow>
            </div>
          </section>

          <!-- Menus -->
          <section id="menus" aria-labelledby="menus-title" class="flex scroll-mt-4 flex-col rounded-xl border border-default bg-default">
            <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="menus-title" class="text-lg font-bold tracking-tight text-highlighted">
                Menus
              </h2>
              <SavedHint :stamp="saved.menus" />
            </header>
            <div class="border-t border-default">
              <SettingRow label="Parts par défaut" hint="Proposé quand vous ajoutez une recette à la semaine." for="portions">
                <UInputNumber
                  id="portions"
                  v-model="settings.householdPortions"
                  :min="1"
                  :max="12"
                  size="sm"
                  class="w-28"
                  :ui="{ base: 'tabular-nums' }"
                />
              </SettingRow>
            </div>
          </section>

          <!-- Liste de courses -->
          <section id="courses" aria-labelledby="courses-title" class="flex scroll-mt-4 flex-col rounded-xl border border-default bg-default">
            <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="courses-title" class="text-lg font-bold tracking-tight text-highlighted">
                Liste de courses
              </h2>
              <SavedHint :stamp="saved.courses" />
            </header>

            <div class="divide-y divide-default border-t border-default">
              <SettingRow label="Jour de courses" stack>
                <template #hint>
                  Période proposée : <span class="tabular-nums">{{ shoppingPeriod }}</span>
                </template>
                <USelect
                  v-model="settings.shoppingDay"
                  :items="dayItems"
                  size="sm"
                  class="w-full sm:w-40"
                  aria-label="Jour de courses"
                />
              </SettingRow>

              <div class="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex flex-col gap-0.5">
                    <p class="text-sm font-medium text-highlighted">
                      Ordre des rayons
                    </p>
                    <p class="text-xs text-dimmed text-pretty">
                      Rangez-les dans l'ordre de votre parcours en magasin : la liste suivra.
                    </p>
                  </div>
                  <UButton
                    v-if="aisleOrderChanged"
                    label="Ordre par défaut"
                    icon="i-lucide-rotate-ccw"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="shrink-0"
                    @click="resetAisles"
                  />
                </div>

                <VueDraggable
                  v-model="aisles"
                  tag="ol"
                  class="flex flex-col overflow-hidden rounded-lg border border-default"
                  handle=".aisle-handle"
                  :animation="180"
                  ghost-class="aisle-ghost"
                  chosen-class="aisle-chosen"
                >
                  <li
                    v-for="(aisle, index) in aisles"
                    :key="aisle.id"
                    class="flex items-center gap-3 border-b border-default bg-default py-1.5 ps-2 pe-1.5 last:border-b-0"
                  >
                    <button
                      type="button"
                      class="aisle-handle flex size-7 shrink-0 cursor-grab items-center justify-center rounded-sm text-dimmed hover:text-highlighted active:cursor-grabbing"
                      :aria-label="`Déplacer ${aisle.label}`"
                      tabindex="-1"
                    >
                      <UIcon name="i-lucide-grip-vertical" class="size-4" />
                    </button>
                    <span class="w-5 shrink-0 text-end text-xs tabular-nums text-dimmed">{{ index + 1 }}</span>
                    <UIcon :name="categoryIconName(aisle.icon)!" class="size-4 shrink-0 text-muted" />
                    <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ aisle.label }}</span>
                    <div class="flex shrink-0">
                      <UButton
                        :id="`aisle-${aisle.id}-up`"
                        icon="i-lucide-chevron-up"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :disabled="index === 0"
                        :aria-label="`Monter ${aisle.label}`"
                        @click="moveAisle(index, -1)"
                      />
                      <UButton
                        :id="`aisle-${aisle.id}-down`"
                        icon="i-lucide-chevron-down"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :disabled="index === aisles.length - 1"
                        :aria-label="`Descendre ${aisle.label}`"
                        @click="moveAisle(index, 1)"
                      />
                    </div>
                  </li>
                </VueDraggable>
              </div>

              <div class="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
                <div class="flex flex-col gap-0.5">
                  <label for="pantry" class="text-sm font-medium text-highlighted">Garde-manger permanent</label>
                  <p class="text-xs text-dimmed text-pretty">
                    Toujours à la maison : ces articles arrivent déjà marqués « à la maison » dans chaque liste.
                  </p>
                </div>
                <UInputTags
                  id="pantry"
                  v-model="settings.pantry"
                  placeholder="Ajouter un article…"
                  icon="i-lucide-archive"
                  class="w-full"
                />
              </div>

              <SettingRow label="Arrondir à la pièce" hint="« 520 g de courgette » devient « 3 pièces (520 g) ».">
                <USwitch v-model="settings.roundUpPieces" aria-label="Arrondir à la pièce supérieure" />
              </SettingRow>

              <div class="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
                <div class="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div class="flex flex-col gap-0.5">
                    <p class="text-sm font-medium text-highlighted">
                      Format de copie
                    </p>
                    <p class="text-xs text-dimmed">
                      Ce que colle le bouton « Copier » de la liste.
                    </p>
                  </div>
                  <UFieldGroup size="sm" class="w-full sm:w-auto">
                    <UButton
                      v-for="option in EXPORT_FORMATS"
                      :key="option.value"
                      :label="option.label"
                      :icon="option.icon"
                      :color="settings.exportFormat === option.value ? 'primary' : 'neutral'"
                      :variant="settings.exportFormat === option.value ? 'solid' : 'outline'"
                      :aria-pressed="settings.exportFormat === option.value"
                      class="flex-1 justify-center sm:flex-none"
                      @click="settings.exportFormat = option.value"
                    />
                  </UFieldGroup>
                </div>
                <figure class="flex flex-col gap-1.5">
                  <figcaption class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Aperçu
                  </figcaption>
                  <pre class="overflow-x-auto rounded-lg border border-default bg-elevated px-3 py-2.5 font-mono text-xs leading-relaxed text-default">{{ exportPreview }}</pre>
                </figure>
              </div>
            </div>
          </section>

          <!-- Suivi -->
          <section id="suivi" aria-labelledby="suivi-title" class="flex scroll-mt-4 flex-col rounded-xl border border-default bg-default">
            <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <h2 id="suivi-title" class="text-lg font-bold tracking-tight text-highlighted">
                Suivi
              </h2>
              <SavedHint :stamp="saved.suivi" />
            </header>

            <div class="divide-y divide-default border-t border-default">
              <div class="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
                <div class="flex flex-col gap-0.5">
                  <p class="text-sm font-medium text-highlighted">
                    Zones de mensurations
                  </p>
                  <p class="text-xs text-dimmed">
                    Seules les zones cochées sont proposées à la saisie et sur la silhouette. Il en faut au moins une.
                  </p>
                </div>
                <UCheckboxGroup
                  v-model="settings.trackedZones"
                  :items="zoneItems"
                  variant="card"
                  size="sm"
                  :ui="{ fieldset: 'grid grid-cols-2 gap-2 sm:grid-cols-4' }"
                  aria-label="Zones de mensurations suivies"
                />
              </div>

              <SettingRow label="Projection sur le graphique de poids" hint="La courbe en pointillés issue de votre objectif.">
                <USwitch v-model="settings.showGoalProjection" aria-label="Afficher la projection de l'objectif" />
              </SettingRow>
            </div>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style>
.aisle-ghost {
  opacity: 0.5;
  background-color: color-mix(in oklch, var(--ui-primary) 6%, transparent) !important;
}

.aisle-chosen {
  background-color: var(--ui-bg-elevated) !important;
}

.aisle-chosen .aisle-handle {
  color: var(--ui-primary);
}
</style>
