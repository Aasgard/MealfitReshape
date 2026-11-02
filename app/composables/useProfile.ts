import { format } from 'date-fns'
import { doc, FieldPath, getDoc, serverTimestamp, setDoc, type DocumentReference, type Timestamp } from 'firebase/firestore'
import { useCurrentUser, useDocument, useFirestore } from 'vuefire'
import type { UserDoc, UserGoalHistoryEntry } from '~/types/user'
import { DAILY_TARGETS, type DailyTargets } from '~/utils/dailyTargets'
import type { BodyProfile, GoalDirection, GoalPeriod, ProfileGoal, ProfileTargets } from '~/utils/profile'

/** Parties du document `users` tenues par le profil, chacune enregistrée en entier. */
type ProfilePart = 'body' | 'goal' | 'targets'

/**
 * Profil de l'utilisateur, partagé entre la page Profil et le calculateur de besoins journaliers.
 * La fiche corporelle, l'objectif et la fiche de besoins viennent de Firestore (`users/{uid}.body`, `.goal`, `.targets`),
 * vierges tant qu'ils n'y sont pas enregistrés.
 */
export function useProfile() {
  const db = useFirestore()
  const user = useCurrentUser()

  const body = useState<BodyProfile>('profile-body', emptyBody)
  const goal = useState<ProfileGoal>('profile-goal', emptyGoal)
  const targets = useState<ProfileTargets | null>('profile-targets', () => null)
  /** Objectifs successifs (`users.goalHistory`, ou repris du document tant qu'il n'existe pas), du plus ancien au plus récent. */
  const goalHistory = useState<GoalPeriod[]>('profile-goal-history', () => [])
  /** Jours déjà dans `goalHistory` côté Firestore ; les autres périodes (reprises du document) y sont écrites au prochain enregistrement. */
  const storedHistoryDays = useState<string[]>('profile-goal-history-days', () => [])

  /** Dernier enregistrement de chaque partie ; `null` tant qu'elle n'a jamais été enregistrée. */
  const updatedAt = useState<Record<ProfilePart, Date | null>>('profile-updated-at', () => ({ body: null, goal: null, targets: null }))
  const bodyUpdatedAt = computed(() => updatedAt.value.body)

  /** Incrémenté à chaque nouvelle fiche de besoins définie ici : la page Profil anime alors ses chiffres. */
  const targetsRevision = useState('profile-targets-revision', () => 0)
  /** Fiche précédente, pour montrer l'écart après une mise à jour. */
  const previousTargets = useState<ProfileTargets | null>('profile-previous-targets', () => null)

  /**
   * Applique les parties présentes dans `data` ; `clearMissing` vide aussi les absentes (lecture complète du document).
   * Une écriture que le serveur n'a pas encore confirmée a un `updatedAt` nul : elle date de maintenant, le même instant
   * pour toutes les parties, si bien que des besoins et un objectif enregistrés ensemble gardent la même date.
   */
  function applyStored(data: UserDoc | undefined, { clearMissing = false } = {}) {
    const now = new Date()
    const stamp = (part: { updatedAt?: Timestamp } | undefined) => (part ? part.updatedAt?.toDate() ?? now : null)
    const next = { ...updatedAt.value }
    if (data?.body || clearMissing) {
      body.value = bodyFromStored(data?.body ?? {})
      next.body = stamp(data?.body)
    }
    if (data?.goal || clearMissing) {
      goal.value = goalFromStored(data?.goal ?? {})
      next.goal = stamp(data?.goal)
    }
    if (data?.targets || clearMissing) {
      next.targets = stamp(data?.targets)
      targets.value = data?.targets ? targetsFromStored(data.targets, next.targets!) : null
    }
    if (data?.goalHistory || data?.targetsByDate || data?.goal || data?.targets || clearMissing) {
      goalHistory.value = goalHistoryFromStored(data ?? {}, next)
      storedHistoryDays.value = Object.keys(data?.goalHistory ?? {})
    }
    updatedAt.value = next
  }

  const userRef = () => (user.value ? doc(db, 'users', user.value.uid) as DocumentReference<UserDoc> : null)

  /** Suit les changements (enregistrements, autre appareil) ; la page Profil resynchronise alors ses champs. */
  const userDoc = useDocument<UserDoc>(userRef)
  watch(() => userDoc.value, data => applyStored(data ?? undefined))

  /**
   * Résolue une fois le profil lu sur le serveur (vierge si rien n'est enregistré) ; un échec de lecture le laisse en l'état.
   * Les modifications étant enregistrées aussitôt, la lecture les contient déjà : le profil peut être remplacé sans rien perdre.
   * Pas `userDoc.promise` : le middleware écrit `account` en `merge` au chargement, et le premier instantané du listener
   * peut alors être cette écriture locale seule, sans les parties du profil (d'où `clearMissing` ici seulement).
   */
  const ready = (async () => {
    const ref = userRef()
    if (!ref) return
    try {
      applyStored((await getDoc(ref)).data(), { clearMissing: true })
    }
    catch (error) {
      console.error('Lecture du profil impossible', error)
    }
  })()

  /**
   * Écrit des parties du document `users` en une seule écriture (même `updatedAt` serveur pour toutes), et les jours
   * de `goalHistory` donnés ; hors ligne, la promesse n'aboutit qu'à la synchronisation.
   */
  function saveParts(parts: Partial<Record<ProfilePart, object>>, history: Record<string, UserGoalHistoryEntry> = {}) {
    const uid = user.value?.uid
    if (!uid) return Promise.reject(new Error('Vous devez être connecté.'))
    const fields = Object.keys(parts) as ProfilePart[]
    const data: Record<string, object> = Object.fromEntries(fields.map(field => [field, { ...parts[field], updatedAt: serverTimestamp() }]))
    const days = Object.keys(history)
    if (days.length) data.goalHistory = history
    // `mergeFields` remplace chaque partie en entier (un champ abandonné, comme l'ancien `goal.rateKgPerWeek`, disparaît)
    // sans toucher au reste du document (`account`, les autres parties) ; dans l'historique, seuls les jours écrits changent.
    const mergeFields = [...fields.map(field => new FieldPath(field)), ...days.map(day => new FieldPath('goalHistory', day))]
    return setDoc(doc(db, 'users', uid), data, { mergeFields })
  }

  /** Enregistre la fiche corporelle en entier. */
  const saveBody = () => saveParts({ body: bodyToStored(body.value) })

  /**
   * Objectif prêt à enregistrer. `restart` (nouveau sens ou nouveau poids visé) le fait repartir d'aujourd'hui
   * et du poids actuel ; un objectif sans point de départ en reçoit un au premier enregistrement.
   */
  function goalToSave(restart: boolean) {
    if (restart || !goal.value.startDate) {
      goal.value.startDate = format(new Date(), 'yyyy-MM-dd')
      goal.value.startWeightKg = currentWeightKg.value
    }
    return goalToStored(goal.value)
  }

  /** Remplace la fiche de besoins affichée (l'ancienne sert à montrer l'écart) et la renvoie prête à enregistrer. */
  function replaceTargets(values: DailyTargets, source: ProfileTargets['source']) {
    const stored = targetsToStored(values, source)
    previousTargets.value = targets.value
    targets.value = targetsFromStored(stored, new Date())
    targetsRevision.value++
    return stored
  }

  /**
   * Met l'objectif en cours (l'objectif, si `withGoal`, et les besoins) en vigueur à partir d'aujourd'hui, sans toucher
   * aux jours d'avant, et renvoie les jours d'historique à écrire. Les périodes reprises du document (objectif d'avant
   * l'historique, ancien `targetsByDate`) y sont écrites aussi, à leur date : rien de ce qui valait avant n'est perdu.
   */
  function recordToday(withGoal: boolean) {
    const today = format(new Date(), 'yyyy-MM-dd')
    const period: GoalPeriod = { from: today, goal: withGoal ? { ...goal.value } : null, targets: targets.value }
    const earlier = goalHistory.value.filter(p => p.from < today)
    const written = [...earlier.filter(p => !storedHistoryDays.value.includes(p.from)), period]
    goalHistory.value = [...earlier, period]
    storedHistoryDays.value = goalHistory.value.map(p => p.from)
    return Object.fromEntries(written.map(p => [p.from, goalPeriodToStored(p)]))
  }

  /**
   * Besoins en vigueur le jour `day` (`yyyy-MM-dd`), pour l'accueil, les Menus et le suivi de poids. Avant les premiers
   * besoins définis, ceux par défaut (`DAILY_TARGETS`), qui valaient alors dans toute l'app.
   */
  const targetsOn = (day: string): DailyTargets => goalPartOn(goalHistory.value, 'targets', day) ?? DAILY_TARGETS

  /**
   * Besoins du jour de l'objectif : ceux saisis à la main, sinon tirés de la fiche, comme le calculateur (dépense ∓ le
   * pourcentage, protéines au g/kg choisi sur le poids de référence, puis `splitMacros`). `null` si la fiche est incomplète.
   */
  function targetsFromProfile(): DailyTargets | null {
    if (goal.value.manualTargets) return goal.value.manualTargets
    const model = bodyModel.value
    const weight = proteinBasisWeightKg(goal.value, currentWeightKg.value)
    if (!model || !weight) return null
    return splitMacros(goalCalories(totalEnergyExpenditure(model), goal.value), goal.value.proteinPerKg * weight)
  }

  /**
   * Enregistre l'objectif (`next`, ou l'actuel pour seulement recalculer) et, si la fiche corporelle est complète,
   * les besoins du jour qui en découlent, dans la même écriture : ils gardent la même date et ne sont pas « à recalculer ».
   * Voir `goalToSave` pour `restart`. L'affichage est à jour aussitôt ; `saved` n'aboutit, hors ligne, qu'à la synchronisation.
   */
  function saveGoal(next: ProfileGoal = goal.value, { restart = false } = {}) {
    // Le point de départ reste celui enregistré : seul `restart` le déplace.
    goal.value = { ...next, startDate: goal.value.startDate, startWeightKg: goal.value.startWeightKg }
    const values = targetsFromProfile()
    const stored = values ? replaceTargets(values, goal.value.manualTargets ? 'manual' : 'profile') : null
    const parts = { goal: goalToSave(restart), ...(stored ? { targets: stored } : {}) }
    const saved = saveParts(parts, recordToday(true))
    return { targetsUpdated: stored !== null, saved }
  }

  /**
   * Remplace la fiche de besoins et l'enregistre. `goal` enregistre l'objectif dans la même écriture
   * (« Définir comme objectif ») : les deux gardent la même date, et la fiche n'apparaît pas aussitôt « à recalculer ».
   */
  function setTargets(values: DailyTargets, source: ProfileTargets['source'], { goal: withGoal }: { goal?: { restart: boolean } } = {}) {
    const stored = replaceTargets(values, source)
    const parts = { targets: stored, ...(withGoal ? { goal: goalToSave(withGoal.restart) } : {}) }
    // Sans objectif jamais enregistré, la période n'en a pas.
    return saveParts(parts, recordToday(!!withGoal || updatedAt.value.goal !== null))
  }

  /** Besoins calculés (profil ou calculateur), alors que la fiche corporelle ou l'objectif ont changé depuis. */
  const targetsStale = computed(() => {
    const at = updatedAt.value
    if (!targets.value || targets.value.source === 'manual' || !at.targets) return false
    return [at.body, at.goal].some(date => date !== null && date > at.targets!)
  })

  /** Saisi dans la fiche corporelle, le suivi de poids n'étant pas encore dans Firestore. */
  const currentWeightKg = computed(() => body.value.manualWeightKg)
  const age = computed(() => ageFromBirthDate(body.value.birthDate))
  const bmi = computed(() => bodyMassIndex(currentWeightKg.value, body.value.heightCm))

  /** Le calculateur a besoin du sexe, de l'âge, de la taille et du poids. */
  const isBodyComplete = computed(() => age.value !== null && !!body.value.heightCm && currentWeightKg.value !== null)

  /** Composition et dépense de la fiche, pour projeter l'objectif comme le calculateur ; `null` si la fiche est incomplète. */
  const bodyModel = computed(() => (isBodyComplete.value
    ? resolveBodyModel({
        sex: body.value.sex,
        ageYears: age.value!,
        heightCm: body.value.heightCm!,
        weightKg: currentWeightKg.value!,
        measuredBodyFatPercent: body.value.bodyFatPercent,
        pal: activityPal(body.value.activity),
      })
    : null))

  /** Change le sens de l'objectif ; un pourcentage qui n'est pas proposé pour ce sens reprend celui par défaut. */
  function setGoalDirection(direction: GoalDirection) {
    goal.value.direction = direction
    if (direction === 'maintain') return
    goal.value.calorieDeltaPercent = percentForDirection(direction, goal.value.calorieDeltaPercent)
  }

  return reactive({
    body,
    bodyUpdatedAt,
    goal,
    targets,
    targetsOn,
    goalHistory,
    targetsRevision,
    previousTargets,
    targetsStale,
    currentWeightKg,
    age,
    bmi,
    isBodyComplete,
    bodyModel,
    ready,
    saveBody,
    saveGoal,
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
