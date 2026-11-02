<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import { addDays, differenceInCalendarDays, format, isThisYear } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useCurrentUser } from 'vuefire'
import { DAILY_TARGETS, type DailyTargets } from '~/utils/dailyTargets'
import { parseNonNegativeNumber, parsePositiveNumber } from '~/utils/numberInput'
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

const sameTargets = (a: DailyTargets | null | undefined, b: DailyTargets | null | undefined) =>
  (!a && !b) || (!!a && !!b && TARGET_KEYS.every(key => a[key] === b[key]))

/** Champs de l'objectif que l'on modifie (le point de départ suit l'enregistrement). */
const sameGoal = (a: ProfileGoal, b: ProfileGoal) =>
  a.direction === b.direction && a.targetWeightKg === b.targetWeightKg && a.calorieDeltaPercent === b.calorieDeltaPercent
  && a.proteinPerKg === b.proteinPerKg && a.proteinBasis === b.proteinBasis && sameTargets(a.manualTargets, b.manualTargets)

const goalDirty = computed(() => !sameGoal(goalDraft.value, profile.goal))

// --- Besoins saisis à la main (mode « Manuels » de l'objectif) ---

const TARGET_KEYS = ['calories', 'carbohydrates', 'protein', 'fat'] as const
type TargetKey = typeof TARGET_KEYS[number]

const MANUAL_FIELDS: { key: TargetKey, label: string, unit: string, placeholder: string }[] = [
  { key: 'calories', label: 'Énergie', unit: 'kcal', placeholder: '2000' },
  { key: 'carbohydrates', label: 'Glucides', unit: 'g', placeholder: '0' },
  { key: 'protein', label: 'Protéines', unit: 'g', placeholder: '0' },
  { key: 'fat', label: 'Lipides', unit: 'g', placeholder: '0' },
]

const manualDrafts = reactive<Record<TargetKey, string>>({ calories: '', carbohydrates: '', protein: '', fat: '' })
const manualErrors = reactive<Partial<Record<TargetKey, string>>>({})

function fillManualDrafts(values: DailyTargets | null) {
  for (const key of TARGET_KEYS) {
    manualDrafts[key] = values ? String(Math.round(values[key])) : ''
    manualErrors[key] = undefined
  }
}
fillManualDrafts(goalDraft.value.manualTargets)

