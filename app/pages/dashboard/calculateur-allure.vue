<script setup lang="ts">
import { parsePositiveNumber, formatGrams } from '~/utils/numberInput'

useSeoMeta({
  title: 'Dashboard - Calculateur pour trail - Mealfit',
  description: 'Dashboard - Calculateur pour trail - Mealfit',
})

const runDuration = ref('15:00')
const walkDuration = ref('00:00')
const runPaceTarget = ref('06:30')
const walkPaceTarget = ref('12:00')
const targetDistanceKm = ref('1')
const carbsPerHour = ref('50')

const EMPTY_RESULT = '—'

const avgPaceLabel = ref(EMPTY_RESULT)
const distanceLabel = ref(EMPTY_RESULT)
const speedLabel = ref(EMPTY_RESULT)
const targetDistanceTimeLabel = ref(EMPTY_RESULT)
const targetDistanceLabel = ref('1')
const targetDistanceCarbsLabel = ref(EMPTY_RESULT)

function parseMmSs(value: string): number | null {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d+):(\d{1,2})$/)
  if (!match) return null
  const m = Number(match[1])
  const s = Number(match[2])
  if (!Number.isFinite(m) || !Number.isFinite(s) || s >= 60 || m < 0 || s < 0) return null
  return m * 60 + s
}

function parseKmInput(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const km = Number(normalized)
  if (!Number.isFinite(km) || km <= 0) return null
  return km
}

function formatKmFrench(km: number): string {
  if (km % 1 === 0) return String(km)
  return km.toFixed(1).replace('.', ',')
}

