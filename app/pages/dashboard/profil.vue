<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import { addDays, differenceInCalendarDays, format, isThisYear } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useCurrentUser } from 'vuefire'
import { parsePositiveNumber } from '~/utils/numberInput'
import type { GoalDirection, ProfileGoal, ProteinBasis, Sex } from '~/utils/profile'

useSeoMeta({
  title: 'Dashboard - Profil - Mealfit',
  description: 'Dashboard - Profil - Mealfit',
})

const profile = useProfile()
const currentUser = useCurrentUser()
const toast = useToast()

const displayName = computed(() => currentUser.value?.displayName || currentUser.value?.email || 'Vous')
const email = computed(() => (currentUser.value?.displayName ? currentUser.value?.email : null))

// --- Enregistrement : la fiche corporelle à chaque changement, l'objectif sur demande ; un tampon par section pour « Enregistré » ---

const bodySaved = ref(0)
const goalSaved = ref(0)

const toastSaveError = (message: string) => (error: any) => {
  toast.add({
    title: 'Erreur',
    description: `${message} : ${error.message || 'une erreur est survenue'}.`,
    color: 'error',
  })
}

function bodyEdited() {
  bodySaved.value++
  profile.saveBody().catch(toastSaveError('La fiche corporelle n\'a pas pu être enregistrée'))
}

// --- Fiche corporelle ---

const drafts = reactive({ height: '', weight: '', bodyFat: '', target: '' })
const errors = reactive<{ height?: string, weight?: string, bodyFat?: string, target?: string, percent?: string }>({})

const toDraft = (n: number | null) => (n === null ? '' : formatNumber(n, 1))

// Les champs partent de la fiche et de l'objectif enregistrés dans Firestore quand ils existent.
await profile.ready

/** Objectif en cours de modification : rien n'est enregistré avant « Enregistrer ». */
const goalDraft = ref<ProfileGoal>({ ...profile.goal })

drafts.height = toDraft(profile.body.heightCm)
drafts.weight = toDraft(profile.body.manualWeightKg)
drafts.bodyFat = toDraft(profile.body.bodyFatPercent)
drafts.target = toDraft(goalDraft.value.targetWeightKg)

/**
 * La fiche n'est remplacée (et non modifiée champ par champ) qu'à la réception d'une version de Firestore :
 * on y recale les champs, sauf ceux qui affichent une erreur (saisie en cours de correction).
 */
watch(() => profile.body, (body) => {
  const values = { height: body.heightCm, weight: body.manualWeightKg, bodyFat: body.bodyFatPercent }
  for (const [key, value] of Object.entries(values) as [keyof typeof values, number | null][]) {
    if (!errors[key]) drafts[key] = toDraft(value)
  }
})

/** Champs de l'objectif que l'on modifie (le point de départ suit l'enregistrement). */
const sameGoal = (a: ProfileGoal, b: ProfileGoal) =>
  a.direction === b.direction && a.targetWeightKg === b.targetWeightKg && a.calorieDeltaPercent === b.calorieDeltaPercent
  && a.proteinPerKg === b.proteinPerKg && a.proteinBasis === b.proteinBasis

const goalDirty = computed(() => !sameGoal(goalDraft.value, profile.goal))

// Objectif reçu de Firestore (enregistrement, calculateur, autre appareil) : repris tant qu'il n'y a pas de modification en cours.
watch(() => profile.goal, (goal, previous) => {
  if (!sameGoal(goalDraft.value, previous)) return
  goalDraft.value = { ...goal }
  if (!errors.target) drafts.target = toDraft(goal.targetWeightKg)
})

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

/** « aujourd'hui », « hier », « le 28 septembre » (avec l'année si ce n'est pas l'année en cours) ; vide si jamais enregistrée. */
const bodyUpdatedLabel = computed(() => {
  const date = profile.bodyUpdatedAt
  if (!date) return ''
  const days = differenceInCalendarDays(new Date(), date)
  if (days === 0) return 'aujourd\'hui'
  if (days === 1) return 'hier'
  return `le ${format(date, isThisYear(date) ? 'd MMMM' : 'd MMMM yyyy', { locale: fr })}`
})

// --- Objectif (brouillon, enregistré sur demande) ---

function setDirection(direction: GoalDirection) {
  const goal = goalDraft.value
  if (goal.direction === direction) return
  goal.direction = direction
  // Un pourcentage saisi à la main qui n'est pas proposé dans le nouveau sens reprend celui par défaut.
  if (direction !== 'maintain') goal.calorieDeltaPercent = percentForDirection(direction, goal.calorieDeltaPercent)
  errors.percent = undefined
}

function setPercent(percent: number) {
  goalDraft.value.calorieDeltaPercent = percent
}

const proteinPerKg = computed({
  get: () => goalDraft.value.proteinPerKg,
  set: (value: number) => (goalDraft.value.proteinPerKg = value),
})

/** Le poids visé n'existe qu'avec un objectif de perte ou de prise. */
const canUseTargetWeight = computed(() => goalDraft.value.direction !== 'maintain' && goalDraft.value.targetWeightKg !== null)
/** Base réellement appliquée : le poids visé choisi retombe sur le poids actuel tant qu'il n'existe pas (voir `proteinBasisWeightKg`). */
const activeProteinBasis = computed<ProteinBasis>(() => (canUseTargetWeight.value ? goalDraft.value.proteinBasis : 'current'))

