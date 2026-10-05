<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui'
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { TrendPoint, WeighIn } from '~/utils/weightTrend'

useSeoMeta({
  title: 'Dashboard - Suivi de poids - Mealfit',
  description: 'Dashboard - Suivi de poids - Mealfit',
})

const toast = useToast()

// --- Données : pesées (`users/{uid}/weighIns`) et objectif du profil ---

const { weighIns, error: loadError, promise: loaded, saveWeighIn, deleteWeighIn } = useWeighIns()
const profile = useProfile()
const { settings } = useAppSettings()

watch(loadError, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les pesées : ${error.message}`, color: 'error' })
})

// Une erreur de chargement est signalée par le toast ci-dessus, sans bloquer la page.
await Promise.all([loaded.value.catch(() => undefined), profile.ready])

/** Objectif du profil ; la courbe de projection suit le réglage « Projection sur le graphique de poids ». */
const goal = computed(() => {
  const value = trackingGoal(profile.goal, profile.body, profile.age)
  return value && !settings.value.showGoalProjection ? { ...value, projection: null } : value
})

// --- Tendance et indicateurs ---

const today = toIsoDay(new Date())
const points = computed(() => computeTrend(weighIns.value))
const latest = computed(() => points.value.at(-1) ?? null)
const isProvisional = computed(() => points.value.length < MIN_WEIGH_INS_FOR_TREND)

const shortDate = (date: string) => format(parseISO(date), 'd MMM', { locale: fr })
const longDate = (date: string) => format(parseISO(date), 'd MMMM', { locale: fr })

const latestLabel = computed(() => {
  if (!latest.value) return ''
  if (latest.value.date === today) return 'Pesée du jour'
  return `Dernière pesée le ${longDate(latest.value.date)}`
})

/** Variation de la tendance sur 30 jours (ou depuis la première pesée si l'historique est plus court). */
const monthChange = computed(() => {
  const current = latest.value
  const first = points.value[0]
  if (!current || !first || current === first) return null
  const reference = trendAt(points.value, toIsoDay(subDays(parseISO(current.date), 30))) ?? first
  return { deltaKg: current.trendKg - reference.trendKg, from: reference }
})

const rate = computed(() => trendRateKgPerWeek(points.value))
/** Rythme de la projection sur les mêmes 4 semaines ; `null` sans projection. */
const plannedRate = computed(() => (goal.value && latest.value ? projectionRateKgPerWeek(goal.value, latest.value.date) : null))

const goalProgress = computed(() => {
  const g = goal.value
  const current = latest.value
  if (!g || !current) return null
  const total = g.startWeightKg - g.targetWeightKg
  const done = g.startWeightKg - current.trendKg
  const remainingKg = Math.abs(current.trendKg - g.targetWeightKg)
  const ratio = total === 0 ? 1 : Math.min(Math.max(done / total, 0), 1)
  const projectedKg = projectionAt(g, current.date)
  return {
    remainingKg,
    ratio,
    /** Positif : au-dessus de la projection (en retard sur une perte) ; `null` sans projection à cette date. */
    gapKg: projectedKg === null ? null : current.trendKg - projectedKg,
    eta: estimateGoalDate(current.trendKg, g.targetWeightKg, rate.value, current.date),
  }
})

// --- Graphique ---

const RANGES = [
  { label: '1 mois', value: '30' },
  { label: '3 mois', value: '90' },
  { label: '6 mois', value: '180' },
  { label: 'Tout', value: 'all' },
] satisfies TabsItem[]

const range = ref<string>('90')

const chartFrom = computed(() => {
  const first = points.value[0]?.date ?? today
  if (range.value === 'all') return first
  const start = toIsoDay(subDays(parseISO(today), Number(range.value)))
  return start > first ? start : first
})

// --- Journal ---

const JOURNAL_PAGE_SIZE = 14
const visibleCount = ref(JOURNAL_PAGE_SIZE)

type JournalRow =
  | { kind: 'entry', key: string, entry: TrendPoint }
  | { kind: 'gap', key: string, missingDays: number }

/** Pesées de la plus récente à la plus ancienne, avec une ligne quand plusieurs jours manquent. */
const journalRows = computed<JournalRow[]>(() => {
  const entries = [...points.value].reverse().slice(0, visibleCount.value)
  const rows: JournalRow[] = []
  entries.forEach((entry, i) => {
    rows.push({ kind: 'entry', key: entry.id, entry })
    const older = entries[i + 1]
    if (!older) return
    const missingDays = differenceInCalendarDays(parseISO(entry.date), parseISO(older.date)) - 1
    if (missingDays >= 3) rows.push({ kind: 'gap', key: `gap-${entry.id}`, missingDays })
  })
  return rows
})

const hiddenCount = computed(() => Math.max(points.value.length - visibleCount.value, 0))

// --- Saisie, modification, suppression ---

const formOpen = ref(false)
const editing = ref<WeighIn | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(weighIn: WeighIn) {
  editing.value = weighIn
  formOpen.value = true
}

const toastSaveError = (message: string) => (error: any) => {
  toast.add({
    title: 'Erreur',
    description: `${message} : ${error.message || 'une erreur est survenue'}.`,
    color: 'error',
  })
}

/** Le listener affiche la pesée aussitôt ; hors ligne, l'écriture n'aboutit qu'à la synchronisation, d'où le toast immédiat. */
function onSave(value: Omit<WeighIn, 'id'>) {
  const previous = editing.value
  saveWeighIn(value, previous).catch(toastSaveError('La pesée n\'a pas pu être enregistrée'))
  toast.add({
    title: previous ? 'Pesée modifiée' : 'Pesée enregistrée',
    description: `${formatWeight(value.weightKg)} kg le ${longDate(value.date)}`,
    color: 'success',
    icon: 'i-lucide-check',
  })
}

const deleting = ref<WeighIn | null>(null)
const deleteOpen = ref(false)

function askDelete(weighIn: WeighIn) {
  deleting.value = weighIn
  deleteOpen.value = true
}

function confirmDelete() {
  const target = deleting.value
  if (!target) return
  deleteWeighIn(target).catch(toastSaveError('La pesée n\'a pas pu être supprimée'))
  deleteOpen.value = false
  toast.add({ title: 'Pesée supprimée', color: 'neutral', icon: 'i-lucide-trash-2' })
}

function rowActions(weighIn: WeighIn): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openEdit(weighIn) }],
    [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(weighIn) }],
  ]
}
</script>

<template>
  <UDashboardPanel id="suivi-poids">
    <template #header>
      <UDashboardNavbar title="Suivi de poids">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" aria-label="Ajouter une pesée" @click="openCreate">
            <span class="hidden sm:inline">Ajouter une pesée</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="!latest"
        class="py-16"
        icon="i-lucide-scale"
        title="Aucune pesée pour l'instant"
        description="Pesez-vous le matin, à jeun, et notez le chiffre ici. Après une semaine, la tendance lisse les variations d'eau et de sel pour montrer votre vraie évolution."
        :actions="[{ label: 'Ajouter ma première pesée', icon: 'i-lucide-plus', onClick: openCreate }]"
      />

      <div v-else class="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <!-- Relevé : une seule grille à filets, lue comme une fiche technique. -->
        <section
          aria-label="Relevé"
          class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-default bg-border lg:grid-cols-4"
        >
          <div class="col-span-2 flex flex-col gap-1 bg-default p-4 sm:p-5 lg:col-span-1">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                Tendance 7 jours
              </p>
              <UBadge
                v-if="isProvisional"
                label="Provisoire"
                color="neutral"
                variant="subtle"
                size="sm"
                class="rounded-full"
              />
            </div>
            <p class="flex items-baseline gap-1">
              <span class="text-4xl font-bold tracking-tight tabular-nums text-highlighted">{{ formatWeight(latest.trendKg) }}</span>
              <span class="text-sm text-muted">kg</span>
            </p>
            <p class="text-xs text-dimmed">
              {{ latestLabel }}
              <span class="font-semibold tabular-nums text-muted">{{ formatWeight(latest.weightKg) }} kg</span>
            </p>
            <p v-if="isProvisional" class="text-xs text-dimmed">
              Fiable à partir de {{ MIN_WEIGH_INS_FOR_TREND }} pesées ({{ points.length }} pour l'instant)
            </p>
          </div>

          <div class="flex flex-col gap-1 bg-default p-4 sm:p-5">
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              Sur 30 jours
            </p>
            <template v-if="monthChange">
              <p class="flex items-baseline gap-1">
                <span class="text-2xl font-bold tabular-nums text-highlighted">{{ formatSignedWeight(monthChange.deltaKg) }}</span>
                <span class="text-sm text-muted">kg</span>
              </p>
              <p class="text-xs text-dimmed">
                depuis <span class="tabular-nums">{{ formatWeight(monthChange.from.trendKg) }}</span> kg le {{ shortDate(monthChange.from.date) }}
              </p>
            </template>
            <p v-else class="text-sm text-dimmed">
              Une seule pesée pour l'instant
            </p>
          </div>

          <div class="flex flex-col gap-1 bg-default p-4 sm:p-5">
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              Rythme 4 semaines
            </p>
            <template v-if="rate !== null">
              <p class="flex items-baseline gap-1">
                <span class="text-2xl font-bold tabular-nums text-highlighted">{{ formatSignedWeight(rate, 2) }}</span>
                <span class="text-sm text-muted">kg/sem</span>
              </p>
              <p v-if="plannedRate !== null" class="text-xs text-dimmed">
                Prévu <span class="tabular-nums">{{ formatSignedWeight(plannedRate, 2) }}</span> kg/sem
              </p>
            </template>
            <p v-else class="text-sm text-dimmed">
              Disponible après une semaine de pesées
            </p>
            <p v-if="!goal" class="text-xs text-dimmed">
              Sans objectif, pas de rythme prévu
            </p>
          </div>

          <div class="col-span-2 flex flex-col gap-1 bg-default p-4 sm:p-5 lg:col-span-1">
            <template v-if="goal && goalProgress">
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                Objectif <span class="tabular-nums">{{ formatWeight(goal.targetWeightKg) }}</span> kg
              </p>
              <p class="flex items-baseline gap-1">
                <span class="text-2xl font-bold tabular-nums text-highlighted">{{ formatWeight(goalProgress.remainingKg) }}</span>
                <span class="text-sm text-muted">kg restants</span>
              </p>
              <div
                class="mt-1 h-1.5 overflow-hidden rounded-full bg-accented"
                role="progressbar"
                :aria-valuenow="Math.round(goalProgress.ratio * 100)"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Progression vers l'objectif"
              >
                <div class="h-full rounded-full bg-primary transition-all duration-500" :style="{ width: `${goalProgress.ratio * 100}%` }" />
              </div>
              <p class="mt-1 flex justify-between gap-2 text-xs tabular-nums text-dimmed">
                <span>Départ {{ formatWeight(goal.startWeightKg) }} kg</span>
                <span class="font-semibold text-muted">{{ Math.round(goalProgress.ratio * 100) }} %</span>
              </p>
              <p v-if="goalProgress.eta" class="text-xs text-dimmed">
                À ce rythme, atteint vers {{ format(parseISO(goalProgress.eta), 'MMMM yyyy', { locale: fr }) }}
              </p>
            </template>
            <template v-else>
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                Objectif
              </p>
              <p class="text-sm text-muted">
                Aucun objectif défini
              </p>
              <p class="text-xs text-dimmed">
                Un objectif de perte ou de prise avec un poids visé, dans votre profil, donne la progression et le rythme prévu.
              </p>
              <UButton
                to="/dashboard/profil"
                label="Définir mon objectif"
                trailing-icon="i-lucide-arrow-right"
                color="neutral"
                variant="link"
                size="sm"
                class="-ms-2.5 self-start"
              />
            </template>
          </div>
        </section>

        <!-- Évolution : tendance contre projection du calculateur. -->
        <section aria-labelledby="evolution-title" class="flex flex-col gap-4 rounded-xl border border-default bg-default p-4 sm:p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex flex-col gap-1">
              <h2 id="evolution-title" class="text-lg font-bold tracking-tight text-highlighted">
                Évolution
              </h2>
              <template v-if="goal && goalProgress?.gapKg != null">
                <p v-if="Math.abs(goalProgress.gapKg) < 0.1" class="text-sm text-muted">
                  Tendance alignée sur la projection du calculateur
                </p>
                <p v-else class="text-sm text-muted">
                  Tendance
                  <span class="font-semibold tabular-nums text-highlighted">{{ formatWeight(Math.abs(goalProgress.gapKg)) }} kg</span>
                  {{ goalProgress.gapKg > 0 === isLossGoal(goal) ? 'derrière' : 'devant' }}
                  la projection du calculateur
                </p>
              </template>
            </div>
            <UTabs
              v-model="range"
              :items="RANGES"
              :content="false"
              variant="pill"
              size="xs"
              class="w-full sm:w-auto"
            />
          </div>

          <WeightTrendChart :points="points" :goal="goal" :from="chartFrom" :to="today" />

          <ul class="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Légende">
            <li class="flex items-center gap-2">
              <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3" fill="var(--ui-text-dimmed)" /></svg>
              Pesées
            </li>
            <li class="flex items-center gap-2">
              <svg width="18" height="10" aria-hidden="true"><line x1="1" x2="17" y1="5" y2="5" stroke="var(--ui-primary)" stroke-width="2.5" stroke-linecap="round" /></svg>
              Tendance 7 jours
            </li>
            <template v-if="goal">
              <li v-if="goal.projection" class="flex items-center gap-2">
                <svg width="18" height="10" aria-hidden="true"><line x1="0" x2="18" y1="5" y2="5" stroke="var(--ui-text-dimmed)" stroke-width="1.5" stroke-dasharray="4 4" /></svg>
                Projection du calculateur
              </li>
              <li class="flex items-center gap-2">
                <svg width="18" height="10" aria-hidden="true"><line x1="0" x2="18" y1="5" y2="5" stroke="var(--ui-text-muted)" stroke-width="1" /></svg>
                Objectif
              </li>
            </template>
          </ul>
        </section>

        <!-- Journal des pesées. -->
        <section aria-labelledby="journal-title" class="flex flex-col rounded-xl border border-default bg-default">
          <div class="flex items-baseline justify-between gap-3 p-4 sm:px-5">
            <h2 id="journal-title" class="text-lg font-bold tracking-tight text-highlighted">
              Journal
            </h2>
            <p class="text-xs tabular-nums text-dimmed">
              {{ points.length }} {{ points.length > 1 ? 'pesées' : 'pesée' }}
            </p>
          </div>

          <div class="hidden grid-cols-[8.5rem_minmax(0,1fr)_5.5rem_6rem_2rem] gap-x-4 border-y border-default px-5 py-2 text-xs font-semibold uppercase tracking-wide text-dimmed sm:grid">
            <span>Date</span>
            <span>Note</span>
            <span class="text-end">Poids</span>
            <span class="text-end">Vs tendance</span>
            <span class="sr-only">Actions</span>
          </div>

          <ul class="divide-y divide-default border-t border-default sm:border-t-0">
            <template v-for="row in journalRows" :key="row.key">
              <li
                v-if="row.kind === 'entry'"
                class="grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-x-4 px-4 py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)_5.5rem_6rem_2rem] sm:px-5"
              >
                <div class="min-w-0 sm:contents">
                  <p class="text-sm text-highlighted first-letter:uppercase">
                    {{ format(parseISO(row.entry.date), 'EEE d MMM', { locale: fr }) }}
                  </p>
                  <p class="truncate text-xs text-dimmed sm:text-sm sm:text-muted">
                    <span v-if="row.entry.note">{{ row.entry.note }}</span>
                    <span v-else class="hidden sm:inline text-dimmed">—</span>
                  </p>
                </div>
                <div class="text-end sm:contents">
                  <p class="text-sm font-semibold tabular-nums text-highlighted sm:text-end">
                    {{ formatWeight(row.entry.weightKg) }} <span class="font-normal text-muted">kg</span>
                  </p>
                  <p class="text-xs tabular-nums text-dimmed sm:text-end sm:text-sm">
                    {{ formatSignedWeight(row.entry.weightKg - row.entry.trendKg) }}
                  </p>
                </div>
                <UDropdownMenu :items="rowActions(row.entry)" :content="{ align: 'end' }">
                  <UButton
                    icon="i-lucide-ellipsis"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :aria-label="`Actions pour la pesée du ${longDate(row.entry.date)}`"
                  />
                </UDropdownMenu>
              </li>
              <li v-else class="flex items-center gap-2 bg-elevated/50 px-4 py-2 text-xs text-dimmed sm:px-5">
                <UIcon name="i-lucide-calendar-off" class="size-3.5 shrink-0" aria-hidden="true" />
                Aucune pesée pendant {{ row.missingDays }} jours
              </li>
            </template>
          </ul>

          <div v-if="hiddenCount > 0" class="flex justify-center border-t border-default p-2">
            <UButton
              :label="`Afficher ${Math.min(hiddenCount, JOURNAL_PAGE_SIZE)} de plus`"
              color="neutral"
              variant="ghost"
              size="sm"
              trailing-icon="i-lucide-chevron-down"
              @click="visibleCount += JOURNAL_PAGE_SIZE"
            />
          </div>
        </section>
      </div>

      <WeighInModal
        v-model:open="formOpen"
        :weigh-in="editing"
        :existing="weighIns"
        @save="onSave"
      />

      <ConfirmDialog
        v-model:open="deleteOpen"
        :title="deleting ? `Supprimer la pesée du ${longDate(deleting.date)} ?` : 'Supprimer la pesée ?'"
        :description="deleting ? `${formatWeight(deleting.weightKg)} kg. Cette suppression est définitive.` : undefined"
        confirm-label="Supprimer"
        confirm-color="error"
        confirm-icon="i-lucide-trash-2"
        @confirm="confirmDelete"
      />
    </template>
  </UDashboardPanel>
</template>
