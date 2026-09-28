<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { MeasurementSession, MeasurementZoneKey } from '~/utils/measurements'

useSeoMeta({
  title: 'Dashboard - Suivi de mensurations - Mealfit',
  description: 'Dashboard - Suivi de mensurations - Mealfit',
})

const toast = useToast()

// --- Données d'exemple : maquette sans Firestore, avec plusieurs scénarios pour voir chaque état ---

type Scenario = 'full' | 'single' | 'empty'

const SCENARIO_LABELS: Record<Scenario, string> = {
  full: '5 séances sur 3 mois',
  single: 'Une seule séance',
  empty: 'Aucune séance',
}

const scenario = ref<Scenario>('full')
const sessions = ref<MeasurementSession[]>([])

function loadScenario(value: Scenario) {
  scenario.value = value
  const sample = buildSampleSessions()
  sessions.value = value === 'empty' ? [] : value === 'single' ? sample.slice(-1) : sample
}

const scenarioItems = computed<DropdownMenuItem[]>(() => [
  [{ type: 'label', label: 'Aperçu avec des données fictives' }],
  (Object.keys(SCENARIO_LABELS) as Scenario[]).map(value => ({
    label: SCENARIO_LABELS[value],
    type: 'checkbox' as const,
    checked: scenario.value === value,
    onSelect: () => loadScenario(value),
  })),
])

// --- Synthèse ---

const sorted = computed(() => sortSessions(sessions.value))
const firstSession = computed(() => sorted.value[0] ?? null)
const lastSession = computed(() => sorted.value.at(-1) ?? null)
const summaries = computed(() => summarizeZones(sessions.value))

const longDate = (date: string) => format(parseISO(date), 'd MMMM', { locale: fr })
const shortDate = (date: string) => format(parseISO(date), 'd MMM', { locale: fr })

/** Somme des écarts depuis le départ, sur les zones mesurées au moins deux fois. */
const total = computed(() => {
  const deltas = summaries.value.map(s => s.sinceStartCm).filter((d): d is number => d !== null)
  return deltas.length ? { cm: deltas.reduce((a, b) => a + b, 0), zones: deltas.length } : null
})

// --- Zone sélectionnée ---

const selectedKey = ref<MeasurementZoneKey | null>('waist')
const selected = computed(() => summaries.value.find(s => s.zone.key === selectedKey.value) ?? summaries.value[0]!)
const selectedHistory = computed(() => zoneHistory(sessions.value, selected.value.zone.key))

// --- Historique ---

const columns = computed(() => [...sorted.value].reverse())

// --- Saisie, modification, suppression ---

const formOpen = ref(false)
const editing = ref<MeasurementSession | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(session: MeasurementSession) {
  editing.value = session
  formOpen.value = true
}

function onSave(value: Omit<MeasurementSession, 'id'>) {
  const editedId = editing.value?.id
  sessions.value = [
    ...sessions.value.filter(s => s.id !== editedId),
    { ...value, id: `local-${Date.now()}` },
  ]
  toast.add({
    title: editedId ? 'Séance modifiée' : 'Séance enregistrée',
    description: `${Object.keys(value.values).length} zones mesurées le ${longDate(value.date)}`,
    color: 'success',
    icon: 'i-lucide-check',
  })
}

const deleting = ref<MeasurementSession | null>(null)
const deleteOpen = ref(false)

function askDelete(session: MeasurementSession) {
  deleting.value = session
  deleteOpen.value = true
}

function confirmDelete() {
  const target = deleting.value
  if (!target) return
  sessions.value = sessions.value.filter(s => s.id !== target.id)
  deleteOpen.value = false
  toast.add({ title: 'Séance supprimée', color: 'neutral', icon: 'i-lucide-trash-2' })
}

function sessionActions(session: MeasurementSession): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openEdit(session) }],
    [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(session) }],
  ]
}

loadScenario('full')
</script>