function setProteinBasis(basis: ProteinBasis) {
  goalDraft.value.proteinBasis = basis
}

/** Grammes par jour pour le poids de référence choisi. */
const proteinHint = computed(() => {
  const weight = proteinBasisWeightKg(goalDraft.value, profile.currentWeightKg)
  if (!weight) return 'En g par kg de poids de corps'
  const basis = activeProteinBasis.value === 'target' ? 'poids visé' : 'poids actuel'
  return `≈ ${formatNumber(goalDraft.value.proteinPerKg * weight)} g par jour pour ${formatNumber(weight, 1)} kg (${basis})`
})

function commitTarget() {
  commitNumber('target', { min: 30, max: 300 }, v => (goalDraft.value.targetWeightKg = v))
}

const directionError = computed(() => goalDirectionError(profile.currentWeightKg, goalDraft.value))

/** Besoins à (re)calculer alors que l'objectif n'a pas changé : aucun encore, ou fiche corporelle modifiée depuis. */
const targetsNeedUpdate = computed(() => !!profile.bodyModel && (!profile.targets || profile.targetsStale))
const canSaveGoal = computed(() => (goalDirty.value || targetsNeedUpdate.value) && !errors.target && !errors.percent)

/**
 * Enregistre l'objectif et recalcule les besoins du jour (carte de droite) dans la même écriture.
 * Nouveau sens ou nouveau poids visé : l'objectif repart d'aujourd'hui (voir `saveGoal`).
 */
function saveGoal() {
  if (!canSaveGoal.value) return
  const saved = profile.goal
  const restart = goalDraft.value.direction !== saved.direction || goalDraft.value.targetWeightKg !== saved.targetWeightKg
  const result = profile.saveGoal(goalDraft.value, { restart })
  result.saved.catch(toastSaveError('L\'objectif n\'a pas pu être enregistré'))
  goalDraft.value = { ...profile.goal }
  goalSaved.value++
  if (!result.targetsUpdated) {
    toast.add({
      title: 'Objectif enregistré',
      description: 'Complétez la fiche corporelle (date de naissance, taille, poids) pour calculer vos besoins du jour.',
      color: 'neutral',
      icon: 'i-lucide-info',
    })
  }
}

/** Même modèle que la projection du calculateur de besoins journaliers ; `null` si la fiche corporelle est incomplète. */
const goalProjection = computed(() =>
  profile.bodyModel && !directionError.value ? projectGoal(profile.bodyModel, goalDraft.value) : null,
)

const goalReadout = computed(() => {
  const current = profile.currentWeightKg
  const target = goalDraft.value.targetWeightKg
  const projection = goalProjection.value
  if (!projection || current === null || target === null) return null
  const { reachDay } = projection
  return {
    remainingKg: Math.abs(current - target),
    weeks: reachDay === null ? null : Math.max(1, Math.ceil(reachDay / 7)),
    arrival: reachDay === null ? null : format(addDays(new Date(), reachDay), 'MMM yyyy', { locale: fr }).replace('.', ''),
    plateauKg: projection.plateauKg,
  }
})

/** Les kcal et le rythme de départ que donne ce pourcentage ; le rythme ralentit ensuite, à kcal fixes. */
const percentHint = computed(() => {
  const projection = goalProjection.value
  if (!projection) return 'En % de la dépense journalière'
  const rate = projection.startRateKgPerWeek
  return `En % de la dépense · ≈ ${formatNumber(projection.calories)} kcal/jour, ${rate < 0 ? '−' : '+'}${formatNumber(Math.abs(rate), 2)} kg/sem au départ`
})
</script>

