<script setup lang="ts">
import { parsePositiveNumber, formatGrams } from '~/utils/numberInput'
import type { DailyTargets } from '~/utils/dailyTargets'
import type { GoalDirection, ProteinBasis } from '~/utils/profile'
import type { BodySex } from '~/utils/weightProjection'

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
const goalDirection = ref<GoalDirection>('maintain')
/** Déficit (perte) ou surplus (prise) en % de la dépense, même liste que l'objectif du profil. */
const goalPercent = ref(GOAL_DEFAULT_CALORIE_PERCENT.loss)
const goalPercentError = ref<string>()
/** Protéines en g par kg de poids de corps, mêmes niveaux que l'objectif du profil. */
const proteinPerKg = ref(DEFAULT_PROTEIN_PER_KG)
const proteinBasis = ref<ProteinBasis>('current')
const targetWeightKg = ref('')

// --- Lien avec le profil : préremplissage à l'ouverture, « Définir comme objectif » après le calcul ---
const profile = useProfile()
const toast = useToast()
const prefilledFromProfile = ref(false)

// Préremplit avec la fiche enregistrée dans Firestore quand elle existe.
await profile.ready
if (profile.isBodyComplete) {
  sexe.value = profile.body.sex
  age.value = String(profile.age)
  heightCm.value = formatNumber(profile.body.heightCm!, 1)
  weightKg.value = formatNumber(profile.currentWeightKg!, 1)
  bodyFatPercent.value = profile.body.bodyFatPercent ? formatNumber(profile.body.bodyFatPercent, 1) : ''
  activityLevel.value = profile.body.activity
  targetWeightKg.value = profile.goal.targetWeightKg ? formatNumber(profile.goal.targetWeightKg, 1) : ''
  goalDirection.value = profile.goal.direction
  goalPercent.value = profile.goal.calorieDeltaPercent
  proteinPerKg.value = profile.goal.proteinPerKg
  proteinBasis.value = profile.goal.proteinBasis === 'target' && profile.goal.targetWeightKg !== null ? 'target' : 'current'
  prefilledFromProfile.value = true
}

// Un pourcentage qui n'est pas proposé dans le nouveau sens reprend celui par défaut (comme dans le profil).
watch(goalDirection, (direction) => {
  goalPercentError.value = undefined
  if (direction !== 'maintain') goalPercent.value = percentForDirection(direction, goalPercent.value)
})

/** Résultat chiffré du dernier calcul, repris tel quel par « Définir comme objectif ». */
const lastResult = ref<DailyTargets | null>(null)
const confirmTargetOpen = ref(false)

const targetDiffRows = computed(() => {
  const next = lastResult.value
  if (!next) return []
  const current = profile.targets
  return [
    { label: 'Énergie', unit: 'kcal', current: current?.calories ?? null, next: Math.round(next.calories) },
    { label: 'Glucides', unit: 'g', current: current?.carbohydrates ?? null, next: Math.round(next.carbohydrates) },
    { label: 'Protéines', unit: 'g', current: current?.protein ?? null, next: Math.round(next.protein) },
    { label: 'Lipides', unit: 'g', current: current?.fat ?? null, next: Math.round(next.fat) },
  ]
})

