<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard - Calculateur de besoins journaliers - Mealfit',
  description: 'Dashboard - Calculateur de besoins journaliers - Mealfit',
})

const EMPTY_RESULT = '—'

const sexe = ref('Homme')
const age = ref('30')
const heightCm = ref('175')
const weightKg = ref('70')
const bodyFatPercent = ref('')
const activityLevel = ref('Modérément actif (exercice 3-5 j/semaine)')
const goal = ref('Maintien')

const sexeOptions = ['Homme', 'Femme']

const goalOptions = ['Perte de poids (-20 %)', 'Maintien', 'Prise de poids (+15 %)']

const activityOptions = [
  'Sédentaire (peu ou pas d\'exercice)',
  'Légèrement actif (exercice léger 1-3 j/semaine)',
  'Modérément actif (exercice 3-5 j/semaine)',
  'Très actif (exercice intense 6-7 j/semaine)',
  'Extrêmement actif (travail physique + sport)',
]

// Coefficients d'activité physique (PAL) — WHO/FAO/UNU (2004), validés par eau doublement marquée.
const activityPalMap: Record<string, number> = {
  'Sédentaire (peu ou pas d\'exercice)': 1.4,
  'Légèrement actif (exercice léger 1-3 j/semaine)': 1.6,
  'Modérément actif (exercice 3-5 j/semaine)': 1.8,
  'Très actif (exercice intense 6-7 j/semaine)': 2.0,
  'Extrêmement actif (travail physique + sport)': 2.4,
}

const goalFactorMap: Record<string, number> = {
  'Perte de poids (-20 %)': 0.8,
  'Maintien': 1,
  'Prise de poids (+15 %)': 1.15,
}

const bmrLabel = ref(EMPTY_RESULT)
const formulaLabel = ref(EMPTY_RESULT)
const tdeeLabel = ref(EMPTY_RESULT)
const targetCaloriesLabel = ref(EMPTY_RESULT)
const proteinLabel = ref(EMPTY_RESULT)
const fatLabel = ref(EMPTY_RESULT)
const carbsLabel = ref(EMPTY_RESULT)
const bodyFatUsedLabel = ref(EMPTY_RESULT)
const lastCalculatedGoal = ref<string | null>(null)

function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function formatKcal(value: number): string {
  if (!Number.isFinite(value)) return EMPTY_RESULT
  return `${Math.round(value)} kcal`
}

function formatGrams(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0 g'
  return `${Math.round(value)} g`
}

function formatKg(value: number): string {
  if (!Number.isFinite(value)) return EMPTY_RESULT
  return `${(Math.round(value * 10) / 10).toFixed(1).replace('.', ',')} kg`
}

function resetResults() {
  bmrLabel.value = EMPTY_RESULT
  formulaLabel.value = EMPTY_RESULT
  tdeeLabel.value = EMPTY_RESULT
  targetCaloriesLabel.value = EMPTY_RESULT
  proteinLabel.value = EMPTY_RESULT
  fatLabel.value = EMPTY_RESULT
  carbsLabel.value = EMPTY_RESULT
  bodyFatUsedLabel.value = EMPTY_RESULT
  lastCalculatedGoal.value = null
  fullWeeklySeries.value = []
  checkpointWeights.value = {}
  steadyStateWeightKg.value = null
}

// --- Projection dynamique (modèle simplifié inspiré de Hall & Thomas et al., 2011) ---
// Contrairement à la règle statique (±% du TDEE constant), la dépense énergétique est
// recalculée à chaque pas à partir du poids courant : la perte/prise ralentit naturellement
// à mesure que l'organisme s'adapte, jusqu'à un nouvel équilibre.
const FORBES_CONSTANT_KG = 10.4 // Forbes (1987) — partition de l'énergie entre masse grasse et masse maigre
const FAT_ENERGY_DENSITY_KCAL_PER_KG = 9400
const LEAN_ENERGY_DENSITY_KCAL_PER_KG = 1100
const CHECKPOINT_DAYS = [14, 30, 90, 180, 365]
const STEADY_STATE_DAYS = 1095 // ~3 ans, horizon retenu par Hall pour approcher le plateau

