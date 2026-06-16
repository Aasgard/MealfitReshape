<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard - Calculateur d\'allure - Mealfit',
  description: 'Dashboard - Calculateur d\'allure - Mealfit',
})

const runDuration = ref('15:00')
const walkDuration = ref('00:00')
const runPaceTarget = ref('06:30')
const walkPaceTarget = ref('12:00')
const targetDistanceKm = ref('1')

const avgPaceLabel = ref('0\'00/km')
const distanceLabel = ref('0 m')
const speedLabel = ref('0 km/h')
const targetDistanceTimeLabel = ref('')
const targetDistanceLabel = ref('')
const hasCalculated = ref(false)
const hasTargetDistanceResult = ref(false)

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

function resetResults() {
  avgPaceLabel.value = '0\'00/km'
  distanceLabel.value = '0 m'
  speedLabel.value = '0 km/h'
  targetDistanceTimeLabel.value = ''
  targetDistanceLabel.value = ''
  hasTargetDistanceResult.value = false
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
    hasTargetDistanceResult.value = true
  } else {
    targetDistanceTimeLabel.value = ''
    targetDistanceLabel.value = ''
    hasTargetDistanceResult.value = false
  }
}
</script>

<template>
  <UDashboardPanel
    id="calculateur-allure"
    :ui="{ body: 'min-h-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Calculateur d'allure">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col items-center p-4 sm:p-6 overflow-auto">
        <div class="w-full max-w-md flex flex-col gap-8 text-default">
          <p class="text-sm text-muted">
            Durées et allures cibles au format MM:SS (ex. 05:30 pour 5 min 30 s).
            Kilométrage avec virgule (ex. 14,5 pour 14 km 500).
          </p>

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

          <UButton
            block
            color="primary"
            class="justify-center uppercase"
            @click="calculate"
          >
            Calculer
          </UButton>

          <div
            v-if="hasCalculated"
            class="flex flex-col items-center gap-6 text-center"
          >
            <div class="flex flex-col gap-1">
              <p class="text-sm font-semibold text-highlighted">
                Allure moyenne de l'alternance :
              </p>
              <p class="text-base text-default">
                {{ avgPaceLabel }}
              </p>
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-sm font-semibold text-highlighted">
                Distance parcourue sur le cycle :
              </p>
              <p class="text-base text-default">
                {{ distanceLabel }}
              </p>
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-sm font-semibold text-highlighted">
                Vitesse moyenne :
              </p>
              <p class="text-base text-default">
                {{ speedLabel }}
              </p>
            </div>
            <div
              v-if="hasTargetDistanceResult"
              class="flex flex-col gap-1"
            >
              <p class="text-sm font-semibold text-highlighted">
                Temps pour {{ targetDistanceLabel }} km :
              </p>
              <p class="text-base text-default">
                {{ targetDistanceTimeLabel }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
