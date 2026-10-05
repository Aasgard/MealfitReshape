import type { Timestamp } from 'firebase/firestore'

/** Sexe tel que stocké côté Firestore (`users.body.sex`) ; l'app affiche « Homme » / « Femme » (voir `SEX_KEYS`). */
export type SexKey = 'male' | 'female'

/** Niveau d'activité tel que stocké côté Firestore (`users.body.activity`) ; le libellé vient de `ACTIVITY_LEVELS`. */
export type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'very' | 'extreme'

/** Fiche corporelle (`users.body`). L'âge, l'IMC et le poids issu du suivi sont calculés, jamais stockés. */
export type UserBody = {
  sex: SexKey
  /** Format `yyyy-MM-dd` : une date sans heure, pour ne pas glisser d'un jour selon le fuseau. */
  birthDate: string | null
  heightCm: number | null
  /** Utilisé seulement quand le suivi de poids n'a aucune pesée. */
  manualWeightKg: number | null
  bodyFatPercent: number | null
  activity: ActivityKey
  updatedAt?: Timestamp
}

/** Objectif de poids (`users.goal`). Le reste, la durée et la date d'arrivée sont calculés, jamais stockés. */
export type UserGoal = {
  direction: 'loss' | 'maintain' | 'gain'
  targetWeightKg: number | null
  /**
   * Déficit (perte) ou surplus (prise) calorique, en % de la dépense journalière, valeur absolue ; le sens vient de
   * `direction`. Même logique que le calculateur de besoins journaliers (−20 % / +15 %).
   */
  calorieDeltaPercent: number
  /** Protéines visées, en g par kg de poids de corps (une valeur de `PROTEIN_LEVELS`). */
  proteinPerKg: number
  /** Poids auquel appliquer `proteinPerKg` : en surpoids, le poids visé évite de surestimer le besoin. */
  proteinBasis: 'current' | 'target'
  /**
   * Point de départ de l'objectif, pour la progression et la projection du suivi de poids : remis à aujourd'hui
   * (et au poids actuel) quand le sens ou le poids visé change, conservé quand seul le déficit change.
   * Format `yyyy-MM-dd`.
   */
  startDate: string | null
  /** `null` si aucun poids n'était connu au départ. */
  startWeightKg: number | null
  updatedAt?: Timestamp
}

/** Besoins du jour (`users.targets`) : l'objectif quotidien en kcal et en grammes de macros. */
export type UserTargets = {
  calories: number
  carbohydrates: number
  protein: number
  fat: number
  /** Calculés à l'enregistrement de l'objectif du profil, définis depuis le calculateur, ou saisis à la main. */
  source: 'profile' | 'calculator' | 'manual'
  /**
   * Comparé à `body.updatedAt` et `goal.updatedAt` : des besoins calculés (profil ou calculateur) sont « à recalculer »
   * si la fiche ou l'objectif ont changé depuis.
   */
  updatedAt?: Timestamp
}

/** Document `users/{uid}`. */
export type UserDoc = {
  account?: {
    fullName: string | null
    avatar: string | null
  }
  body?: UserBody
  goal?: UserGoal
  targets?: UserTargets
}
