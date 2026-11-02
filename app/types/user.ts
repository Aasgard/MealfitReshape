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
  /**
   * Besoins du jour saisis à la main : ils remplacent le calcul (pourcentage et g/kg), et leurs kcal servent aussi à la
   * projection du poids. `null` ou absent : besoins calculés.
   */
  manualTargets?: { calories: number, carbohydrates: number, protein: number, fat: number } | null
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

/**
 * Objectif en vigueur à partir d'un jour (`users.goalHistory`) : l'objectif et les besoins du jour tels qu'ils étaient
 * ce jour-là. `null` : pas encore défini à cette date.
 */
export type UserGoalHistoryEntry = {
  goal: Omit<UserGoal, 'updatedAt'> | null
  targets: Omit<UserTargets, 'updatedAt'> | null
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
  /**
   * Historique des objectifs, par jour d'entrée en vigueur (`yyyy-MM-dd`) : chaque enregistrement de `goal` ou de
   * `targets` y écrit aussi le jour même, si bien qu'un jour passé garde l'objectif qui valait alors. `goal` et
   * `targets` restent l'objectif en cours.
   */
  goalHistory?: Record<string, UserGoalHistoryEntry>
  /** Ancien historique des seuls besoins : lu tant que `goalHistory` n'existe pas, puis repris dedans. */
  targetsByDate?: Record<string, Pick<UserTargets, 'calories' | 'carbohydrates' | 'protein' | 'fat'>>
  /**
   * Foyer du compte : les règles de sécurité y vérifient que lui et le créateur d'un récipient en sont membres. Peut être
   * périmé (compte retiré du foyer) sans rien ouvrir : les règles relisent toujours `memberIds`.
   */
  householdId?: string
}
