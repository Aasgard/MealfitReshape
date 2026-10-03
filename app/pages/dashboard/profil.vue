<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { parseDate, type DateValue } from '@internationalized/date'
import { differenceInCalendarWeeks, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useCurrentUser } from 'vuefire'
import { parsePositiveNumber } from '~/utils/numberInput'
import type { GoalDirection, ProfileScenario, Sex } from '~/utils/profile'

useSeoMeta({
  title: 'Dashboard - Profil - Mealfit',
  description: 'Dashboard - Profil - Mealfit',
})

const profile = useProfile()
const currentUser = useCurrentUser()

const displayName = computed(() => currentUser.value?.displayName || currentUser.value?.email || 'Vous')
const email = computed(() => (currentUser.value?.displayName ? currentUser.value?.email : null))

// --- Données d'exemple ---

const scenarioItems = computed<DropdownMenuItem[]>(() => [
  [{ type: 'label', label: 'Aperçu avec des données fictives' }],
  (Object.keys(PROFILE_SCENARIO_LABELS) as ProfileScenario[]).map(value => ({
    label: PROFILE_SCENARIO_LABELS[value],
    type: 'checkbox' as const,
    checked: profile.scenario === value,
    onSelect: () => {
      profile.loadScenario(value)
      syncDrafts()
    },
  })),
])

// --- Enregistrement automatique : un tampon par section pour « Enregistré » ---

const bodySaved = ref(0)
const goalSaved = ref(0)

function bodyEdited() {
  bodySaved.value++
  profile.markEdited()
}

function goalEdited() {
  goalSaved.value++
  profile.markEdited()
}

// --- Fiche corporelle ---

const drafts = reactive({ height: '', weight: '', bodyFat: '', target: '' })
const errors = reactive<{ height?: string, weight?: string, bodyFat?: string, target?: string }>({})

const toDraft = (n: number | null) => (n === null ? '' : formatNumber(n, 1))

function syncDrafts() {
  drafts.height = toDraft(profile.body.heightCm)
  drafts.weight = toDraft(profile.body.manualWeightKg)
  drafts.bodyFat = toDraft(profile.body.bodyFatPercent)
  drafts.target = toDraft(profile.goal.targetWeightKg)
  for (const key of Object.keys(errors) as (keyof typeof errors)[]) errors[key] = undefined
}
syncDrafts()

/** Valide un champ numérique à la sortie du champ ; vide = `null` quand le champ est facultatif. */
function commitNumber(
  key: keyof typeof drafts,
  { min, max, optional = false }: { min: number, max: number, optional?: boolean },
  apply: (value: number | null) => void,
) {
  const raw = drafts[key].trim()
  if (!raw) {
    errors[key] = optional ? undefined : 'Requis'
    if (optional) apply(null)
    return !!optional
  }
  const value = parsePositiveNumber(raw)
  if (value === null) {
    errors[key] = 'Entrez un nombre valide'
    return false
  }
  if (value < min || value > max) {
    errors[key] = `Entre ${formatNumber(min)} et ${formatNumber(max)}`
    return false
  }
  errors[key] = undefined
  apply(value)
  drafts[key] = toDraft(value)
  return true
}

function commitHeight() {
  if (commitNumber('height', { min: 100, max: 250 }, v => (profile.body.heightCm = v))) bodyEdited()
}
function commitWeight() {
  if (commitNumber('weight', { min: 30, max: 300 }, v => (profile.body.manualWeightKg = v))) bodyEdited()
}
function commitBodyFat() {
  if (commitNumber('bodyFat', { min: 3, max: 69, optional: true }, v => (profile.body.bodyFatPercent = v))) bodyEdited()
}

function setSex(sex: Sex) {
  if (profile.body.sex === sex) return
  profile.body.sex = sex
  bodyEdited()
}