const projectionDurationLabel = ref('6 mois')
const projectionDurationOptions = ['3 mois', '6 mois', '12 mois']
const projectionDurationDaysMap: Record<string, number> = {
  '3 mois': 90,
  '6 mois': 180,
  '12 mois': 365,
}

const fullWeeklySeries = ref<{ day: number, weightKg: number }[]>([])
const checkpointWeights = ref<Record<number, number>>({})
const steadyStateWeightKg = ref<number | null>(null)

const chartPoints = computed(() => {
  const maxDay = projectionDurationDaysMap[projectionDurationLabel.value] ?? 180
  return fullWeeklySeries.value.filter(p => p.day <= maxDay)
})

const checkpointRows = computed(() => {
  const maxDay = projectionDurationDaysMap[projectionDurationLabel.value] ?? 180
  const dayLabels: Record<number, string> = {
    14: '2 semaines',
    30: '1 mois',
    90: '3 mois',
    180: '6 mois',
    365: '12 mois',
  }
  return CHECKPOINT_DAYS
    .filter(d => d <= maxDay && checkpointWeights.value[d] !== undefined)
    .map(d => ({ label: dayLabels[d], weightLabel: formatKg(checkpointWeights.value[d]!) }))
})

function estimateBodyFatPercent(sexeVal: string, ageYears: number, heightValue: number, weightValue: number): number {
  // Formule de Deurenberg et al. (1991) — estimation à partir de l'IMC, utilisée à défaut de mesure réelle.
  const heightM = heightValue / 100
  const bmi = weightValue / (heightM * heightM)
  const sexFactor = sexeVal === 'Homme' ? 1 : 0
  const bf = 1.2 * bmi + 0.23 * ageYears - 10.8 * sexFactor - 5.4
  return Math.min(60, Math.max(5, bf))
}

function bmrFromComposition(formula: string, sexeVal: string, ageYears: number, heightValue: number, weightValue: number, ffmKg: number): number {
  if (formula === 'Katch-McArdle') {
    return 370 + 21.6 * ffmKg
  }
  return sexeVal === 'Homme'
    ? 10 * weightValue + 6.25 * heightValue - 5 * ageYears + 5
    : 10 * weightValue + 6.25 * heightValue - 5 * ageYears - 161
}

function simulateTrajectory(params: {
  formula: string
  sexeVal: string
  ageYears: number
  heightValue: number
  initialFmKg: number
  initialFfmKg: number
  pal: number
  targetCalories: number
  days: number
}) {
  const weekly: { day: number, weightKg: number }[] = [{ day: 0, weightKg: params.initialFmKg + params.initialFfmKg }]
  const checkpoints: Record<number, number> = {}
  let fm = params.initialFmKg
  let ffm = params.initialFfmKg

  for (let day = 1; day <= params.days; day++) {
    const weight = fm + ffm
    const bmr = bmrFromComposition(params.formula, params.sexeVal, params.ageYears, params.heightValue, weight, ffm)
    const tdee = bmr * params.pal
    const imbalance = params.targetCalories - tdee
    const partitionToLean = FORBES_CONSTANT_KG / (FORBES_CONSTANT_KG + Math.max(fm, 0.1))

    fm = Math.max(0, fm + (imbalance * (1 - partitionToLean)) / FAT_ENERGY_DENSITY_KCAL_PER_KG)
    ffm = Math.max(0, ffm + (imbalance * partitionToLean) / LEAN_ENERGY_DENSITY_KCAL_PER_KG)

    if (day % 7 === 0) weekly.push({ day, weightKg: fm + ffm })
    if (CHECKPOINT_DAYS.includes(day)) checkpoints[day] = fm + ffm
  }

  return { weekly, checkpoints, finalWeightKg: fm + ffm }
}

