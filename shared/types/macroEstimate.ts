/** Estimation d'un repas renvoyée par `POST /api/estimate-macros`, en kcal et en grammes. */
export type MacroEstimate = {
  kcal: number
  proteines: number
  glucides: number
  lipides: number
}