function applyAsTarget() {
  const calculated = lastCalculatedGoal.value
  if (!lastResult.value || !calculated) return
  const before = { direction: profile.goal.direction, targetWeightKg: profile.goal.targetWeightKg }
  profile.setGoalDirection(calculated.direction)
  // Même pourcentage de la dépense : le profil projette alors la même courbe que ce calculateur.
  if (calculated.direction !== 'maintain') profile.goal.calorieDeltaPercent = calculated.percent
  profile.goal.proteinPerKg = calculated.proteinPerKg
  profile.goal.proteinBasis = calculated.proteinBasis
  if (usesTargetWeight.value && targetWeightValue.value !== null) profile.goal.targetWeightKg = targetWeightValue.value
  // Nouveau sens ou nouveau poids visé : l'objectif repart d'aujourd'hui (voir `saveGoal`).
  const restart = profile.goal.direction !== before.direction || profile.goal.targetWeightKg !== before.targetWeightKg
  // Besoins et objectif en une seule écriture : ils gardent la même date (voir `setTargets`).
  profile.setTargets(lastResult.value, 'calculator', { goal: { restart } }).catch((error: any) => {
    toast.add({
      title: 'Erreur',
      description: `L'objectif n'a pas pu être enregistré : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  })
  confirmTargetOpen.value = false
  toast.add({
    title: 'Objectif mis à jour',
    description: `${formatNumber(lastResult.value.calories)} kcal par jour enregistrées dans votre profil.`,
    color: 'success',
    icon: 'i-lucide-check',
    actions: [{ label: 'Voir le profil', color: 'neutral', variant: 'outline', onClick: () => { navigateTo('/dashboard/profil') } }],
  })
}

const sexeOptions = ['Homme', 'Femme']

// Mêmes sens que l'objectif du profil.
const goalDirectionOptions = GOAL_DIRECTIONS.map(direction => ({ label: direction.label, value: direction.value, icon: direction.icon }))

// Mêmes niveaux (et coefficients) que la fiche corporelle du profil.
const activityOptions = ACTIVITY_LEVELS.map(level => level.label)

const bmrLabel = ref(EMPTY_RESULT)
const formulaLabel = ref(EMPTY_RESULT)
const tdeeLabel = ref(EMPTY_RESULT)
const targetCaloriesLabel = ref(EMPTY_RESULT)
const proteinLabel = ref(EMPTY_RESULT)
const proteinDetailLabel = ref(EMPTY_RESULT)
const fatLabel = ref(EMPTY_RESULT)
const carbsLabel = ref(EMPTY_RESULT)
const bodyFatUsedLabel = ref(EMPTY_RESULT)
/** Objectif et protéines du dernier calcul, repris par « Définir comme objectif ». */
const lastCalculatedGoal = ref<{ direction: GoalDirection, percent: number, proteinPerKg: number, proteinBasis: ProteinBasis } | null>(null)

function formatKcal(value: number): string {
  if (!Number.isFinite(value)) return EMPTY_RESULT
  return `${Math.round(value)} kcal`
}

function formatKg(value: number): string {
  if (!Number.isFinite(value)) return EMPTY_RESULT
  return `${(Math.round(value * 10) / 10).toFixed(1).replace('.', ',')} kg`
}

const ageValue = computed(() => parsePositiveNumber(age.value))
const heightValue = computed(() => parsePositiveNumber(heightCm.value))
const weightValue = computed(() => parsePositiveNumber(weightKg.value))
const usesTargetWeight = computed(() => proteinBasis.value === 'target')
const targetWeightValue = computed(() => parsePositiveNumber(targetWeightKg.value))
const bodyFatValue = computed(() => (bodyFatPercent.value.trim() ? parsePositiveNumber(bodyFatPercent.value) : null))

function requiredNumberError(value: string, parsed: number | null) {
  if (!value.trim()) return 'Requis'
  return parsed === null ? 'Entrez un nombre valide' : undefined
}

const ageError = computed(() => requiredNumberError(age.value, ageValue.value))
const heightError = computed(() => requiredNumberError(heightCm.value, heightValue.value))
const weightError = computed(() => requiredNumberError(weightKg.value, weightValue.value))
const targetWeightError = computed(() =>
  usesTargetWeight.value ? requiredNumberError(targetWeightKg.value, targetWeightValue.value) : undefined
)
const bodyFatError = computed(() => {
  if (!bodyFatPercent.value.trim()) return undefined
  if (bodyFatValue.value === null) return 'Entrez un nombre valide'
  if (bodyFatValue.value >= 70) return 'Doit être inférieur à 70 % — estimation utilisée à la place'
  return undefined
})

const canCalculate = computed(() =>
  ageValue.value !== null && heightValue.value !== null && weightValue.value !== null
  && (!usesTargetWeight.value || targetWeightValue.value !== null)
  && !goalPercentError.value,
)

const hasCalculated = computed(() => lastCalculatedGoal.value !== null)

function resetResults() {
  bmrLabel.value = EMPTY_RESULT
  formulaLabel.value = EMPTY_RESULT
  tdeeLabel.value = EMPTY_RESULT
  targetCaloriesLabel.value = EMPTY_RESULT
  proteinLabel.value = EMPTY_RESULT
  proteinDetailLabel.value = EMPTY_RESULT
  fatLabel.value = EMPTY_RESULT
  carbsLabel.value = EMPTY_RESULT
  bodyFatUsedLabel.value = EMPTY_RESULT
  lastCalculatedGoal.value = null
  lastResult.value = null
  fullWeeklySeries.value = []
  checkpointWeights.value = {}
  steadyStateWeightKg.value = null
}

// --- Projection dynamique (modèle partagé avec l'objectif du profil, voir utils/weightProjection) ---
// Contrairement à la règle statique (±% du TDEE constant), la dépense énergétique est
// recalculée à chaque pas à partir du poids courant : la perte/prise ralentit naturellement
// à mesure que l'organisme s'adapte, jusqu'à un nouvel équilibre.
const CHECKPOINT_DAYS = [14, 30, 90, 180, 365]

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

function calculate() {
  const ageYears = ageValue.value
  const height = heightValue.value
  const weight = weightValue.value

  const proteinWeight = usesTargetWeight.value ? targetWeightValue.value : weight
  if (ageYears === null || height === null || weight === null || proteinWeight === null) {
    resetResults()
    return
  }

  const model = resolveBodyModel({
    sex: sexe.value as BodySex,
    ageYears,
    heightCm: height,
    weightKg: weight,
    measuredBodyFatPercent: bodyFatValue.value,
    pal: activityPal(activityLevel.value),
  })
  bodyFatUsedLabel.value = `${model.bodyFatPercent.toFixed(1).replace('.', ',')} % ${model.bodyFatMeasured ? '(mesurée)' : '(estimée — formule de Deurenberg)'}`
  formulaLabel.value = model.formula

  const bmr = basalMetabolicRateAtStart(model)
  const tdee = totalEnergyExpenditure(model)

  const calculatedGoal = { direction: goalDirection.value, percent: goalPercent.value, proteinPerKg: proteinPerKg.value, proteinBasis: proteinBasis.value }
  const targetCalories = goalCalories(tdee, { direction: calculatedGoal.direction, calorieDeltaPercent: calculatedGoal.percent })

  // Même répartition que l'objectif du profil (voir splitMacros).
  const result = splitMacros(targetCalories, calculatedGoal.proteinPerKg * proteinWeight)

  bmrLabel.value = formatKcal(bmr)
  tdeeLabel.value = formatKcal(tdee)
  targetCaloriesLabel.value = formatKcal(targetCalories)
  proteinLabel.value = formatGrams(result.protein)
  proteinDetailLabel.value = `${formatProteinPerKg(calculatedGoal.proteinPerKg)} × ${proteinWeight.toLocaleString('fr-FR')} kg (${PROTEIN_BASES.find(basis => basis.value === proteinBasis.value)!.label.toLowerCase()})`
  fatLabel.value = formatGrams(result.fat)
  carbsLabel.value = formatGrams(result.carbohydrates)

  lastCalculatedGoal.value = calculatedGoal
  lastResult.value = result

  const weights = simulateWeight(model, targetCalories)
  fullWeeklySeries.value = weights.flatMap((weightKg, day) => (day % 7 === 0 ? [{ day, weightKg }] : []))
  checkpointWeights.value = Object.fromEntries(CHECKPOINT_DAYS.map(day => [day, weights[day]!]))
  steadyStateWeightKg.value = weights.at(-1)!
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
            multiplié par un facteur d'activité (1,2 à 1,9). POC à affiner.
          </p>
          <p v-if="prefilledFromProfile" class="-mt-3 flex items-center gap-1.5 text-xs text-dimmed">
            <UIcon name="i-lucide-user" class="size-3.5 shrink-0" />
            Prérempli depuis votre
            <ULink to="/dashboard/profil" class="text-muted underline underline-offset-2 hover:text-highlighted">profil</ULink>.
          </p>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <form class="flex flex-col gap-6" @submit.prevent="calculate">
              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Sexe">
                  <USelectMenu
                    v-model="sexe"
                    :items="sexeOptions"
                    :search-input="false"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Âge (années)" :error="ageError">
                  <UInput
                    v-model="age"
                    type="text"
                    inputmode="numeric"
                    placeholder="30"
                    size="md"
                    variant="outline"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Taille (cm)" :error="heightError">
                  <UInput
                    v-model="heightCm"
                    type="text"
                    inputmode="decimal"
                    placeholder="175"
                    size="md"
                    variant="outline"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Poids (kg)" :error="weightError">
                  <UInput
                    v-model="weightKg"
                    type="text"
                    inputmode="decimal"
                    placeholder="70"
                    size="md"
                    variant="outline"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <UFormField label="% masse grasse mesuré (optionnel — active Katch-McArdle)" :error="bodyFatError">
                <UInput
                  v-model="bodyFatPercent"
                  type="text"
                  inputmode="decimal"
                  placeholder="ex : 18"
                  size="md"
                  variant="outline"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Niveau d'activité">
                <USelectMenu
                  v-model="activityLevel"
                  :items="activityOptions"
                  :search-input="false"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Objectif">
                <USelectMenu
                  v-model="goalDirection"
                  :items="goalDirectionOptions"
                  value-key="value"
                  :search-input="false"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                v-if="goalDirection !== 'maintain'"
                :label="goalDirection === 'loss' ? 'Déficit calorique (% de la dépense)' : 'Surplus calorique (% de la dépense)'"
                :error="goalPercentError"
              >
                <CaloriePercentPicker
                  v-model="goalPercent"
                  v-model:error="goalPercentError"
                  :direction="goalDirection"
                  size="md"
                />
              </UFormField>

              <UFormField label="Apport en protéines">
                <USelectMenu
                  v-model="proteinPerKg"
                  :items="PROTEIN_LEVEL_ITEMS"
                  value-key="value"
                  :search-input="false"
                  class="w-full"
                />
              </UFormField>

              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Protéines calculées sur">
                  <USelectMenu
                    v-model="proteinBasis"
                    :items="PROTEIN_BASES"
                    value-key="value"
                    :search-input="false"
                    class="w-full"
                  />
                </UFormField>
                <UFormField v-if="usesTargetWeight" label="Poids visé (kg)" :error="targetWeightError">
                  <UInput
                    v-model="targetWeightKg"
                    type="text"
                    inputmode="decimal"
                    placeholder="65"
                    size="md"
                    variant="outline"
                    class="w-full"
                  />
                </UFormField>
              </div>

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
              <div v-if="hasCalculated" key="results" class="grid grid-cols-2 gap-4">
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
                  <p class="text-xs text-muted">
                    {{ proteinDetailLabel }}
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
                <div class="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
                  <p class="text-xs text-muted text-pretty">
                    Reprenez ces valeurs comme besoins du jour de votre profil.
                  </p>
                  <UButton
                    label="Définir comme objectif"
                    icon="i-lucide-target"
                    color="neutral"
                    variant="outline"
                    @click="confirmTargetOpen = true"
                  />
                </div>
              </div>

              <UEmpty
                v-else
                key="empty"
                icon="i-lucide-calculator"
                title="Aucun résultat pour l'instant"
                description="Renseignez au moins l'âge, la taille et le poids, puis validez pour voir le métabolisme de base, le maintien et la répartition calorique."
                class="h-full justify-center"
              />
            </Transition>
          </div>

          <div v-if="chartPoints.length > 1 && lastCalculatedGoal?.direction !== 'maintain'" class="flex flex-col gap-4 border-t border-default pt-6">
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
                  font-size="9"
                  fill="var(--ui-text-muted)"
                >{{ tick.weight.toFixed(1).replace('.', ',') }}</text>

                <text
                  v-for="tick in chartXTicks"
                  :key="`xlabel-${tick.label}`"
                  :x="tick.x"
                  :y="CHART_HEIGHT - 8"
                  text-anchor="middle"
                  font-size="9"
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
                    font-size="10"
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
                    <text x="8" y="14" font-size="9" fill="var(--ui-text-muted)">{{ dayToLabel(hoverPoint.day) }}</text>
                    <text x="8" y="27" font-size="11" font-weight="600" fill="var(--ui-text-highlighted)">{{ formatKg(hoverPoint.weightKg) }}</text>
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
              densités énergétiques constantes), niveau d'activité supposé constant. Approximation à but illustratif,
              ne remplace pas un avis médical ou une mesure réelle.
            </p>
          </div>
        </div>
      </div>

      <UModal
        v-model:open="confirmTargetOpen"
        title="Définir comme objectif ?"
        description="Ces valeurs remplacent les besoins du jour de votre profil."
        :ui="{ footer: 'justify-end' }"
      >
        <template #body>
          <div class="overflow-hidden rounded-lg border border-default">
            <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-x-3 border-b border-default px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
              <span />
              <span class="text-end">Actuel</span>
              <span class="text-end">Nouveau</span>
            </div>
            <div
              v-for="row in targetDiffRows"
              :key="row.label"
              class="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-baseline gap-x-3 border-b border-default px-4 py-2.5 text-sm last:border-b-0"
            >
              <span class="text-highlighted">{{ row.label }}</span>
              <span class="text-end tabular-nums text-dimmed">
                {{ row.current === null ? '—' : `${formatNumber(row.current)} ${row.unit}` }}
              </span>
              <span class="text-end font-semibold tabular-nums text-highlighted">
                {{ formatNumber(row.next) }} <span class="font-normal text-muted">{{ row.unit }}</span>
              </span>
            </div>
          </div>
        </template>
        <template #footer>
          <UButton label="Annuler" color="neutral" variant="ghost" @click="confirmTargetOpen = false" />
          <UButton label="Définir comme objectif" icon="i-lucide-target" @click="applyAsTarget" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