// Objectif reçu de Firestore (enregistrement, calculateur, autre appareil) : repris tant qu'il n'y a pas de modification en cours.
watch(() => profile.goal, (goal, previous) => {
  if (!sameGoal(goalDraft.value, previous)) return
  goalDraft.value = { ...goal }
  if (!errors.target) drafts.target = toDraft(goal.targetWeightKg)
  fillManualDrafts(goal.manualTargets)
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
const hasManualErrors = computed(() => isManual.value && TARGET_KEYS.some(key => manualErrors[key]))
const canSaveGoal = computed(() =>
  (goalDirty.value || targetsNeedUpdate.value) && !errors.target && !errors.percent && !hasManualErrors.value)

/** Besoins que donnerait le calcul (pourcentage et g/kg) ; `null` si la fiche corporelle est incomplète. */
const calculatedTargets = computed(() => {
  const model = profile.bodyModel
  const weight = proteinBasisWeightKg(goalDraft.value, profile.currentWeightKg)
  if (!model || !weight) return null
  const calories = goalCalories(totalEnergyExpenditure(model), { ...goalDraft.value, manualTargets: null })
  return splitMacros(calories, goalDraft.value.proteinPerKg * weight)
})

/** Besoins du jour que donnera l'objectif en cours de modification, comme à l'enregistrement (voir `saveGoal`). */
const draftTargets = computed(() => goalDraft.value.manualTargets ?? calculatedTargets.value)

const isManual = computed(() => !!goalDraft.value.manualTargets)

/** Passe en saisie manuelle en partant des besoins calculés (ou actuels), ou revient au calcul. */
function setManual(manual: boolean) {
  if (manual === isManual.value) return
  const start = manual ? calculatedTargets.value ?? profile.targets ?? DAILY_TARGETS : null
  goalDraft.value.manualTargets = start ? targetsValues(start) : null
  fillManualDrafts(goalDraft.value.manualTargets)
}

/** Valide une valeur saisie à la sortie du champ ; les kcal doivent être positives, les macros peuvent valoir 0. */
function commitManual(key: TargetKey) {
  const raw = manualDrafts[key].trim()
  const value = key === 'calories' ? parsePositiveNumber(raw) : parseNonNegativeNumber(raw)
  if (value === null) {
    manualErrors[key] = raw ? 'Nombre invalide' : 'Requis'
    return
  }
  manualErrors[key] = undefined
  goalDraft.value.manualTargets = { ...goalDraft.value.manualTargets!, [key]: Math.round(value) }
  manualDrafts[key] = String(Math.round(value))
}

/**
 * Reprend la valeur dès la frappe (pas seulement à la sortie du champ) : « Enregistrer » s'active aussitôt, et un clic
 * dessus, champ encore actif, enregistre bien la valeur tapée. Une saisie invalide n'est signalée qu'à la sortie.
 */
function inputManual(key: TargetKey, raw: string | number) {
  manualDrafts[key] = String(raw)
  const text = String(raw).trim()
  const value = key === 'calories' ? parsePositiveNumber(text) : parseNonNegativeNumber(text)
  if (value === null) return
  manualErrors[key] = undefined
  goalDraft.value.manualTargets = { ...goalDraft.value.manualTargets!, [key]: Math.round(value) }
}

/** Écart entre les kcal saisies et celles des macros (4 / 4 / 9), comme la fiche « Besoins du jour ». */
const manualCoherence = computed(() => {
  const values = goalDraft.value.manualTargets
  if (!values) return null
  const fromMacros = macroKcal(values)
  const gap = fromMacros - values.calories
  return { fromMacros, gap, ok: Math.abs(gap) <= values.calories * MACRO_KCAL_TOLERANCE }
})

/** Glucides recalculés pour que les macros apportent les kcal saisies. */
function fitManualCarbs() {
  const values = goalDraft.value.manualTargets
  if (!values) return
  const carbohydrates = Math.max(0, Math.round((values.calories - values.protein * 4 - values.fat * 9) / 4))
  goalDraft.value.manualTargets = { ...values, carbohydrates }
  manualDrafts.carbohydrates = String(carbohydrates)
  manualErrors.carbohydrates = undefined
}

/** Ce qui, avec le poids visé, fixe les calories de la projection. */
const projectionBasis = computed(() => {
  if (isManual.value) return 'les kcal saisies'
  return goalDraft.value.direction === 'gain' ? 'le surplus' : 'le déficit'
})

const signedKcal = (n: number) => `${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n))}`

// --- Confirmation : le nouvel objectif vaut à partir d'aujourd'hui ---

const confirmGoalOpen = ref(false)
const goalHistoryOpen = ref(false)

const confirmGoalDescription = computed(() => {
  const today = format(new Date(), 'EEEE d MMMM', { locale: fr })
  return draftTargets.value
    ? `À partir d'aujourd'hui, ${today}, ces besoins du jour remplacent les actuels dans l'accueil, les Menus et le suivi de poids. Les jours passés gardent leur objectif.`
    : `Ce nouvel objectif remplace l'actuel à partir d'aujourd'hui, ${today}. Les jours passés gardent leur objectif.`
})

/** Mêmes lignes que la confirmation du calculateur (« Définir comme objectif »). */
const goalDiffRows = computed(() => {
  const next = draftTargets.value
  if (!next) return []
  const current = profile.targets
  return [
    { label: 'Énergie', unit: 'kcal', current: current?.calories ?? null, next: Math.round(next.calories) },
    { label: 'Glucides', unit: 'g', current: current?.carbohydrates ?? null, next: Math.round(next.carbohydrates) },
    { label: 'Protéines', unit: 'g', current: current?.protein ?? null, next: Math.round(next.protein) },
    { label: 'Lipides', unit: 'g', current: current?.fat ?? null, next: Math.round(next.fat) },
  ]
})

function askSaveGoal() {
  if (canSaveGoal.value) confirmGoalOpen.value = true
}

/**
 * Enregistre l'objectif et recalcule les besoins du jour (carte de droite) dans la même écriture : ils deviennent
 * l'objectif de l'app à partir d'aujourd'hui, les jours passés gardant le leur (voir `targetsOn`).
 * Nouveau sens ou nouveau poids visé : l'objectif repart d'aujourd'hui (voir `saveGoal`).
 */
function saveGoal() {
  confirmGoalOpen.value = false
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
                  <UTooltip text="Historique des objectifs">
                    <UButton
                      icon="i-lucide-history"
                      size="sm"
                      color="neutral"
                      variant="ghost"
                      aria-label="Historique des objectifs"
                      @click="goalHistoryOpen = true"
                    />
                  </UTooltip>
                  <UButton
                    label="Enregistrer"
                    icon="i-lucide-check"
                    size="sm"
                    :color="canSaveGoal ? 'primary' : 'neutral'"
                    :variant="canSaveGoal ? 'solid' : 'outline'"
                    :disabled="!canSaveGoal"
                    @click="askSaveGoal"
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
                    v-if="!isManual"
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

                <SettingRow
                  label="Besoins du jour"
                  :hint="isManual ? 'Saisis à la main : le déficit et les protéines ne s\'appliquent plus' : 'Calculés depuis la fiche, le déficit et les protéines'"
                  stack
                >
                  <UFieldGroup size="sm" class="w-full sm:w-auto">
                    <UButton
                      v-for="mode in [{ manual: false, label: 'Calculés', icon: 'i-lucide-calculator' }, { manual: true, label: 'Manuels', icon: 'i-lucide-pencil' }]"
                      :key="mode.label"
                      :label="mode.label"
                      :icon="mode.icon"
                      :color="isManual === mode.manual ? 'primary' : 'neutral'"
                      :variant="isManual === mode.manual ? 'solid' : 'outline'"
                      :aria-pressed="isManual === mode.manual"
                      class="flex-1 justify-center sm:flex-none"
                      @click="setManual(mode.manual)"
                    />
                  </UFieldGroup>
                </SettingRow>

                <template v-if="isManual">
                  <SettingRow
                    v-for="field in MANUAL_FIELDS"
                    :key="field.key"
                    :label="field.label"
                    :for="`goal-manual-${field.key}`"
                    :error="manualErrors[field.key]"
                  >
                    <UInput
                      :id="`goal-manual-${field.key}`"
                      :model-value="manualDrafts[field.key]"
                      inputmode="numeric"
                      :placeholder="field.placeholder"
                      size="sm"
                      class="w-28"
                      :ui="{ base: `text-end tabular-nums ${field.unit === 'kcal' ? 'pe-12' : 'pe-8'}`, trailing: 'pe-2.5' }"
                      @update:model-value="inputManual(field.key, $event)"
                      @change="commitManual(field.key)"
                    >
                      <template #trailing>
                        <span class="text-xs text-dimmed">{{ field.unit }}</span>
                      </template>
                    </UInput>
                  </SettingRow>

                  <div
                    v-if="manualCoherence"
                    class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-xs sm:px-5"
                    :class="manualCoherence.ok ? 'text-muted' : 'text-warning'"
                  >
                    <p class="flex items-center gap-1.5">
                      <UIcon :name="manualCoherence.ok ? 'i-lucide-check' : 'i-lucide-triangle-alert'" class="size-3.5 shrink-0" />
                      <span>
                        Les macros apportent <span class="font-semibold tabular-nums">{{ formatNumber(manualCoherence.fromMacros) }} kcal</span>
                        <template v-if="manualCoherence.ok">, en accord avec l'énergie.</template>
                        <template v-else>, soit {{ signedKcal(manualCoherence.gap) }} kcal par rapport à l'énergie.</template>
                      </span>
                    </p>
                    <UButton
                      v-if="!manualCoherence.ok"
                      label="Ajuster les glucides"
                      color="neutral"
                      variant="outline"
                      size="xs"
                      @click="fitManualCarbs"
                    />
                  </div>
                </template>

                <template v-else>
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
                À ces calories, le poids se stabilise vers {{ formatNumber(goalReadout.plateauKg, 1) }} kg avant le poids visé : {{ isManual ? (goalDraft.direction === 'loss' ? 'baissez les kcal' : 'augmentez les kcal') : (goalDraft.direction === 'loss' ? 'augmentez le déficit' : 'augmentez le surplus') }} ou rapprochez le poids visé.
              </p>

              <p class="flex flex-wrap items-center gap-x-1 border-t border-default px-4 py-3 text-xs text-dimmed sm:px-5">
                <template v-if="goalDraft.direction !== 'maintain' && !profile.bodyModel">
                  Complétez la fiche corporelle pour estimer la durée. Le poids visé et {{ projectionBasis }} serviront à la projection du
                </template>
                <template v-else-if="goalDraft.direction === 'maintain'">
                  Maintien au poids actuel : pas de projection dans le
                </template>
                <template v-else>
                  Le poids visé et {{ projectionBasis }} serviront à la projection du
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

      <UModal
        v-model:open="goalHistoryOpen"
        title="Historique des objectifs"
        description="Besoins du jour en vigueur à chaque date : un changement ne modifie pas les jours d'avant."
        :ui="{ content: 'sm:max-w-2xl' }"
      >
        <template #body>
          <GoalHistoryChart :periods="profile.goalHistory" />
        </template>
      </UModal>

      <UModal
        v-model:open="confirmGoalOpen"
        title="Changer d'objectif ?"
        :description="confirmGoalDescription"
        :ui="{ footer: 'justify-end' }"
      >
        <template v-if="goalDiffRows.length" #body>
          <div class="overflow-hidden rounded-lg border border-default">
            <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-x-3 border-b border-default px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
              <span />
              <span class="text-end">Actuel</span>
              <span class="text-end">Nouveau</span>
            </div>
            <div
              v-for="row in goalDiffRows"
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
          <UButton label="Non" color="neutral" variant="ghost" @click="confirmGoalOpen = false" />
          <UButton label="Oui, changer l'objectif" icon="i-lucide-target" @click="saveGoal" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
