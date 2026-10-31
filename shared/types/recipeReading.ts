/**
 * Échanges de `POST /api/read-recipe` : lecture d'une recette sur une ou plusieurs photos (page de livre, capture
 * d'écran) et rapprochement de ses ingrédients avec le catalogue envoyé par le navigateur.
 */

/** Ingrédient du catalogue tel que le navigateur l'envoie : de quoi le reconnaître et choisir une unité. */
export type CatalogIngredient = {
  id: string
  label: string
  units: { id: string; label: string; value: number; unit: 'g' | 'ml' }[]
}

export type CatalogCategory = { id: string; label: string }

/** Ingrédient absent du catalogue, tel que Claude propose de le créer (valeurs pour 100 g estimées). */
export type ProposedIngredient = {
  label: string
  /** Id d'une catégorie envoyée ; vide si aucune ne convient. */
  categoryId: string
  calories: number
  protein: number
  carbohydrates: number
  fat: number
  /** Unité de la recette à ajouter à l'ingrédient (« gousse ») ; `null` si la recette compte en grammes ou millilitres. */
  unit: { label: string; value: number; unit: 'g' | 'ml' } | null
}

/**
 * Ligne d'ingrédient lue.
 * - `matched` : ingrédient et unité trouvés, quantité reprise telle quelle ;
 * - `check` : ingrédient trouvé, mais la quantité repose sur une hypothèse (conversion, quantité non précisée) ;
 * - `unmatched` : aucun ingrédient du catalogue ne correspond, `proposal` décrit celui à créer.
 */
export type ReadIngredientLine = {
  /** Texte tel qu'écrit sur la page, ex. « 2 c. à soupe d'huile d'olive ». */
  text: string
  status: 'matched' | 'check' | 'unmatched'
  /** Pourquoi vérifier, ex. « 1 verre compté 200 g » ; vide sinon. */
  note: string
  /** Id d'un ingrédient du catalogue ; `null` pour une ligne `unmatched`. */
  ingredientId: string | null
  /** Id d'une unité de l'ingrédient ; `null` = quantité en grammes. */
  unitId: string | null
  /** Quantité dans `unitId` (ou en grammes) ; pour une ligne `unmatched`, dans l'unité proposée si elle existe. */
  quantity: number
  /** Équivalent approximatif en grammes, pour repasser en grammes quand l'unité n'existe pas. */
  grams: number
  proposal: ProposedIngredient | null
}

/** Cadre de la photo du plat fini dans l'une des photos envoyées, en fractions (0 → 1) de sa largeur et de sa hauteur. */
export type DishImageBox = {
  photoIndex: number
  x: number
  y: number
  width: number
  height: number
}

export type RecipeReading = {
  title: string
  persons: number | null
  prepTime: number | null
  cookTime: number | null
  instructions: string
  /** Livre, magazine, site ou compte lisible sur la page ; vide sinon. */
  source: string
  ingredients: ReadIngredientLine[]
  dishImage: DishImageBox | null
}
