import { format } from 'date-fns'
import type { DailyTargets } from '~/utils/dailyTargets'
import type { BodyProfile, GoalDirection, ProfileGoal, ProfileScenario, ProfileTargets } from '~/utils/profile'
import type { WeighIn } from '~/utils/weightTrend'

/**
 * Profil de l'utilisateur, partagé entre la page Profil et le calculateur de besoins journaliers.
 * Maquette : état en mémoire (`useState`), conservé d'une page à l'autre mais pas encore dans Firestore.
 */
export function useProfile() {
  const scenario = useState<ProfileScenario>('profile-scenario', () => 'complete')
  const body = useState<BodyProfile>('profile-body', () => sampleBody('complete'))
  const goal = useState<ProfileGoal>('profile-goal', () => sampleGoal('complete'))
  const targets = useState<ProfileTargets | null>('profile-targets', () => sampleTargets('complete'))
  /** Incrémenté à chaque nouvelle fiche de besoins : la page Profil anime alors ses chiffres. */
  const targetsRevision = useState('profile-targets-revision', () => 0)
  /** Fiche précédente, pour montrer l'écart après une mise à jour. */
  const previousTargets = useState<ProfileTargets | null>('profile-previous-targets', () => null)
  /** Le corps ou l'objectif ont changé depuis la dernière fiche de besoins. */
  const targetsStale = useState('profile-targets-stale', () => false)

  /** Dernière pesée du suivi de poids (données d'exemple du profil complet). */
  const latestWeighIn = computed<WeighIn | null>(() =>
    scenario.value === 'complete' ? sortWeighIns(buildSampleWeighIns()).at(-1) ?? null : null,
  )

  const currentWeightKg = computed(() => latestWeighIn.value?.weightKg ?? body.value.manualWeightKg)
  const age = computed(() => ageFromBirthDate(body.value.birthDate))
  const bmi = computed(() => bodyMassIndex(currentWeightKg.value, body.value.heightCm))

  /** Le calculateur a besoin du sexe, de l'âge, de la taille et du poids. */
  const isBodyComplete = computed(() => age.value !== null && !!body.value.heightCm && currentWeightKg.value !== null)

  function loadScenario(value: ProfileScenario) {
    scenario.value = value
    body.value = sampleBody(value)
    goal.value = sampleGoal(value)
    targets.value = sampleTargets(value)
    previousTargets.value = null
    targetsStale.value = false
  }

  /** À appeler quand l'utilisateur modifie son corps ou son objectif. */
  function markEdited() {
    if (targets.value?.source === 'calculator') targetsStale.value = true
  }

  /** Change le sens de l'objectif en gardant un rythme proposé pour ce sens. */
  function setGoalDirection(direction: GoalDirection) {
    goal.value.direction = direction
    if (direction === 'maintain') return
    const rates = GOAL_RATES[direction]
    if (!rates.includes(goal.value.rateKgPerWeek)) goal.value.rateKgPerWeek = rates[1] ?? rates[0]!
  }

  function setTargets(values: DailyTargets, source: ProfileTargets['source']) {
    previousTargets.value = targets.value
    targetsStale.value = false
    targets.value = {
      calories: Math.round(values.calories),
      carbohydrates: Math.round(values.carbohydrates),
      protein: Math.round(values.protein),
      fat: Math.round(values.fat),
      source,
      updatedAt: format(new Date(), 'yyyy-MM-dd'),
    }
    targetsRevision.value++
  }

  return reactive({
    scenario,
    body,
    goal,
    targets,
    targetsRevision,
    previousTargets,
    targetsStale,
    latestWeighIn,
    currentWeightKg,
    age,
    bmi,
    isBodyComplete,
    loadScenario,
    markEdited,
    setGoalDirection,
    setTargets,
  })
}

/** Réglages de l'application (repas, menus, courses, suivi). Maquette : état en mémoire. */
export function useAppSettings() {
  const settings = useState('app-settings', defaultSettings)

  function reset() {
    settings.value = defaultSettings()
  }

  return { settings, reset }
}
