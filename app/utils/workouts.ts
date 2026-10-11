import { isSameDay } from 'date-fns'
import type {
  CircuitItem,
  Exercise,
  ExerciseGroup,
  ExerciseKind,
  ExerciseMetric,
  Workout,
  WorkoutCircuit,
  WorkoutExercise,
  WorkoutSet,
  WorkoutTemplateExercise,
} from '~/types/workout'
import catalog from './exerciseCatalog.json'

export type ExerciseGroupInfo = { key: ExerciseGroup, label: string, kind: ExerciseKind, icon: string }

/** Groupes dans l'ordre d'affichage : groupes musculaires de haut en bas du corps, puis les disciplines d'endurance. */
export const EXERCISE_GROUPS: ExerciseGroupInfo[] = [
  { key: 'chest', label: 'Pectoraux', kind: 'STRENGTH', icon: 'i-lucide-shield' },
  { key: 'back', label: 'Dos', kind: 'STRENGTH', icon: 'i-lucide-panel-top' },
  { key: 'shoulders', label: 'Épaules', kind: 'STRENGTH', icon: 'i-lucide-chevrons-up' },
  { key: 'biceps', label: 'Biceps', kind: 'STRENGTH', icon: 'i-lucide-biceps-flexed' },
  { key: 'triceps', label: 'Triceps', kind: 'STRENGTH', icon: 'i-lucide-arrow-down-to-line' },
  { key: 'quads', label: 'Quadriceps', kind: 'STRENGTH', icon: 'i-lucide-move-down' },
  { key: 'posterior', label: 'Ischios & fessiers', kind: 'STRENGTH', icon: 'i-lucide-move-up' },
  { key: 'calves', label: 'Mollets', kind: 'STRENGTH', icon: 'i-lucide-footprints' },
  { key: 'core', label: 'Abdos & gainage', kind: 'STRENGTH', icon: 'i-lucide-grid-2x2' },
  { key: 'full_body', label: 'Corps entier', kind: 'STRENGTH', icon: 'i-lucide-person-standing' },
  { key: 'running', label: 'Course', kind: 'CARDIO', icon: 'i-lucide-footprints' },
  { key: 'cycling', label: 'Vélo', kind: 'CARDIO', icon: 'i-lucide-bike' },
  { key: 'swimming', label: 'Natation', kind: 'CARDIO', icon: 'i-lucide-waves' },
  { key: 'rowing', label: 'Rameur', kind: 'CARDIO', icon: 'i-lucide-sailboat' },
  { key: 'walking', label: 'Marche & rando', kind: 'CARDIO', icon: 'i-lucide-mountain' },
  { key: 'other_cardio', label: 'Autre cardio', kind: 'CARDIO', icon: 'i-lucide-heart-pulse' },
]

export const GROUP_BY_KEY = Object.fromEntries(EXERCISE_GROUPS.map(g => [g.key, g])) as Record<ExerciseGroup, ExerciseGroupInfo>

export const KIND_LABELS: Record<ExerciseKind, string> = { STRENGTH: 'Muscu', CARDIO: 'Cardio' }

/** Ce qu'on note, dit comme dans le formulaire d'un exercice. */
export const METRIC_OPTIONS: { value: ExerciseMetric, label: string, kind: ExerciseKind }[] = [
  { value: 'WEIGHT_REPS', label: 'Charge × répétitions', kind: 'STRENGTH' },
  { value: 'REPS', label: 'Répétitions (poids du corps)', kind: 'STRENGTH' },
  { value: 'DURATION', label: 'Durée tenue', kind: 'STRENGTH' },
  { value: 'CARDIO', label: 'Durée, distance, dénivelé', kind: 'CARDIO' },
]

/** Disciplines où le dénivelé a un sens. */
const ELEVATION_GROUPS: ExerciseGroup[] = ['running', 'cycling', 'walking']
export const hasElevation = (group: ExerciseGroup) => ELEVATION_GROUPS.includes(group)

/**
 * Catalogue public intégré à l'appli : toujours disponible, même avant tout import dans Firestore. Un document
 * `exercises` de même id (import du catalogue, correction) prend le pas sur lui.
 */
export const BUILTIN_EXERCISES: Exercise[] = (catalog as Omit<Exercise, 'owner'>[]).map(e => ({ ...e, owner: null }))

