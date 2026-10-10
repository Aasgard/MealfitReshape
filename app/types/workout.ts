import type { Timestamp } from 'firebase/firestore'

/** Famille d'un exercice, stockée telle quelle côté Firestore (`exercises.kind`). */
export type ExerciseKind = 'STRENGTH' | 'CARDIO'

/**
 * Ce qu'on note à chaque série (`exercises.metric`) : charge × répétitions, répétitions au poids du corps, durée tenue
 * (gainage), ou une sortie d'endurance (durée, distance, dénivelé) sans séries.
 */
export type ExerciseMetric = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'CARDIO'

/** Groupe d'un exercice : groupe musculaire pour la muscu, discipline pour le cardio (`exercises.group`). */
export type ExerciseGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'posterior' | 'calves' | 'core' | 'full_body'
  | 'running' | 'cycling' | 'swimming' | 'rowing' | 'walking' | 'other_cardio'

/** Partage d'une séance ou d'un programme : privé pour l'instant, prévu pour être partagé au cercle plus tard. */
export type WorkoutVisibility = 'private'

/**
 * Un exercice de la collection Firestore `exercises`, ou du catalogue intégré à l'appli.
 * Comme les ingrédients : `owner` à `null` pour un exercice public, l'uid de son auteur pour un exercice perso.
 */
export type Exercise = {
  id: string
  label: string
  kind: ExerciseKind
  group: ExerciseGroup
  metric: ExerciseMetric
  owner: string | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

/** Une série. Seuls les champs de la mesure de l'exercice sont renseignés ; `null` = pas encore saisi. */
export type WorkoutSet = {
  reps: number | null
  weightKg: number | null
  durationSec: number | null
  /** Validée pendant une séance en direct ; toujours vraie dans une séance terminée. */
  done: boolean
}

/** Une sortie d'endurance (exercice `CARDIO`). */
export type WorkoutCardio = {
  durationMin: number | null
  distanceKm: number | null
  elevationM: number | null
}

/** Un exercice dans une séance. Libellé, groupe et mesure sont copiés : la séance reste lisible si l'exercice change ou disparaît. */
export type WorkoutExercise = {
  /** Identifie la ligne dans la séance (un même exercice peut revenir deux fois). */
  key: string
  exerciseId: string
  label: string
  group: ExerciseGroup
  metric: ExerciseMetric
  sets: WorkoutSet[]
  cardio: WorkoutCardio | null
}

/** Un exercice d'un circuit (HIIT) : un temps d'effort, et dans une séance les répétitions faites à chaque tour. */
export type CircuitItem = {
  key: string
  exerciseId: string
  label: string
  group: ExerciseGroup
  /** Temps d'effort, en secondes. */
  workSec: number
  /** Répétitions faites, une valeur par tour (`null` = non notée). Absent dans un programme. */
  reps?: (number | null)[]
}

/**
 * Un circuit (HIIT) : les exercices s'enchaînent, chacun pendant son temps d'effort, séparés par un repos, et le tout
 * se répète `rounds` fois avec un repos plus long entre deux tours.
 */
export type WorkoutCircuit = {
  key: string
  /** Nom du bloc (« HIIT », « Finisher »…). */
  label: string
  rounds: number
  restBetweenExercisesSec: number
  restBetweenRoundsSec: number
  items: CircuitItem[]
  /** Tours terminés (minuteur ou saisie) ; absent dans un programme. */
  roundsDone?: number
}

export type WorkoutStatus = 'IN_PROGRESS' | 'DONE'

/**
 * Une séance de la collection Firestore `workouts`.
 * En lecture depuis VueFire, chaque document a aussi un `id`.
 */
export type Workout = {
  id: string
  /** Utilisateur auquel la séance est rattachée (uid). */
  user: string
  visibility: WorkoutVisibility
  /** Nom donné à la séance ; vide = déduit des exercices. */
  label: string
  /** Début de la séance (jour et heure, heure locale). */
  date: Timestamp
  status: WorkoutStatus
  /**
   * Séance en direct : moment où « Démarrer » a lancé le chrono ; `null` tant qu'elle n'est pas démarrée.
   * Absent sur les séances d'avant ce champ, dont le chrono partait de `date`.
   */
  startedAt?: Timestamp | null
  /** Programme d'où vient la séance, s'il y en a un. */
  templateId: string | null
  /** Durée totale en minutes ; `null` tant qu'elle n'est pas connue. */
  durationMin: number | null
  /** Kcal dépensées, saisies à la main (montre, Strava) ; `null` = non renseignées. */
  kcal: number | null
  note: string
  exercises: WorkoutExercise[]
  /** Circuits (HIIT), affichés après les exercices. Absent sur les séances d'avant les circuits (lu comme `[]`). */
  circuits: WorkoutCircuit[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

/** Un exercice d'un programme : ce qu'on prévoit d'en faire. */
export type WorkoutTemplateExercise = {
  key: string
  exerciseId: string
  label: string
  group: ExerciseGroup
  metric: ExerciseMetric
  /** Nombre de séries prévues (ignoré pour le cardio). */
  sets: number
  /** Répétitions (ou secondes pour une mesure `DURATION`) visées par série ; `null` = libre. */
  target: number | null
}

/** Un programme (séance-type) de la collection Firestore `workoutTemplates`. */
export type WorkoutTemplate = {
  id: string
  user: string
  visibility: WorkoutVisibility
  label: string
  exercises: WorkoutTemplateExercise[]
  /** Circuits (HIIT), après les exercices ; sans `reps` ni `roundsDone`. Absent sur les programmes d'avant les circuits. */
  circuits?: WorkoutCircuit[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