const birthDate = computed<DateValue | undefined>({
  get: () => (profile.body.birthDate ? parseDate(profile.body.birthDate) : undefined),
  set: (value) => {
    const next = value ? value.toString() : null
    if (next === profile.body.birthDate) return
    profile.body.birthDate = next
    bodyEdited()
  },
})

const activityItems = ACTIVITY_LEVELS.map(level => ({ label: level.short, description: level.detail, value: level.label }))

const activity = computed({
  get: () => profile.body.activity,
  set: (value: string) => {
    profile.body.activity = value
    bodyEdited()
  },
})

const latestWeighInLabel = computed(() => {
  const w = profile.latestWeighIn
  return w ? `Dernière pesée le ${formatDay(w.date, 'd MMMM')}` : ''
})

// --- Objectif ---

function setDirection(direction: GoalDirection) {
  if (profile.goal.direction === direction) return
  profile.setGoalDirection(direction)
  goalEdited()
}

function setRate(rate: number) {
  if (profile.goal.rateKgPerWeek === rate) return
  profile.goal.rateKgPerWeek = rate
  goalEdited()
}

function commitTarget() {
  if (commitNumber('target', { min: 30, max: 300 }, v => (profile.goal.targetWeightKg = v))) goalEdited()
}

const directionError = computed(() => goalDirectionError(profile.currentWeightKg, profile.goal))

const goalReadout = computed(() => {
  const current = profile.currentWeightKg
  const goal = profile.goal
  if (goal.direction === 'maintain' || current === null || goal.targetWeightKg === null || directionError.value) return null
  const arrival = goalArrivalDate(current, goal)
  if (!arrival) return null
  return {
    remainingKg: Math.abs(current - goal.targetWeightKg),
    weeks: Math.max(1, differenceInCalendarWeeks(arrival, new Date(), { weekStartsOn: 1 })),
    arrival: format(arrival, 'MMM yyyy', { locale: fr }).replace('.', ''),
  }
})

const rates = computed(() => (profile.goal.direction === 'maintain' ? [] : GOAL_RATES[profile.goal.direction]))
const rateLabel = (rate: number) => formatNumber(rate, 2)
</script>