/** Fusionne le catalogue intégré et les documents Firestore (prioritaires à id égal), triés par groupe puis par nom. */
export function mergeExercises(stored: Exercise[]): Exercise[] {
  const byId = new Map(BUILTIN_EXERCISES.map(e => [e.id, e]))
  for (const exercise of stored) byId.set(exercise.id, exercise)
  const groupOrder = new Map(EXERCISE_GROUPS.map((g, i) => [g.key, i]))
  return [...byId.values()].sort((a, b) =>
    (groupOrder.get(a.group) ?? 99) - (groupOrder.get(b.group) ?? 99) || a.label.localeCompare(b.label, 'fr'))
}

export const newKey = () => Math.random().toString(36).slice(2, 10)

export const emptySet = (): WorkoutSet => ({ reps: null, weightKg: null, durationSec: null, done: false })

/**
 * Nouvel exercice dans une séance. Les séries reprennent la dernière fois qu'il a été fait (mêmes charges, mêmes
 * répétitions, non validées) ; sans historique, `sets` séries vides (ou visant `target`).
 */
export function newWorkoutExercise(
  exercise: Pick<Exercise, 'id' | 'label' | 'group' | 'metric'>,
  { previous, sets = 3, target = null }: { previous?: WorkoutExercise | null, sets?: number, target?: number | null } = {},
): WorkoutExercise {
  const base = { key: newKey(), exerciseId: exercise.id, label: exercise.label, group: exercise.group, metric: exercise.metric }
  if (exercise.metric === 'CARDIO') {
    return { ...base, sets: [], cardio: { durationMin: null, distanceKm: null, elevationM: null } }
  }
  const fromPrevious = previous?.sets.length ? previous.sets.map(s => ({ ...s, done: false })) : null
  const fresh = Array.from({ length: Math.max(1, sets) }, () => ({
    ...emptySet(),
    ...(target !== null ? (exercise.metric === 'DURATION' ? { durationSec: target } : { reps: target }) : {}),
  }))
  return { ...base, sets: fromPrevious ?? fresh, cardio: null }
}

export function templateExerciseFrom(exercise: Pick<Exercise, 'id' | 'label' | 'group' | 'metric'>): WorkoutTemplateExercise {
  return {
    key: newKey(),
    exerciseId: exercise.id,
    label: exercise.label,
    group: exercise.group,
    metric: exercise.metric,
    sets: exercise.metric === 'CARDIO' ? 1 : 3,
    target: exercise.metric === 'DURATION' ? 30 : exercise.metric === 'CARDIO' ? null : 10,
  }
}

/**
 * Une série compte quand sa valeur principale est saisie : les répétitions (la charge est facultative, elle ne sert
 * qu'au volume), ou la durée tenue.
 */
export function isSetFilled(set: WorkoutSet, metric: ExerciseMetric): boolean {
  if (metric === 'DURATION') return !!set.durationSec
  return !!set.reps
}

export const isCardioFilled = (exercise: WorkoutExercise) =>
  !!exercise.cardio && (!!exercise.cardio.durationMin || !!exercise.cardio.distanceKm)

/** Nom affiché d'une séance : le sien, sinon ses groupes (ou sa discipline) dans l'ordre où ils apparaissent. */
export function workoutTitle(workout: Pick<Workout, 'label' | 'exercises'> & { circuits?: WorkoutCircuit[] }): string {
  if (workout.label.trim()) return workout.label.trim()
  // Circuits seuls : le nom du (des) circuit(s).
  if (!workout.exercises.length && workout.circuits?.length) return [...new Set(workout.circuits.map(c => c.label.trim() || 'Circuit'))].join(' · ')
  const cardio = workout.exercises.filter(e => e.metric === 'CARDIO')
  if (cardio.length && cardio.length === workout.exercises.length) return cardio.map(e => e.label).join(' · ')
  const groups = [...new Set(workout.exercises.map(e => GROUP_BY_KEY[e.group]?.label).filter(Boolean))]
  if (!groups.length) return 'Séance'
  return groups.length > 3 ? `${groups.slice(0, 3).join(' · ')}…` : groups.join(' · ')
}

/** Les séries qui comptent : validées pendant une séance en cours, toutes celles remplies sinon. */
export const countedSets = (workout: Pick<Workout, 'status'>, exercise: WorkoutExercise) =>
  exercise.sets.filter(s => (workout.status === 'DONE' || s.done) && isSetFilled(s, exercise.metric))

export type WorkoutStats = {
  sets: number
  /** Tours de circuit terminés. */
  rounds: number
  /** Tonnage soulevé (charge × répétitions), en kg. */
  volumeKg: number
  distanceKm: number
  elevationM: number
  /** Durée des sorties cardio, en minutes. */
  cardioMin: number
}