<template>
  <UDashboardPanel id="suivi-mensurations">
    <template #header>
      <UDashboardNavbar title="Suivi de mensurations">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UDropdownMenu :items="scenarioItems" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-flask-conical"
              trailing-icon="i-lucide-chevron-down"
              aria-label="Choisir un jeu de données d'exemple"
            >
              <span class="hidden sm:inline">Données d'exemple</span>
            </UButton>
          </UDropdownMenu>
          <UButton icon="i-lucide-plus" aria-label="Nouvelle séance" @click="openCreate">
            <span class="hidden sm:inline">Nouvelle séance</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!lastSession" class="mx-auto grid w-full max-w-4xl items-center gap-8 py-6 md:grid-cols-2">
        <MeasurementSilhouette :summaries="summaries" disabled class="max-w-xs" />
        <div class="flex flex-col items-center gap-3 text-center md:items-start md:text-start">
          <h2 class="text-lg font-bold tracking-tight text-highlighted">
            Aucune mensuration pour l'instant
          </h2>
          <p class="max-w-sm text-sm text-muted">
            Une séance toutes les 3 à 4 semaines suffit : 7 tours de ruban, trois minutes le matin.
            Le tour de taille bouge souvent avant la balance.
          </p>
          <UButton label="Faire ma première séance" icon="i-lucide-plus" class="mt-2" @click="openCreate" />
        </div>
      </div>

      <div v-else class="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <p class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
          <span>Dernière séance le <span class="text-highlighted">{{ longDate(lastSession.date) }}</span></span>
          <span class="text-dimmed" aria-hidden="true">·</span>
          <span class="tabular-nums">{{ sorted.length }} {{ sorted.length > 1 ? 'séances' : 'séance' }} depuis le {{ longDate(firstSession!.date) }}</span>
          <template v-if="total">
            <span class="text-dimmed" aria-hidden="true">·</span>
            <span>
              Total <span class="font-semibold tabular-nums text-highlighted">{{ formatSignedCm(total.cm) }} cm</span>
              sur {{ total.zones }} zones
            </span>
          </template>
        </p>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <!-- Silhouette annotée : chaque étiquette sélectionne sa zone. -->
          <section aria-label="Silhouette" class="flex flex-col gap-3 rounded-xl border border-default bg-default p-4 sm:p-5">
            <MeasurementSilhouette v-model:selected="selectedKey" :summaries="summaries" class="max-w-md" />
            <p class="text-center text-xs text-dimmed">
              Tours en cm<template v-if="sorted.length > 1">
                · écart depuis le {{ longDate(firstSession!.date) }}
              </template>
            </p>
          </section>

          <!-- Détail de la zone sélectionnée. -->
          <section aria-labelledby="zone-title" class="flex flex-col gap-5 rounded-xl border border-default bg-default p-4 sm:p-5">
            <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <h2 id="zone-title" class="text-lg font-bold tracking-tight text-highlighted">
                  {{ selected.zone.label }}
                </h2>
                <p v-if="selected.latest" class="flex items-baseline gap-1">
                  <span class="text-4xl font-bold tracking-tight tabular-nums text-highlighted">{{ formatCm(selected.latest.valueCm) }}</span>
                  <span class="text-sm text-muted">cm</span>
                </p>
                <p v-else class="text-sm text-dimmed">
                  Pas encore mesurée
                </p>
              </div>
              <dl v-if="selected.sinceStartCm !== null" class="grid grid-cols-2 gap-x-6 gap-y-0.5 text-end tabular-nums">
                <dt class="text-xs text-dimmed">
                  Depuis le départ
                </dt>
                <dt class="text-xs text-dimmed">
                  Séance précédente
                </dt>
                <dd class="text-lg font-semibold text-highlighted">
                  {{ formatSignedCm(selected.sinceStartCm) }} <span class="text-xs font-normal text-muted">cm</span>
                </dd>
                <dd class="text-lg font-semibold text-highlighted">
                  {{ formatSignedCm(selected.sinceLastCm!) }} <span class="text-xs font-normal text-muted">cm</span>
                </dd>
              </dl>
            </div>

            <MeasurementZoneChart v-if="selectedHistory.length > 1" :key="selected.zone.key" :points="selectedHistory" />
            <div v-else class="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-default px-6 text-center text-sm text-dimmed">
              Une deuxième séance fera apparaître l'évolution de cette zone.
            </div>

            <div class="mt-auto flex gap-3 border-t border-default pt-4">
              <UIcon name="i-lucide-ruler" class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              <p class="text-sm text-muted">
                <span class="font-semibold text-highlighted">Comment mesurer.</span>
                {{ selected.zone.howTo }}
              </p>
            </div>
          </section>
        </div>

        <!-- Historique : zones en lignes, séances en colonnes (la plus récente d'abord). -->
        <section aria-labelledby="history-title" class="flex flex-col rounded-xl border border-default bg-default">
          <div class="flex items-baseline justify-between gap-3 p-4 sm:px-5">
            <h2 id="history-title" class="text-lg font-bold tracking-tight text-highlighted">
              Historique
            </h2>
            <p class="text-xs text-dimmed">
              en cm
            </p>
          </div>

          <div class="overflow-x-auto border-t border-default">
            <table class="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr class="border-b border-default">
                  <th scope="col" class="sticky left-0 z-10 bg-default py-2 ps-4 pe-3 text-start text-xs font-semibold uppercase tracking-wide text-dimmed sm:ps-5">
                    Zone
                  </th>
                  <th v-if="sorted.length > 1" scope="col" class="px-3 py-2 text-end text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Écart
                  </th>
                  <th v-for="session in columns" :key="session.id" scope="col" class="py-1 ps-3 pe-1 text-end font-normal">
                    <div class="flex items-center justify-end gap-0.5">
                      <span class="whitespace-nowrap text-xs font-semibold text-muted">{{ shortDate(session.date) }}</span>
                      <UDropdownMenu :items="sessionActions(session)" :content="{ align: 'end' }">
                        <UButton
                          icon="i-lucide-ellipsis-vertical"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          :aria-label="`Actions pour la séance du ${longDate(session.date)}`"
                        />
                      </UDropdownMenu>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="summary in summaries"
                  :key="summary.zone.key"
                  class="group cursor-pointer"
                  :class="selectedKey === summary.zone.key ? 'bg-elevated' : 'hover:bg-elevated'"
                  @click="selectedKey = summary.zone.key"
                >
                  <th
                    scope="row"
                    class="sticky left-0 z-10 py-2.5 ps-4 pe-3 text-start font-semibold sm:ps-5"
                    :class="selectedKey === summary.zone.key ? 'bg-elevated' : 'bg-default group-hover:bg-elevated'"
                  >
                    <button
                      type="button"
                      class="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      :class="selectedKey === summary.zone.key ? 'text-primary' : 'text-highlighted'"
                      :aria-pressed="selectedKey === summary.zone.key"
                      @click.stop="selectedKey = summary.zone.key"
                    >
                      {{ summary.zone.label }}
                    </button>
                  </th>
                  <td v-if="sorted.length > 1" class="px-3 py-2.5 text-end font-semibold text-highlighted">
                    {{ summary.sinceStartCm !== null ? formatSignedCm(summary.sinceStartCm) : '—' }}
                  </td>
                  <td
                    v-for="(session, i) in columns"
                    :key="session.id"
                    class="py-2.5 ps-3 pe-8 text-end"
                    :class="i === 0 ? 'text-highlighted' : 'text-muted'"
                  >
                    <span v-if="session.values[summary.zone.key] !== undefined">{{ formatCm(session.values[summary.zone.key]!) }}</span>
                    <span v-else class="text-dimmed" title="Non mesurée ce jour-là">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <MeasurementSessionSlideover
        v-model:open="formOpen"
        :session="editing"
        :existing="sessions"
        @save="onSave"
      />

      <ConfirmDialog
        v-model:open="deleteOpen"
        :title="deleting ? `Supprimer la séance du ${longDate(deleting.date)} ?` : 'Supprimer la séance ?'"
        :description="deleting ? `Ses ${Object.keys(deleting.values).length} mesures seront supprimées définitivement.` : undefined"
        confirm-label="Supprimer"
        confirm-color="error"
        confirm-icon="i-lucide-trash-2"
        @confirm="confirmDelete"
      />
    </template>
  </UDashboardPanel>
</template>
