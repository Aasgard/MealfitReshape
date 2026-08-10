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
const hasCalculated = ref(false)

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

function resetResults() {
  bmrLabel.value = EMPTY_RESULT
  formulaLabel.value = EMPTY_RESULT
  tdeeLabel.value = EMPTY_RESULT
  targetCaloriesLabel.value = EMPTY_RESULT
  proteinLabel.value = EMPTY_RESULT
  fatLabel.value = EMPTY_RESULT
  carbsLabel.value = EMPTY_RESULT
}

function calculate() {
  hasCalculated.value = true

  const ageYears = parsePositiveNumber(age.value)
  const heightValue = parsePositiveNumber(heightCm.value)
  const weightValue = parsePositiveNumber(weightKg.value)

  if (ageYears === null || heightValue === null || weightValue === null) {
    resetResults()
    return
  }

  const bodyFat = bodyFatPercent.value.trim() ? parsePositiveNumber(bodyFatPercent.value) : null

  let bmr: number
  if (bodyFat !== null && bodyFat < 70) {
    // Katch-McArdle : plus précis quand la masse maigre est mesurée fiablement (DEXA, impédancemétrie de qualité).
    const leanMassKg = weightValue * (1 - bodyFat / 100)
    bmr = 370 + 21.6 * leanMassKg
    formulaLabel.value = 'Katch-McArdle'
  } else {
    // Mifflin-St Jeor : équation la mieux validée pour la population générale (Frankenfield et al., 2005).
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
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