function formatDuration(totalSec: number): string {
  const sec = Math.round(totalSec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) {
    return `${h} h ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatSpeed(kmh: number): string {
  if (!Number.isFinite(kmh)) return '0 km/h'
  const t = Math.round(kmh * 100) / 100
  const text = t % 1 === 0 ? String(t) : t.toFixed(2)
  return `${text} km/h`
}

function formatPace(totalSec: number, km: number): string {
  const secPerKm = totalSec / km
  let m = Math.floor(secPerKm / 60)
  let s = Math.round(secPerKm - m * 60)
  if (s === 60) {
    m += 1
    s = 0
  }
  if (s < 0) s = 0
  return `${m}'${String(s).padStart(2, '0')}/km`
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m'
  if (meters >= 1000) {
    const km = Math.round((meters / 1000) * 100) / 100
    const text = km % 1 === 0 ? String(km) : km.toFixed(2)
    return `${text} km`
  }
  return `${Math.round(meters)} m`
}

const runDurationSec = computed(() => parseMmSs(runDuration.value))
const walkDurationSec = computed(() => parseMmSs(walkDuration.value))
const runPaceSec = computed(() => parseMmSs(runPaceTarget.value))
const walkPaceSec = computed(() => parseMmSs(walkPaceTarget.value))
const targetKm = computed(() => (targetDistanceKm.value.trim() ? parseKmInput(targetDistanceKm.value) : null))
const carbsRate = computed(() => (carbsPerHour.value.trim() ? parsePositiveNumber(carbsPerHour.value) : null))

function durationError(value: string, seconds: number | null) {
  if (!value.trim()) return 'Requis — utilisez 00:00 si aucun'
  return seconds === null ? 'Format MM:SS attendu' : undefined
}

function paceError(value: string, seconds: number | null, segmentDurationSec: number | null) {
  if (!segmentDurationSec) return undefined
  if (!value.trim()) return 'Requis pour ce segment'
  if (seconds === null || seconds <= 0) return 'Format MM:SS attendu'
  return undefined
}

const runDurationError = computed(() => durationError(runDuration.value, runDurationSec.value))
const walkDurationError = computed(() => durationError(walkDuration.value, walkDurationSec.value))
const runPaceError = computed(() => paceError(runPaceTarget.value, runPaceSec.value, runDurationSec.value))
const walkPaceError = computed(() => paceError(walkPaceTarget.value, walkPaceSec.value, walkDurationSec.value))
const targetDistanceError = computed(() => (targetDistanceKm.value.trim() && targetKm.value === null ? 'Entrez un nombre valide' : undefined))
const carbsRateError = computed(() => (carbsPerHour.value.trim() && carbsRate.value === null ? 'Entrez un nombre valide' : undefined))

const canCalculate = computed(() => {
  if (runDurationSec.value === null || walkDurationSec.value === null) return false
  if (runDurationSec.value + walkDurationSec.value <= 0) return false
  if (runDurationError.value || walkDurationError.value || runPaceError.value || walkPaceError.value) return false
  if (targetDistanceError.value || carbsRateError.value) return false
  return true
})

const hasCalculated = computed(() => avgPaceLabel.value !== EMPTY_RESULT)
const hasTargetResult = computed(() => targetDistanceTimeLabel.value !== EMPTY_RESULT)

function resetResults() {
  avgPaceLabel.value = EMPTY_RESULT
  distanceLabel.value = EMPTY_RESULT
  speedLabel.value = EMPTY_RESULT
  targetDistanceTimeLabel.value = EMPTY_RESULT
  targetDistanceCarbsLabel.value = EMPTY_RESULT
}

function calculate() {
  if (!canCalculate.value) {
    resetResults()
    return
  }

  const runSec = runDurationSec.value!
  const walkSec = walkDurationSec.value!
  const cycleSec = runSec + walkSec

  let distanceKm = 0
  if (runSec > 0) distanceKm += runSec / runPaceSec.value!
  if (walkSec > 0) distanceKm += walkSec / walkPaceSec.value!

  if (distanceKm <= 0) {
    resetResults()
    return
  }

  avgPaceLabel.value = formatPace(cycleSec, distanceKm)
  distanceLabel.value = formatDistance(distanceKm * 1000)
  speedLabel.value = formatSpeed((distanceKm / cycleSec) * 3600)

  if (targetKm.value !== null) {
    const timeSec = targetKm.value * (cycleSec / distanceKm)
    targetDistanceTimeLabel.value = formatDuration(timeSec)
    targetDistanceLabel.value = formatKmFrench(targetKm.value)
    targetDistanceCarbsLabel.value = carbsRate.value !== null ? formatGrams(carbsRate.value * (timeSec / 3600)) : EMPTY_RESULT
  } else {
    targetDistanceTimeLabel.value = EMPTY_RESULT
    targetDistanceCarbsLabel.value = EMPTY_RESULT
  }
}
</script>

<template>
  <UDashboardPanel
    id="calculateur-allure"
    :ui="{ body: 'min-h-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Calculateur pour trail">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <a
            href="https://docs.google.com/spreadsheets/d/1C_Is3g7vrgSWME_oYJwCnl8BJ3_9ya20tdKv2iNXBQs/edit?hl=fr&gid=1829754159#gid=1829754159"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 text-sm text-muted hover:text-highlighted transition-colors"
          >
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 shrink-0" />
            Google Sheets
          </a>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col p-4 sm:p-6 overflow-auto">
        <div class="w-full flex flex-col gap-6 text-default">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <form class="flex flex-col gap-6" @submit.prevent="calculate">
              <div class="flex flex-col gap-3">
                <p class="text-sm font-semibold text-highlighted">
                  Course
                </p>
                <div class="grid grid-cols-2 gap-4">
                  <UFormField label="Durée (MM:SS)" :error="runDurationError">
                    <UInput
                      v-model="runDuration"
                      type="text"
                      inputmode="numeric"
                      placeholder="15:00"
                      size="md"
                      variant="outline"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Allure (MM:SS / km)" :error="runPaceError">
                    <UInput
                      v-model="runPaceTarget"
                      type="text"
                      inputmode="numeric"
                      placeholder="05:30"
                      size="md"
                      variant="outline"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>

              <div class="flex flex-col gap-3">
                <p class="text-sm font-semibold text-highlighted">
                  Marche
                </p>
                <div class="grid grid-cols-2 gap-4">
                  <UFormField label="Durée (MM:SS)" :error="walkDurationError">
                    <UInput
                      v-model="walkDuration"
                      type="text"
                      inputmode="numeric"
                      placeholder="00:00"
                      size="md"
                      variant="outline"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Allure (MM:SS / km)" :error="walkPaceError">
                    <UInput
                      v-model="walkPaceTarget"
                      type="text"
                      inputmode="numeric"
                      placeholder="10:00"
                      size="md"
                      variant="outline"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>

              <UFormField label="Kilométrage (km)" :error="targetDistanceError">
                <UInput
                  v-model="targetDistanceKm"
                  type="text"
                  inputmode="decimal"
                  placeholder="14,5"
                  size="md"
                  variant="outline"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Glucides (g/h)" :error="carbsRateError">
                <UInput
                  v-model="carbsPerHour"
                  type="text"
                  inputmode="decimal"
                  placeholder="50"
                  size="md"
                  variant="outline"
                  class="w-full"
                />
              </UFormField>

              <UButton
                type="submit"
                block
                color="primary"
                class="justify-center uppercase"
                :disabled="!canCalculate"
              >
                Calculer
              </UButton>
            </form>

            <Transition name="reveal" mode="out-in">
              <div v-if="hasCalculated" key="results" class="flex flex-col gap-4">
                <div class="flex flex-col gap-3">
                  <p class="text-xs text-muted uppercase tracking-wide">
                    Sur le cycle
                  </p>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                      <p class="text-xs text-muted uppercase tracking-wide">
                        Allure moyenne
                      </p>
                      <p class="text-2xl font-semibold text-highlighted">
                        {{ avgPaceLabel }}
                      </p>
                    </div>
                    <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                      <p class="text-xs text-muted uppercase tracking-wide">
                        Distance sur le cycle
                      </p>
                      <p class="text-2xl font-semibold text-highlighted">
                        {{ distanceLabel }}
                      </p>
                    </div>
                    <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                      <p class="text-xs text-muted uppercase tracking-wide">
                        Vitesse moyenne
                      </p>
                      <p class="text-2xl font-semibold text-highlighted">
                        {{ speedLabel }}
                      </p>
                    </div>
                  </div>
                </div>

                <div v-if="hasTargetResult" class="flex flex-col gap-3 border-t border-default pt-4">
                  <p class="text-xs text-muted uppercase tracking-wide">
                    Sur {{ targetDistanceLabel }} km
                  </p>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                      <p class="text-xs text-muted uppercase tracking-wide">
                        Temps
                      </p>
                      <p class="text-2xl font-semibold text-highlighted">
                        {{ targetDistanceTimeLabel }}
                      </p>
                    </div>
                    <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                      <p class="text-xs text-muted uppercase tracking-wide">
                        Glucides
                      </p>
                      <p class="text-2xl font-semibold text-highlighted">
                        {{ targetDistanceCarbsLabel }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <UEmpty
                v-else
                key="empty"
                icon="i-lucide-footprints"
                title="Aucun résultat pour l'instant"
                description="Renseignez au moins une durée de course ou de marche avec son allure, puis validez pour voir l'allure moyenne, la distance et la vitesse."
                class="h-full justify-center"
              />
            </Transition>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