<template>
  <UDashboardPanel id="profil">
    <template #header>
      <UDashboardNavbar title="Profil">
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
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div class="flex items-center gap-4">
          <UAvatar :src="currentUser?.photoURL || undefined" :alt="displayName" size="xl" />
          <div class="flex min-w-0 flex-1 flex-col">
            <p class="truncate text-xl font-bold tracking-tight text-highlighted">
              {{ displayName }}
            </p>
            <p v-if="email" class="truncate text-sm text-muted">
              {{ email }}
            </p>
          </div>
          <UButton
            to="/dashboard/reglages"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            aria-label="Réglages"
          >
            <span class="hidden sm:inline">Réglages</span>
          </UButton>
        </div>

        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div class="flex min-w-0 flex-col gap-6">
            <!-- Fiche corporelle -->
            <section aria-labelledby="body-title" class="flex flex-col rounded-xl border border-default bg-default">
              <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
                <h2 id="body-title" class="text-lg font-bold tracking-tight text-highlighted">
                  Fiche corporelle
                </h2>
                <SavedHint :stamp="bodySaved" />
              </header>

              <div class="divide-y divide-default border-t border-default">
                <SettingRow label="Sexe">
                  <UFieldGroup size="sm">
                    <UButton
                      v-for="sex in SEXES"
                      :key="sex"
                      :label="sex"
                      :color="profile.body.sex === sex ? 'primary' : 'neutral'"
                      :variant="profile.body.sex === sex ? 'solid' : 'outline'"
                      :aria-pressed="profile.body.sex === sex"
                      @click="setSex(sex)"
                    />
                  </UFieldGroup>
                </SettingRow>

                <SettingRow label="Date de naissance" :hint="profile.age !== null ? `${profile.age} ans` : 'Sert à calculer votre âge'">
                  <UInputDate v-model="birthDate" size="sm" aria-label="Date de naissance" />
                </SettingRow>

                <SettingRow label="Taille" for="body-height" :error="errors.height">
                  <UInput
                    id="body-height"
                    v-model="drafts.height"
                    inputmode="decimal"
                    placeholder="175"
                    size="sm"
                    class="w-28"
                    :ui="{ base: 'text-end tabular-nums pe-10', trailing: 'pe-2.5' }"
                    @change="commitHeight"
                  >
                    <template #trailing>
                      <span class="text-xs text-dimmed">cm</span>
                    </template>
                  </UInput>
                </SettingRow>

                <SettingRow v-if="profile.latestWeighIn" label="Poids">
                  <template #hint>
                    {{ latestWeighInLabel }} ·
                    <ULink to="/dashboard/suivi-poids" class="text-muted underline underline-offset-2 hover:text-highlighted">Suivi de poids</ULink>
                  </template>
                  <p class="flex items-baseline gap-1">
                    <span class="text-base font-semibold tabular-nums text-highlighted">{{ formatNumber(profile.latestWeighIn.weightKg, 1) }}</span>
                    <span class="text-xs text-dimmed">kg</span>
                  </p>
                </SettingRow>
                <SettingRow v-else label="Poids" for="body-weight" :error="errors.weight">
                  <template #hint>
                    Aucune pesée : saisi à la main ·
                    <ULink to="/dashboard/suivi-poids" class="text-muted underline underline-offset-2 hover:text-highlighted">Ajouter une pesée</ULink>
                  </template>
                  <UInput
                    id="body-weight"
                    v-model="drafts.weight"
                    inputmode="decimal"
                    placeholder="70"
                    size="sm"
                    class="w-28"
                    :ui="{ base: 'text-end tabular-nums pe-10', trailing: 'pe-2.5' }"
                    @change="commitWeight"
                  >
                    <template #trailing>
                      <span class="text-xs text-dimmed">kg</span>
                    </template>
                  </UInput>
                </SettingRow>

                <SettingRow
                  label="Masse grasse"
                  hint="Facultatif. Si mesurée, le calculateur utilise Katch-McArdle."
                  for="body-fat"
                  :error="errors.bodyFat"
                >
                  <UInput
                    id="body-fat"
                    v-model="drafts.bodyFat"
                    inputmode="decimal"
                    placeholder="—"
                    size="sm"
                    class="w-28"
                    :ui="{ base: 'text-end tabular-nums pe-8', trailing: 'pe-2.5' }"
                    @change="commitBodyFat"
                  >
                    <template #trailing>
                      <span class="text-xs text-dimmed">%</span>
                    </template>
                  </UInput>
                </SettingRow>

                <SettingRow label="Niveau d'activité" stack>
                  <USelectMenu
                    v-model="activity"
                    :items="activityItems"
                    value-key="value"
                    :search-input="false"
                    size="sm"
                    class="w-full sm:w-56"
                  />
                </SettingRow>

                <SettingRow label="IMC" hint="Calculé à partir de la taille et du poids">
                  <span v-if="profile.bmi" class="text-base font-semibold tabular-nums text-highlighted">{{ formatNumber(profile.bmi, 1) }}</span>
                  <span v-else class="text-sm text-dimmed">—</span>
                </SettingRow>
              </div>
            </section>

            <!-- Objectif -->
            <section aria-labelledby="goal-title" class="flex flex-col rounded-xl border border-default bg-default">
              <header class="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
                <h2 id="goal-title" class="text-lg font-bold tracking-tight text-highlighted">
                  Objectif
                </h2>
                <SavedHint :stamp="goalSaved" />
              </header>

              <div class="divide-y divide-default border-t border-default">
                <SettingRow label="Cap" stack>
                  <UFieldGroup size="sm" class="w-full sm:w-auto">
                    <UButton
                      v-for="option in GOAL_DIRECTIONS"
                      :key="option.value"
                      :label="option.label"
                      :icon="option.icon"
                      :color="profile.goal.direction === option.value ? 'primary' : 'neutral'"
                      :variant="profile.goal.direction === option.value ? 'solid' : 'outline'"
                      :aria-pressed="profile.goal.direction === option.value"
                      class="flex-1 justify-center sm:flex-none"
                      @click="setDirection(option.value)"
                    />
                  </UFieldGroup>
                </SettingRow>

                <template v-if="profile.goal.direction !== 'maintain'">
                  <SettingRow
                    label="Poids visé"
                    for="goal-target"
                    :hint="profile.currentWeightKg ? `Actuellement ${formatNumber(profile.currentWeightKg, 1)} kg` : undefined"
                    :error="errors.target ?? directionError"
                  >
                    <UInput
                      id="goal-target"
                      v-model="drafts.target"
                      inputmode="decimal"
                      placeholder="72"
                      size="sm"
                      class="w-28"
                      :ui="{ base: 'text-end tabular-nums pe-10', trailing: 'pe-2.5' }"
                      @change="commitTarget"
                    >
                      <template #trailing>
                        <span class="text-xs text-dimmed">kg</span>
                      </template>
                    </UInput>
                  </SettingRow>

                  <SettingRow label="Rythme" hint="En kg par semaine" stack>
                    <UFieldGroup size="sm" class="w-full sm:w-auto">
                      <UButton
                        v-for="rate in rates"
                        :key="rate"
                        :label="rateLabel(rate)"
                        :color="profile.goal.rateKgPerWeek === rate ? 'primary' : 'neutral'"
                        :variant="profile.goal.rateKgPerWeek === rate ? 'solid' : 'outline'"
                        :aria-pressed="profile.goal.rateKgPerWeek === rate"
                        :aria-label="`${rateLabel(rate)} kg par semaine`"
                        class="flex-1 justify-center tabular-nums sm:w-14 sm:flex-none"
                        @click="setRate(rate)"
                      />
                    </UFieldGroup>
                  </SettingRow>
                </template>
              </div>

              <div v-if="goalReadout" class="grid grid-cols-3 gap-px border-t border-default bg-border">
                <div class="flex flex-col gap-0.5 bg-default px-4 py-3 sm:px-5">
                  <span class="text-xs text-muted">Reste</span>
                  <span class="flex items-baseline gap-1">
                    <span class="text-lg font-bold tabular-nums text-highlighted">{{ formatNumber(goalReadout.remainingKg, 1) }}</span>
                    <span class="text-xs text-dimmed">kg</span>
                  </span>
                </div>
                <div class="flex flex-col gap-0.5 bg-default px-4 py-3 sm:px-5">
                  <span class="text-xs text-muted">Durée</span>
                  <span class="flex items-baseline gap-1">
                    <span class="text-lg font-bold tabular-nums text-highlighted">{{ goalReadout.weeks }}</span>
                    <span class="text-xs text-dimmed">sem.</span>
                  </span>
                </div>
                <div class="flex flex-col gap-0.5 bg-default px-4 py-3 sm:px-5">
                  <span class="text-xs text-muted">Arrivée vers</span>
                  <span class="truncate text-lg font-bold text-highlighted first-letter:uppercase">{{ goalReadout.arrival }}</span>
                </div>
              </div>

              <p class="flex flex-wrap items-center gap-x-1 border-t border-default px-4 py-3 text-xs text-dimmed sm:px-5">
                <template v-if="profile.goal.direction === 'maintain'">
                  Maintien au poids actuel : pas de projection dans le
                </template>
                <template v-else>
                  Le poids visé et le rythme serviront à la projection du
                </template>
                <ULink to="/dashboard/suivi-poids" class="text-muted underline underline-offset-2 hover:text-highlighted">suivi de poids</ULink>.
              </p>
            </section>
          </div>

          <div class="order-first lg:order-none lg:sticky lg:top-0">
            <ProfileTargetsSheet />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
