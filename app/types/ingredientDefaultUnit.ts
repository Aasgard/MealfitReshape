export interface IngredientDefaultUnit {
  id: string
  label: string
  unit: 'g' | 'ml'
  /** `null` : pas de valeur par défaut, à saisir par l'utilisateur */
  value: number | null
}