export function workoutStats(workout: Pick<Workout, 'status' | 'exercises'> & { circuits?: WorkoutCircuit[] }): WorkoutStats {
  const stats: WorkoutStats = { sets: 0, rounds: 0, volumeKg: 0, distanceKm: 0, elevationM: 0, cardioMin: 0 }
  for (const circuit of workout.circuits ?? []) stats.rounds += circuit.roundsDone ?? 0
  for (const exercise of workout.exercises) {
    if (exercise.metric === 'CARDIO') {
      stats.distanceKm += exercise.cardio?.distanceKm ?? 0
      stats.elevationM += exercise.cardio?.elevationM ?? 0
      stats.cardioMin += exercise.cardio?.durationMin ?? 0
      continue
    }
    const sets = countedSets(workout, exercise)
    stats.sets += sets.length
    if (exercise.metric === 'WEIGHT_REPS') {
      stats.volumeKg += sets.reduce((total, s) => total + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
    }
  }
  return stats
}

/** Début du chrono d'une séance en direct, en ms ; `null` tant que « Démarrer » n'a pas été pressé. */
export const workoutStartMillis = (workout: Pick<Workout, 'startedAt' | 'date'>) =>
  workout.startedAt === null ? null : (workout.startedAt ?? workout.date).toMillis()

/** Id de route d'une séance passée pas encore enregistrée (`/dashboard/seances/nouvelle`). */
export const NEW_WORKOUT_ROUTE_ID = 'nouvelle'

/** Séance sans rien dedans (créée puis abandonnée) : ni exercice, ni nom, ni durée, ni kcal, ni note. */
export const isWorkoutEmpty = (w: Pick<Workout, 'exercises' | 'label' | 'kcal' | 'durationMin' | 'note'> & { circuits?: WorkoutCircuit[] }) =>
  !w.exercises.length && !w.circuits?.length && !w.label.trim() && w.kcal === null && w.durationMin === null && !w.note.trim()

export const isCardioWorkout =(workout: Pick<Workout, 'exercises'>) =>
  workout.exercises.length > 0 && workout.exercises.every(e => e.metric === 'CARDIO')

/** Durée d'une séance : la sienne, sinon celle de ses sorties cardio et de ses circuits. */
export function workoutDuration(workout: Pick<Workout, 'durationMin' | 'exercises' | 'status'> & { circuits?: WorkoutCircuit[] }) {
  if (workout.durationMin !== null) return workout.durationMin
  const circuitMin = (workout.circuits ?? []).reduce((total, c) => total + circuitDurationSec(c, c.roundsDone ?? c.rounds) / 60, 0)
  return Math.round(workoutStats(workout).cardioMin + circuitMin) || null
}

// --- Circuits (HIIT) ---

export const DEFAULT_CIRCUIT_WORK_SEC = 40

/** Nouveau circuit, vide : 3 tours, 20 s de repos entre exercices, 1 min entre tours. */
export const newCircuit = (): WorkoutCircuit => ({
  key: newKey(),
  label: 'HIIT',
  rounds: 3,
  restBetweenExercisesSec: 20,
  restBetweenRoundsSec: 60,
  items: [],
})

/** Exercice ajouté à un circuit : le temps d'effort du dernier exercice du circuit, sinon 40 s. */
export const circuitItemFrom = (exercise: Pick<Exercise, 'id' | 'label' | 'group'>, workSec = DEFAULT_CIRCUIT_WORK_SEC): CircuitItem => ({
  key: newKey(),
  exerciseId: exercise.id,
  label: exercise.label,
  group: exercise.group,
  workSec,
})

/**
 * Durée d'un circuit de `rounds` tours, en secondes : les efforts, un repos entre deux exercices d'un tour, un grand
 * repos entre deux tours (pas après le dernier).
 */
export function circuitDurationSec(circuit: Pick<WorkoutCircuit, 'items' | 'restBetweenExercisesSec' | 'restBetweenRoundsSec'>, rounds: number): number {
  if (!circuit.items.length || rounds <= 0) return 0
  const work = circuit.items.reduce((total, item) => total + item.workSec, 0)
  const rests = (circuit.items.length - 1) * circuit.restBetweenExercisesSec
  return rounds * (work + rests) + (rounds - 1) * circuit.restBetweenRoundsSec
}

export type CircuitStep =
  | { kind: 'work', round: number, itemIndex: number, durationSec: number }
  | { kind: 'rest', round: number, itemIndex: number, durationSec: number }
  | { kind: 'roundRest', round: number, itemIndex: number, durationSec: number }

/**
 * Étapes du minuteur, dans l'ordre : effort, repos, effort… puis grand repos entre deux tours. `itemIndex` d'un repos
 * est celui de l'exercice qui vient de se terminer (pour noter ses répétitions). Les repos à 0 s sont sautés.
 */
export function circuitSteps(circuit: WorkoutCircuit): CircuitStep[] {
  const steps: CircuitStep[] = []
  for (let round = 0; round < circuit.rounds; round++) {
    circuit.items.forEach((item, itemIndex) => {
      steps.push({ kind: 'work', round, itemIndex, durationSec: item.workSec })
      const isLastItem = itemIndex === circuit.items.length - 1
      if (!isLastItem && circuit.restBetweenExercisesSec > 0) {
        steps.push({ kind: 'rest', round, itemIndex, durationSec: circuit.restBetweenExercisesSec })
      }
      if (isLastItem && round < circuit.rounds - 1 && circuit.restBetweenRoundsSec > 0) {
        steps.push({ kind: 'roundRest', round, itemIndex, durationSec: circuit.restBetweenRoundsSec })
      }
    })
  }
  return steps
}

/** Répétitions d'un exercice de circuit, alignées sur le nombre de tours. */
export const itemReps = (item: CircuitItem, rounds: number): (number | null)[] =>
  Array.from({ length: rounds }, (_, round) => item.reps?.[round] ?? null)

/** « 40 s », « 1 min », « 1 min 30 ». */
export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} min ${String(rest).padStart(2, '0')}` : `${m} min`
}

/**
 * Ligne de détail d'une séance (journal, accueil) : distance et allure pour une sortie cardio, exercices, séries et
 * volume pour la muscu, puis chaque circuit.
 */
export function workoutMeta(workout: Workout): string {
  const parts: string[] = []
  if (isCardioWorkout(workout)) {
    const cardio = workout.exercises[0]!
    parts.push(...[formatCardio(cardio), formatPace(cardio)].filter((p): p is string => !!p))
  }
  else if (workout.exercises.length) {
    const stats = workoutStats(workout)
    const volume = stats.volumeKg ? formatVolume(stats.volumeKg) : null
    const n = workout.exercises.length
    parts.push(`${n} exercice${n > 1 ? 's' : ''}`)
    if (stats.sets) parts.push(`${stats.sets} séries`)
    if (volume) parts.push(`${volume.value} ${volume.unit}`)
    if (stats.distanceKm) parts.push(`${formatDecimal(stats.distanceKm, 2)} km`)
  }
  for (const circuit of workout.circuits ?? []) parts.push(circuitSummary(circuit))
  return parts.join(' · ') || '—'
}

/** Une ligne pour un circuit : « HIIT · 5 exos · 4 tours » (tours faits sur prévus dans une séance). */
export function circuitSummary(circuit: WorkoutCircuit): string {
  const n = circuit.items.length
  const rounds = circuit.roundsDone !== undefined && circuit.roundsDone < circuit.rounds
    ? `${circuit.roundsDone}/${circuit.rounds} tours`
    : `${circuit.rounds} tour${circuit.rounds > 1 ? 's' : ''}`
  return `${circuit.label.trim() || 'Circuit'} · ${n} exo${n > 1 ? 's' : ''} · ${rounds}`
}

/** Dernière séance terminée (avant `before`, hors `excludeId`) où l'exercice a été fait, avec ses séries. */
export function lastPerformance(
  workouts: Workout[],
  exerciseId: string,
  { before, excludeId }: { before?: number, excludeId?: string } = {},
): { workout: Workout, exercise: WorkoutExercise } | null {
  let best: { workout: Workout, exercise: WorkoutExercise } | null = null
  for (const workout of workouts) {
    if (workout.status !== 'DONE' || workout.id === excludeId) continue
    const millis = workout.date.toMillis()
    if (before !== undefined && millis >= before) continue
    if (best && best.workout.date.toMillis() >= millis) continue
    const exercise = workout.exercises.find(e => e.exerciseId === exerciseId
      && (e.metric === 'CARDIO' ? isCardioFilled(e) : e.sets.some(s => isSetFilled(s, e.metric))))
    if (exercise) best = { workout, exercise }
  }
  return best
}

/** Kcal dépensées un jour donné (séances terminées ou en cours) ; `null` si aucune séance n'en renseigne. */
export function kcalBurnedOn(workouts: Workout[], day: Date): number | null {
  const ofDay = workouts.filter(w => isSameDay(w.date.toDate(), day) && w.kcal !== null)
  return ofDay.length ? ofDay.reduce((total, w) => total + (w.kcal ?? 0), 0) : null
}

// --- Formats ---

export const formatDecimal = (value: number, maximumFractionDigits = 1) =>
  value.toLocaleString('fr-FR', { maximumFractionDigits })

/** « 45 min », « 1 h », « 1 h 05 ». */
export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** Chrono : « 4:07 », « 1:02:09 ». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** « 1,2 t » au-delà d'une tonne, sinon « 850 kg ». */
export function formatVolume(kg: number): { value: string, unit: string } {
  return kg >= 1000 ? { value: formatDecimal(kg / 1000, 1), unit: 't' } : { value: formatDecimal(kg, 0), unit: 'kg' }
}

/** Une série en une ligne : « 10 × 42,5 kg », « 12 rép. », « 45 s ». */
export function formatSet(set: WorkoutSet, metric: ExerciseMetric): string {
  if (metric === 'DURATION') return set.durationSec ? `${set.durationSec} s` : '—'
  if (metric === 'REPS') return set.reps ? `${set.reps} rép.` : '—'
  if (!set.reps) return '—'
  return set.weightKg ? `${set.reps} × ${formatDecimal(set.weightKg, 2)} kg` : `${set.reps} rép.`
}

/** Résumé d'un exercice fait : séries identiques regroupées (« 3 × 10 × 40 kg »), sinon listées. */
export function formatSets(sets: WorkoutSet[], metric: ExerciseMetric): string {
  const filled = sets.filter(s => isSetFilled(s, metric))
  if (!filled.length) return '—'
  const labels = filled.map(s => formatSet(s, metric))
  if (labels.every(l => l === labels[0])) return filled.length > 1 ? `${filled.length} × ${labels[0]}` : labels[0]!
  return labels.join(' · ')
}

export function formatCardio(exercise: WorkoutExercise): string {
  const c = exercise.cardio
  if (!c) return '—'
  const parts = [
    c.distanceKm ? `${formatDecimal(c.distanceKm, 2)} km` : null,
    c.durationMin ? formatMinutes(c.durationMin) : null,
    c.elevationM && hasElevation(exercise.group) ? `${formatDecimal(c.elevationM, 0)} m D+` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}

/** Allure en min/km (course, marche) ou vitesse en km/h (vélo, autres). */
export function formatPace(exercise: WorkoutExercise): string | null {
  const c = exercise.cardio
  if (!c?.durationMin || !c.distanceKm) return null
  if (exercise.group === 'running' || exercise.group === 'walking') {
    const secPerKm = (c.durationMin * 60) / c.distanceKm
    return `${formatClock(secPerKm)} /km`
  }
  return `${formatDecimal(c.distanceKm / (c.durationMin / 60), 1)} km/h`
}

/**
 * Classes d'un champ de nom (séance, programme, circuit, exercice) déclaré en `type="search"` : Android ne propose pas
 * sa barre de remplissage automatique (mots de passe, clés) au-dessus du clavier sur un champ de recherche, alors qu'il
 * le fait sur un champ texte malgré `autocomplete="off"`. On retire la croix d'effacement que Chrome y ajoute.
 */
export const NAME_FIELD_BASE = '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none'

/**
 * Programme tiré d'une séance (« Enregistrer comme programme ») : ses exercices avec leur nombre de séries et les
 * répétitions (ou secondes) de la première, et ses circuits avec leurs réglages, sans ce qui a été fait.
 */
export function templateInputFromWorkout(workout: Pick<Workout, 'label' | 'exercises' | 'circuits'>) {
  return {
    label: workoutTitle(workout),
    exercises: workout.exercises.map(e => ({
      key: newKey(),
      exerciseId: e.exerciseId,
      label: e.label,
      group: e.group,
      metric: e.metric,
      sets: e.metric === 'CARDIO' ? 1 : Math.max(1, e.sets.length),
      target: e.metric === 'DURATION' ? e.sets[0]?.durationSec ?? null : e.metric === 'CARDIO' ? null : e.sets[0]?.reps ?? null,
    })),
    circuits: workout.circuits.map(({ roundsDone: _done, ...c }) => ({
      ...c,
      key: newKey(),
      items: c.items.map(({ reps: _reps, ...item }) => ({ ...item, key: newKey() })),
    })),
  }
}