function calculate() {
  const ageYears = parsePositiveNumber(age.value)
  const heightValue = parsePositiveNumber(heightCm.value)
  const weightValue = parsePositiveNumber(weightKg.value)

  if (ageYears === null || heightValue === null || weightValue === null) {
    resetResults()
    return
  }

  const measuredBodyFat = bodyFatPercent.value.trim() ? parsePositiveNumber(bodyFatPercent.value) : null
  const bodyFatIsMeasured = measuredBodyFat !== null && measuredBodyFat < 70
  const bodyFatPct = bodyFatIsMeasured ? measuredBodyFat! : estimateBodyFatPercent(sexe.value, ageYears, heightValue, weightValue)
  bodyFatUsedLabel.value = `${bodyFatPct.toFixed(1).replace('.', ',')} % ${bodyFatIsMeasured ? '(mesurée)' : '(estimée — formule de Deurenberg)'}`

  let bmr: number
  if (bodyFatIsMeasured) {
    const leanMassKg = weightValue * (1 - bodyFatPct / 100)
    bmr = 370 + 21.6 * leanMassKg
    formulaLabel.value = 'Katch-McArdle'
  } else {
    bmr = sexe.value === 'Homme'
      ? 10 * weightValue + 6.25 * heightValue - 5 * ageYears + 5
      : 10 * weightValue + 6.25 * heightValue - 5 * ageYears - 161
    formulaLabel.value = 'Mifflin-St Jeor'
  }

  const pal = activityPalMap[activityLevel.value] ?? 1.4
  const tdee = bmr * pal

  const goalFactor = goalFactorMap[goal.value] ?? 1
  const targetCalories = tdee * goalFactor

  // Répartition simple : protéines 1.8 g/kg (ISSN, 1.6-2.2 g/kg pour préserver la masse maigre), lipides 25 % des kcal, glucides le reste.
  const proteinGrams = 1.8 * weightValue
  const proteinKcal = proteinGrams * 4
  const fatKcal = targetCalories * 0.25
  const fatGrams = fatKcal / 9
  const carbsKcal = Math.max(0, targetCalories - proteinKcal - fatKcal)
  const carbsGrams = carbsKcal / 4

  bmrLabel.value = formatKcal(bmr)
  tdeeLabel.value = formatKcal(tdee)
  targetCaloriesLabel.value = formatKcal(targetCalories)
  proteinLabel.value = formatGrams(proteinGrams)
  fatLabel.value = formatGrams(fatGrams)
  carbsLabel.value = formatGrams(carbsGrams)

  lastCalculatedGoal.value = goal.value

  const initialFmKg = weightValue * (bodyFatPct / 100)
  const initialFfmKg = weightValue - initialFmKg

  const projection = simulateTrajectory({
    formula: formulaLabel.value,
    sexeVal: sexe.value,
    ageYears,
    heightValue,
    initialFmKg,
    initialFfmKg,
    pal,
    targetCalories,
    days: STEADY_STATE_DAYS,
  })

  fullWeeklySeries.value = projection.weekly
  checkpointWeights.value = projection.checkpoints
  steadyStateWeightKg.value = projection.finalWeightKg
}

// --- Rendu du graphique (SVG inline, sans dépendance externe) ---
const CHART_WIDTH = 640
const CHART_HEIGHT = 220
const CHART_PADDING = { top: 16, right: 16, bottom: 28, left: 44 }

