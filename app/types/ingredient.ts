/**
 * Représente un ingrédient ou aliment.
 * activeMonths : mois où l'ingrédient est actif / de saison (1-12).
 */
export interface Ingredient {
  /** Mois actifs (1 = janvier, 12 = décembre) */
  activeMonths: number[]
  /** Commentaire ou note sur l'ingrédient */
  comment: string
  /** Nom de l'ingrédient */
  label: string
}
