import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Workout, WorkoutCircuit, WorkoutExercise, WorkoutTemplate } from '~/types/workout'

export type WorkoutPatch = Partial<Pick<Workout, 'label' | 'date' | 'status' | 'durationMin' | 'kcal' | 'note' | 'exercises'>>

/**
 * Séances de l'utilisateur connecté (collection Firestore `workouts`) et écritures associées.
 * Toutes ses séances sont lues (égalité sur `user`, sans index composite) : quelques centaines au plus, et la
 * « dernière fois » d'un exercice comme le journal ont besoin de l'historique. Tri du plus récent au plus ancien.
 */
export const useWorkouts = () => {
  const db = useFirestore()
  const user = useCurrentUser()

  const stored = useCollection<Workout>(() =>
    user.value ? query(collection(db, 'workouts'), where('user', '==', user.value.uid)) : null)

  /**
   * Un document sans date ni exercices (écriture interrompue) est ignoré plutôt que de casser la page.
   * L'`id` est recopié à part : VueFire le pose en propriété non énumérable, que la décomposition `...w` perdrait.
   */
  const workouts = computed(() => stored.value
    .filter(w => w.date && typeof w.date.toMillis === 'function' && Array.isArray(w.exercises))
    .map(w => ({ ...w, id: w.id, label: w.label ?? '', note: w.note ?? '', kcal: w.kcal ?? null, durationMin: w.durationMin ?? null, templateId: w.templateId ?? null, circuits: Array.isArray(w.circuits) ? w.circuits : [] }))
    .sort((a, b) => b.date.toMillis() - a.date.toMillis()))

  const inProgress = computed(() => workouts.value.find(w => w.status === 'IN_PROGRESS') ?? null)

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  /**
   * Crée une séance et renvoie son id. `live` : séance en direct qui démarre maintenant ; sinon une séance passée,
   * saisie après coup, au jour `date`. `id` (voir `newWorkoutId`) : id réservé avant l'écriture, connu de l'appelant avant
   * que la séance n'apparaisse dans la liste (l'écriture locale la montre avant que la promesse ne se résolve).
   */
  const createWorkout = async ({ id = newWorkoutId(), live, date, label = '', exercises = [], circuits = [], templateId = null }: {
    id?: string
    live: boolean
    date?: Date
    label?: string
    exercises?: WorkoutExercise[]
    circuits?: WorkoutCircuit[]
    templateId?: string | null
  }) => {
    await setDoc(doc(db, 'workouts', id), {
      user: requireUid(),
      visibility: 'private',
      label,
      date: Timestamp.fromDate(date ?? new Date()),
      status: live ? 'IN_PROGRESS' : 'DONE',
      // Le chrono ne part qu'avec « Démarrer ».
      startedAt: null,
      templateId,
      durationMin: null,
      kcal: null,
      note: '',
      exercises,
      circuits,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return id
  }

  /** Id d'une nouvelle séance, réservé sans rien écrire. */
  const newWorkoutId = () => doc(collection(db, 'workouts')).id

  const updateWorkout = (id: string, patch: WorkoutPatch) =>
    updateDoc(doc(db, 'workouts', id), { ...patch, updatedAt: serverTimestamp() })

  /**
   * Écrit la séance entière à son id : la crée si elle n'existe pas encore (séance passée, créée seulement à
   * l'enregistrement), la remplace sinon. Ne dépend pas de l'existence du document, contrairement à `updateWorkout`.
   */
  const saveWorkout = (workout: Workout) =>
    setDoc(doc(db, 'workouts', workout.id), {
      user: workout.user || requireUid(),
      visibility: workout.visibility ?? 'private',
      label: workout.label,
      date: workout.date,
      status: workout.status,
      // Absent sur une séance d'avant ce champ : on le laisse absent (son chrono part de `date`).
      ...(workout.startedAt !== undefined ? { startedAt: workout.startedAt } : {}),
      templateId: workout.templateId ?? null,
      durationMin: workout.durationMin,
      kcal: workout.kcal,
      note: workout.note,
      exercises: workout.exercises,
      circuits: workout.circuits ?? [],
      createdAt: workout.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

  /** Séance passée pas encore enregistrée : en mémoire seulement, rien n'est écrit avant « Enregistrer ». */
  const draftWorkout = (date = new Date()): Workout => ({
    id: newWorkoutId(),
    user: requireUid(),
    visibility: 'private',
    label: '',
    date: Timestamp.fromDate(date),
    status: 'DONE',
    templateId: null,
    durationMin: null,
    kcal: null,
    note: '',
    exercises: [],
    circuits: [],
  })

  const deleteWorkout = (id: string) => deleteDoc(doc(db, 'workouts', id))

  /** Séance pré-remplie depuis un programme : séries reprises de la dernière fois, sinon celles du programme. */
  /** Circuits d'un programme pour une séance : mêmes réglages, répétitions à noter, aucun tour fait. */
  const circuitsFromTemplate = (template: WorkoutTemplate): WorkoutCircuit[] =>
    (template.circuits ?? []).map(c => ({
      ...c,
      key: newKey(),
      roundsDone: 0,
      items: c.items.map(item => ({ ...item, key: newKey(), reps: Array.from({ length: c.rounds }, () => null) })),
    }))

  const exercisesFromTemplate = (template: WorkoutTemplate): WorkoutExercise[] =>
    template.exercises.map(e => newWorkoutExercise(
      { id: e.exerciseId, label: e.label, group: e.group, metric: e.metric },
      { previous: lastPerformance(workouts.value, e.exerciseId)?.exercise, sets: e.sets, target: e.target },
    ))

  return {
    workouts,
    inProgress,
    pending: stored.pending,
    error: stored.error,
    promise: stored.promise,
    newWorkoutId,
    createWorkout,
    updateWorkout,
    saveWorkout,
    draftWorkout,
    deleteWorkout,
    exercisesFromTemplate,
    circuitsFromTemplate,
  }
}