const chartScale = computed(() => {
  const points = chartPoints.value
  if (points.length < 2) return null

  const maxDay = points[points.length - 1]!.day
  const weights = points.map(p => p.weightKg)
  const rawMin = Math.min(...weights)
  const rawMax = Math.max(...weights)
  const span = Math.max(rawMax - rawMin, 1)
  const yMin = Math.floor((rawMin - span * 0.15) * 2) / 2
  const yMax = Math.ceil((rawMax + span * 0.15) * 2) / 2

  const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom

  const x = (day: number) => CHART_PADDING.left + (day / maxDay) * innerWidth
  const y = (weight: number) => CHART_PADDING.top + innerHeight - ((weight - yMin) / (yMax - yMin)) * innerHeight

  return { x, y, yMin, yMax, maxDay }
})

const chartLinePath = computed(() => {
  const scale = chartScale.value
  if (!scale) return ''
  return chartPoints.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scale.x(p.day).toFixed(1)} ${scale.y(p.weightKg).toFixed(1)}`)
    .join(' ')
})

const chartAreaPath = computed(() => {
  const scale = chartScale.value
  if (!scale) return ''
  const baseline = CHART_HEIGHT - CHART_PADDING.bottom
  const first = chartPoints.value[0]!
  const last = chartPoints.value[chartPoints.value.length - 1]!
  return `${chartLinePath.value} L ${scale.x(last.day).toFixed(1)} ${baseline} L ${scale.x(first.day).toFixed(1)} ${baseline} Z`
})

const chartYTicks = computed(() => {
  const scale = chartScale.value
  if (!scale) return []
  const steps = 4
  return Array.from({ length: steps + 1 }, (_, i) => {
    const weight = scale.yMin + ((scale.yMax - scale.yMin) * i) / steps
    return { weight, y: scale.y(weight) }
  })
})

const chartXTicks = computed(() => {
  const scale = chartScale.value
  if (!scale) return []
  const monthCount = Math.round(scale.maxDay / 30)
  const stepMonths = monthCount > 6 ? 3 : monthCount > 3 ? 2 : 1
  const ticks = []
  for (let m = 0; m <= monthCount; m += stepMonths) {
    const day = m * 30
    ticks.push({ label: `M${m}`, x: scale.x(Math.min(day, scale.maxDay)) })
  }
  return ticks
})

const chartEndPoint = computed(() => {
  const scale = chartScale.value
  const points = chartPoints.value
  if (!scale || points.length === 0) return null
  const last = points[points.length - 1]!
  return { x: scale.x(last.day), y: scale.y(last.weightKg), weightKg: last.weightKg }
})

const hoverIndex = ref<number | null>(null)
const chartSvgRef = ref<SVGSVGElement | null>(null)

const hoverPoint = computed(() => {
  const scale = chartScale.value
  if (!scale || hoverIndex.value === null) return null
  const p = chartPoints.value[hoverIndex.value]
  if (!p) return null
  return { x: scale.x(p.day), y: scale.y(p.weightKg), day: p.day, weightKg: p.weightKg }
})

function dayToLabel(day: number): string {
  if (day === 0) return 'Départ'
  if (day % 30 === 0) return `Mois ${day / 30}`
  return `Semaine ${Math.round(day / 7)}`
}

function handleChartPointerMove(event: PointerEvent) {
  const scale = chartScale.value
  const svg = chartSvgRef.value
  const points = chartPoints.value
  if (!scale || !svg || points.length === 0) return

  const rect = svg.getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  const svgX = ratio * CHART_WIDTH

  let closestIndex = 0
  let closestDistance = Infinity
  points.forEach((p, i) => {
    const distance = Math.abs(scale.x(p.day) - svgX)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = i
    }
  })
  hoverIndex.value = closestIndex
}

function handleChartPointerLeave() {
  hoverIndex.value = null
}
</script>

<template>
  <UDashboardPanel
    id="besoins-journaliers"
    :ui="{ body: 'min-h-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Calculateur de besoins journaliers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col p-4 sm:p-6 overflow-auto">
        <div class="w-full flex flex-col gap-6 text-default">
          <p class="text-sm text-muted max-w-2xl">
            Métabolisme de base estimé via Mifflin-St Jeor (ou Katch-McArdle si un % de masse grasse mesuré est renseigné),
            multiplié par un facteur d'activité PAL (WHO/FAO/UNU, 2004). POC à affiner.
          </p>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div class="flex flex-col gap-6">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm text-muted">Sexe</span>
                  <USelectMenu
                    v-model="sexe"
                    :items="sexeOptions"
                    :search-input="false"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm text-muted">Âge (années)</span>
                  <UInput
                    v-model="age"
                    type="text"
                    inputmode="numeric"
                    placeholder="30"
                    size="md"
                    variant="outline"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm text-muted">Taille (cm)</span>
                  <UInput
                    v-model="heightCm"
                    type="text"
                    inputmode="decimal"
                    placeholder="175"
                    size="md"
                    variant="outline"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm text-muted">Poids (kg)</span>
                  <UInput
                    v-model="weightKg"
                    type="text"
                    inputmode="decimal"
                    placeholder="70"
                    size="md"
                    variant="outline"
                  />
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted">% masse grasse mesuré (optionnel — active Katch-McArdle)</span>
                <UInput
                  v-model="bodyFatPercent"
                  type="text"
                  inputmode="decimal"
                  placeholder="ex : 18"
                  size="md"
                  variant="outline"
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted">Niveau d'activité</span>
                <USelectMenu
                  v-model="activityLevel"
                  :items="activityOptions"
                  :search-input="false"
                  class="w-full"
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted">Objectif</span>
                <USelectMenu
                  v-model="goal"
                  :items="goalOptions"
                  :search-input="false"
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
                  Métabolisme de base
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ bmrLabel }}
                </p>
                <p class="text-xs text-muted">
                  {{ formulaLabel }}
                </p>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                <p class="text-xs text-muted uppercase tracking-wide">
                  Maintien (TDEE)
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ tdeeLabel }}
                </p>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1 col-span-2">
                <p class="text-xs text-muted uppercase tracking-wide">
                  Objectif calorique
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ targetCaloriesLabel }}
                </p>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                <p class="text-xs text-muted uppercase tracking-wide">
                  Protéines
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ proteinLabel }}
                </p>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1">
                <p class="text-xs text-muted uppercase tracking-wide">
                  Lipides
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ fatLabel }}
                </p>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-4 flex flex-col gap-1 col-span-2">
                <p class="text-xs text-muted uppercase tracking-wide">
                  Glucides
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ carbsLabel }}
                </p>
              </div>
            </div>
          </div>

          <div v-if="chartPoints.length > 1 && lastCalculatedGoal !== 'Maintien'" class="flex flex-col gap-4 border-t border-default pt-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-col gap-1">
                <p class="text-sm font-semibold text-highlighted">
                  Projection de poids — modèle dynamique
                </p>
                <p class="text-xs text-muted">
                  Composition corporelle utilisée : {{ bodyFatUsedLabel }}
                </p>
              </div>
              <USelectMenu
                v-model="projectionDurationLabel"
                :items="projectionDurationOptions"
                :search-input="false"
                class="w-36"
              />
            </div>

            <div class="rounded-lg border border-default bg-elevated p-4">
              <svg
                ref="chartSvgRef"
                :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
                class="w-full h-auto touch-none"
                role="img"
                aria-label="Courbe de projection du poids dans le temps"
                @pointermove="handleChartPointerMove"
                @pointerleave="handleChartPointerLeave"
              >
                <line
                  v-for="tick in chartYTicks"
                  :key="`grid-${tick.weight}`"
                  :x1="CHART_PADDING.left"
                  :x2="CHART_WIDTH - CHART_PADDING.right"
                  :y1="tick.y"
                  :y2="tick.y"
                  stroke="var(--ui-border)"
                  stroke-width="1"
                />

                <text
                  v-for="tick in chartYTicks"
                  :key="`ylabel-${tick.weight}`"
                  :x="CHART_PADDING.left - 8"
                  :y="tick.y + 3"
                  text-anchor="end"
                  font-size="10"
                  fill="var(--ui-text-muted)"
                >{{ tick.weight.toFixed(1).replace('.', ',') }}</text>

                <text
                  v-for="tick in chartXTicks"
                  :key="`xlabel-${tick.label}`"
                  :x="tick.x"
                  :y="CHART_HEIGHT - 8"
                  text-anchor="middle"
                  font-size="10"
                  fill="var(--ui-text-muted)"
                >{{ tick.label }}</text>

                <path
                  :d="chartAreaPath"
                  fill="var(--ui-primary)"
                  fill-opacity="0.1"
                  stroke="none"
                />
                <path
                  :d="chartLinePath"
                  fill="none"
                  stroke="var(--ui-primary)"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />

                <g v-if="chartEndPoint">
                  <circle
                    :cx="chartEndPoint.x"
                    :cy="chartEndPoint.y"
                    r="5"
                    fill="var(--ui-primary)"
                    stroke="var(--ui-bg)"
                    stroke-width="2"
                  />
                  <text
                    :x="chartEndPoint.x - 8"
                    :y="chartEndPoint.y - 10"
                    text-anchor="end"
                    font-size="11"
                    font-weight="600"
                    fill="var(--ui-text-highlighted)"
                  >{{ formatKg(chartEndPoint.weightKg) }}</text>
                </g>

                <g v-if="hoverPoint">
                  <line
                    :x1="hoverPoint.x"
                    :x2="hoverPoint.x"
                    :y1="CHART_PADDING.top"
                    :y2="CHART_HEIGHT - CHART_PADDING.bottom"
                    stroke="var(--ui-border)"
                    stroke-width="1"
                  />
                  <circle
                    :cx="hoverPoint.x"
                    :cy="hoverPoint.y"
                    r="4"
                    fill="var(--ui-primary)"
                    stroke="var(--ui-bg)"
                    stroke-width="2"
                  />
                  <g :transform="`translate(${Math.min(hoverPoint.x + 10, CHART_WIDTH - 110)}, ${CHART_PADDING.top + 4})`">
                    <rect
                      width="100"
                      height="34"
                      rx="4"
                      fill="var(--ui-bg)"
                      stroke="var(--ui-border)"
                      stroke-width="1"
                    />
                    <text x="8" y="14" font-size="10" fill="var(--ui-text-muted)">{{ dayToLabel(hoverPoint.day) }}</text>
                    <text x="8" y="27" font-size="12" font-weight="600" fill="var(--ui-text-highlighted)">{{ formatKg(hoverPoint.weightKg) }}</text>
                  </g>
                </g>
              </svg>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div
                v-for="row in checkpointRows"
                :key="row.label"
                class="rounded-lg border border-default bg-elevated p-3 flex flex-col gap-1"
              >
                <p class="text-xs text-muted">
                  {{ row.label }}
                </p>
                <p class="text-lg font-semibold text-highlighted">
                  {{ row.weightLabel }}
                </p>
              </div>
              <div class="rounded-lg border border-default bg-elevated p-3 flex flex-col gap-1">
                <p class="text-xs text-muted">
                  Équilibre (~3 ans)
                </p>
                <p class="text-lg font-semibold text-highlighted">
                  {{ steadyStateWeightKg !== null ? formatKg(steadyStateWeightKg) : EMPTY_RESULT }}
                </p>
              </div>
            </div>

            <p class="text-xs text-muted max-w-2xl">
              Modèle simplifié inspiré de Hall (2011) et Thomas et al. (2011) : la dépense énergétique est recalculée
              à chaque jour à partir du poids courant (partition masse grasse / masse maigre via la constante de Forbes,
              densités énergétiques constantes), niveau d'activité PAL supposé constant. Approximation à but illustratif,
              ne remplace pas un avis médical ou une mesure réelle.
            </p>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
