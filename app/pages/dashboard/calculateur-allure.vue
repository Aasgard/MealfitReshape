<script setup lang="ts">
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
const hasCalculated = ref(false)

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

function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function formatGrams(grams: number): string {
  if (!Number.isFinite(grams) || grams < 0) return '0 g'
  const rounded = Math.round(grams)
  return `${rounded} g`
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

function resetResults() {
  avgPaceLabel.value = EMPTY_RESULT
  distanceLabel.value = EMPTY_RESULT
  speedLabel.value = EMPTY_RESULT
  targetDistanceTimeLabel.value = EMPTY_RESULT
  targetDistanceCarbsLabel.value = EMPTY_RESULT
}

function calculate() {
  hasCalculated.value = true

  const runSec = parseMmSs(runDuration.value)
  const walkSec = parseMmSs(walkDuration.value)
  const runPaceSec = parseMmSs(runPaceTarget.value)
  const walkPaceSec = parseMmSs(walkPaceTarget.value)

  if (runSec === null || walkSec === null) {
    resetResults()
    return
  }

  const cycleSec = runSec + walkSec
  if (cycleSec <= 0) {
    resetResults()
    return
  }

  let distanceKm = 0

  if (runSec > 0) {
    if (runPaceSec === null || runPaceSec <= 0) {
      resetResults()
      return
    }
    distanceKm += runSec / runPaceSec
  }

  if (walkSec > 0) {
    if (walkPaceSec === null || walkPaceSec <= 0) {
      resetResults()
      return
    }
    distanceKm += walkSec / walkPaceSec
  }

  if (distanceKm <= 0) {
    resetResults()
    return
  }

  avgPaceLabel.value = formatPace(cycleSec, distanceKm)
  distanceLabel.value = formatDistance(distanceKm * 1000)
  speedLabel.value = formatSpeed((distanceKm / cycleSec) * 3600)

  const targetKm = parseKmInput(targetDistanceKm.value)
  if (targetKm !== null) {
    const timeSec = targetKm * (cycleSec / distanceKm)
    targetDistanceTimeLabel.value = formatDuration(timeSec)
    targetDistanceLabel.value = formatKmFrench(targetKm)

    const carbsRate = parsePositiveNumber(carbsPerHour.value)
    if (carbsRate !== null) {
      const carbsGrams = carbsRate * (timeSec / 3600)
      targetDistanceCarbsLabel.value = formatGrams(carbsGrams)
    } else {
      targetDistanceCarbsLabel.value = EMPTY_RESULT
    }
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
            <div class="flex flex-col gap-6">
              <div class="flex flex-col gap-3">
                <p class="text-sm font-semibold text-highlighted">
                  Course
                </p>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm text-muted">Durée (MM:SS)</span>
                    <UInput
                      v-model="runDuration"
                      type="text"
                      inputmode="numeric"
                      placeholder="15:00"
                      size="md"
                      variant="outline"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm text-muted">Allure (MM:SS / km)</span>
                    <UInput
                      v-model="runPaceTarget"
                      type="text"
                      inputmode="numeric"
                      placeholder="05:30"
                      size="md"
                      variant="outline"
                    />
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-3">
                <p class="text-sm font-semibold text-highlighted">
                  Marche
                </p>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm text-muted">Durée (MM:SS)</span>
                    <UInput
                      v-model="walkDuration"
                      type="text"
                      inputmode="numeric"
                      placeholder="00:00"
                      size="md"
                      variant="outline"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm text-muted">Allure (MM:SS / km)</span>
                    <UInput
                      v-model="walkPaceTarget"
                      type="text"
                      inputmode="numeric"
                      placeholder="10:00"
                      size="md"
                      variant="outline"
                    />
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-highlighted">Kilométrage (km)</span>
                <UInput
                  v-model="targetDistanceKm"
                  type="text"
                  inputmode="decimal"
                  placeholder="14,5"
                  size="md"
                  variant="outline"
                  class="w-full"
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-highlighted">Glucides (g/h)</span>
                <UInput
                  v-model="carbsPerHour"
                  type="text"
                  inputmode="decimal"
                  placeholder="50"
                  size="md"
                  variant="outline"
                  class="w-full"
                />
              </div>

              <UButton
                block
                color="primary"
                class="justify-center uppercase"
                @click="calculate"
              >
                Calculer
              </UButton>
            </div>

            <div class="grid grid-cols-2 gap-4">
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
              <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                <p class="text-xs text-muted uppercase tracking-wide">
                  Temps pour {{ targetDistanceLabel }} km
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ targetDistanceTimeLabel }}
                </p>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                <p class="text-xs text-muted uppercase tracking-wide">
                  Glucides pour {{ targetDistanceLabel }} km
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ targetDistanceCarbsLabel }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