<template>
  <UDashboardPanel id="profil">
    <template #header>
      <UDashboardNavbar title="Profil">
        <template #leading>
          <UDashboardSidebarCollapse />
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
              <header class="flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
                <div class="flex min-w-0 flex-col gap-1">
                  <h2 id="body-title" class="text-lg font-bold tracking-tight text-highlighted">
                    Fiche corporelle
                  </h2>
                  <p v-if="bodyUpdatedLabel" class="text-xs text-muted">
                    Mise à jour {{ bodyUpdatedLabel }}
                  </p>
                </div>
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
                    placeholder="—"
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

                <SettingRow label="Poids" for="body-weight" :error="errors.weight">
                  <template #hint>
                    Saisi à la main pour l'instant. À terme, ce sera votre dernière pesée du
                    <ULink to="/dashboard/suivi-poids" class="text-muted underline underline-offset-2 hover:text-highlighted">suivi de poids</ULink>.
                  </template>
                  <UInput
                    id="body-weight"
                    v-model="drafts.weight"
                    inputmode="decimal"
                    placeholder="—"
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
              <header class="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
                <div class="flex min-w-0 flex-col gap-1">
                  <h2 id="goal-title" class="text-lg font-bold tracking-tight text-highlighted">
                    Objectif
                  </h2>
                  <p v-if="goalDirty" class="text-xs text-muted">
                    Modifications non enregistrées
                  </p>
                  <p v-else-if="targetsNeedUpdate" class="text-xs text-muted">
                    Enregistrez pour {{ profile.targets ? 'mettre à jour' : 'calculer' }} vos besoins du jour
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <SavedHint :stamp="goalSaved" />
                  <UButton
                    label="Enregistrer"
                    icon="i-lucide-check"
                    size="sm"
                    :color="canSaveGoal ? 'primary' : 'neutral'"
                    :variant="canSaveGoal ? 'solid' : 'outline'"
                    :disabled="!canSaveGoal"
                    @click="saveGoal"
                  />
                </div>
              </header>

              <div class="divide-y divide-default border-t border-default">
                <SettingRow label="Cap" stack>
                  <UFieldGroup size="sm" class="w-full sm:w-auto">
                    <UButton
                      v-for="option in GOAL_DIRECTIONS"
                      :key="option.value"
                      :label="option.label"
                      :icon="option.icon"
                      :color="goalDraft.direction === option.value ? 'primary' : 'neutral'"
                      :variant="goalDraft.direction === option.value ? 'solid' : 'outline'"
                      :aria-pressed="goalDraft.direction === option.value"
                      class="flex-1 justify-center sm:flex-none"
                      @click="setDirection(option.value)"
                    />
                  </UFieldGroup>
                </SettingRow>

                <template v-if="goalDraft.direction !== 'maintain'">
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
                      placeholder="—"
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

                  <SettingRow
                    :label="goalDraft.direction === 'loss' ? 'Déficit calorique' : 'Surplus calorique'"
                    :hint="percentHint"
                    :error="errors.percent"
                    stack
                  >
                    <CaloriePercentPicker
                      v-model:error="errors.percent"
                      :model-value="goalDraft.calorieDeltaPercent"
                      :direction="goalDraft.direction"
                      @update:model-value="setPercent"
                    />
                  </SettingRow>
                </template>

                <SettingRow label="Protéines" :hint="proteinHint" stack>
                  <USelectMenu
                    v-model="proteinPerKg"
                    :items="PROTEIN_LEVEL_ITEMS"
                    value-key="value"
                    :search-input="false"
                    size="sm"
                    class="w-full sm:w-72"
                  />
                </SettingRow>

                <SettingRow
                  label="Protéines calculées sur"
                  :hint="canUseTargetWeight ? undefined : 'Le poids visé demande un objectif de perte ou de prise.'"
                  stack
                >
                  <UFieldGroup size="sm" class="w-full sm:w-auto">
                    <UButton
                      v-for="basis in PROTEIN_BASES"
                      :key="basis.value"
                      :label="basis.label"
                      :color="activeProteinBasis === basis.value ? 'primary' : 'neutral'"
                      :variant="activeProteinBasis === basis.value ? 'solid' : 'outline'"
                      :aria-pressed="activeProteinBasis === basis.value"
                      :disabled="basis.value === 'target' && !canUseTargetWeight"
                      class="flex-1 justify-center sm:flex-none"
                      @click="setProteinBasis(basis.value)"
                    />
                  </UFieldGroup>
                </SettingRow>
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
                    <template v-if="goalReadout.weeks !== null">
                      <span class="text-lg font-bold tabular-nums text-highlighted">{{ goalReadout.weeks }}</span>
                      <span class="text-xs text-dimmed">sem.</span>
                    </template>
                    <span v-else class="text-lg font-bold text-highlighted">—</span>
                  </span>
                </div>
                <div class="flex flex-col gap-0.5 bg-default px-4 py-3 sm:px-5">
                  <span class="text-xs text-muted">Arrivée vers</span>
                  <span v-if="goalReadout.arrival" class="truncate text-lg font-bold text-highlighted first-letter:uppercase">{{ goalReadout.arrival }}</span>
                  <span v-else class="truncate text-lg font-bold text-highlighted">Non atteint</span>
                </div>
              </div>
              <p v-if="goalReadout && goalReadout.arrival === null" class="border-t border-default px-4 py-3 text-xs text-muted sm:px-5">
                À ces calories, le poids se stabilise vers {{ formatNumber(goalReadout.plateauKg, 1) }} kg avant le poids visé : {{ goalDraft.direction === 'loss' ? 'augmentez le déficit' : 'augmentez le surplus' }} ou rapprochez le poids visé.
              </p>

              <p class="flex flex-wrap items-center gap-x-1 border-t border-default px-4 py-3 text-xs text-dimmed sm:px-5">
                <template v-if="goalDraft.direction !== 'maintain' && !profile.bodyModel">
                  Complétez la fiche corporelle pour estimer la durée. Le poids visé et {{ goalDraft.direction === 'gain' ? 'le surplus' : 'le déficit' }} serviront à la projection du
                </template>
                <template v-else-if="goalDraft.direction === 'maintain'">
                  Maintien au poids actuel : pas de projection dans le
                </template>
                <template v-else>
                  Le poids visé et {{ goalDraft.direction === 'gain' ? 'le surplus' : 'le déficit' }} serviront à la projection du
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
