/** Estimation d'un repas renvoyée par `POST /api/estimate-macros`, en kcal et en grammes. */
export type MacroEstimate = {
  /** Nom court du repas reconnu par Claude. */
  description: string
  /** Détail : aliments et poids estimés, hypothèses de cuisson et de matières grasses. */
  longDescription: string
  kcal: number
  proteines: number
  glucides: number
  lipides: number
}
