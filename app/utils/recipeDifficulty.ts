/** Niveau de difficulté d'une recette, stocké tel quel côté Firestore (`recipes.difficulty`). */
export type RecipeDifficulty = 'EASY' | 'MEDIUM' | 'HIGH'

export const RECIPE_DIFFICULTIES: RecipeDifficulty[] = ['EASY', 'MEDIUM', 'HIGH']

const RECIPE_DIFFICULTY_LABELS: Record<RecipeDifficulty, string> = {
  EASY: 'Facile',
  MEDIUM: 'Moyen',
  HIGH: 'Difficile',
}

const RECIPE_DIFFICULTY_COLORS: Record<RecipeDifficulty, 'success' | 'warning' | 'error'> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HIGH: 'error',
}

/** Alias tolérés pour d'anciennes valeurs de test (ex. "HARD" vu dans Firestore avant adoption de l'enum). */
const RECIPE_DIFFICULTY_ALIASES: Record<string, RecipeDifficulty> = {
  HARD: 'HIGH',
}

function normalize(difficulty: string | undefined | null): RecipeDifficulty | null {
  if (!difficulty) return null
  const upper = difficulty.toUpperCase()
  if ((RECIPE_DIFFICULTIES as string[]).includes(upper)) return upper as RecipeDifficulty
  return RECIPE_DIFFICULTY_ALIASES[upper] ?? null
}

export function recipeDifficultyLabel(difficulty: string | undefined | null): string {
  if (!difficulty) return 'Aucune difficulté'
  const normalized = normalize(difficulty)
  return normalized ? RECIPE_DIFFICULTY_LABELS[normalized] : difficulty
}

export function recipeDifficultyColor(difficulty: string | undefined | null): 'success' | 'warning' | 'error' | 'neutral' {
  const normalized = normalize(difficulty)
  return normalized ? RECIPE_DIFFICULTY_COLORS[normalized] : 'neutral'
}
