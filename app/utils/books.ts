import type { Book } from '~/types/book'
import type { Recipe } from '~/types/recipe'
import { normalizeForSearch } from '~/utils/search'

export const BOOK_TITLE_MAX = 160
export const BOOK_PAGE_MAX = 12

// --- ISBN ---

/** Somme de contrôle EAN-13 : un ISBN-13 n'en est un que si son dernier chiffre la respecte. */
function hasValidEanChecksum(digits: string) {
  const sum = [...digits.slice(0, 12)].reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === Number(digits[12])
}

/** Vrai si le code lu au dos d'un livre est un ISBN-13 (EAN-13 en 978 ou 979, somme de contrôle juste). */
export const isIsbn13 = (code: string) => /^97[89]\d{10}$/.test(code) && hasValidEanChecksum(code)

/**
 * ISBN-13 d'une saisie (tirets, espaces, ancien ISBN-10 à 9 chiffres + clé, X compris), ou `null` si ce n'est pas un
 * ISBN valide.
 */
export function normalizeIsbn(input: string): string | null {
  const raw = input.replace(/[\s-]/g, '').toUpperCase()
  if (/^\d{13}$/.test(raw)) return isIsbn13(raw) ? raw : null
  if (!/^\d{9}[\dX]$/.test(raw)) return null
  const sum = [...raw].reduce((total, c, i) => total + (c === 'X' ? 10 : Number(c)) * (10 - i), 0)
  if (sum % 11 !== 0) return null
  const body = `978${raw.slice(0, 9)}`
  const check = (10 - ([...body].reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10
  return `${body}${check}`
}

/** ISBN affiché en trois blocs (préfixe, corps, clé) : sans la table des éditeurs, on ne sait pas le découper davantage. */
export const formatIsbn = (isbn: string) => `${isbn.slice(0, 3)} ${isbn.slice(3, 12)} ${isbn.slice(12)}`

// --- Titres et sources ---

/** Clé de comparaison d'un titre : sans accents, majuscules, ponctuation ni article initial. */
export function bookTitleKey(title: string) {
  return normalizeForSearch(title)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^(le|la|les|l|un|une|des|the)\s+/, '')
    .trim()
}

export const bookAuthorsLabel = (book: Pick<Book, 'authors'>) => book.authors.join(', ')

/** Vrai si le livre correspond à la recherche (titre ou auteurs). */
export const bookMatchesSearch = (book: Book, query: string) => {
  const q = normalizeForSearch(query)
  return !q || normalizeForSearch(`${book.title} ${book.authors.join(' ')}`).includes(q)
}

/** « p. 42 », « p. 42-43 » ; vide sans page. */
export const formatBookPage = (page: string | undefined) => (page ? `p. ${page}` : '')

/** Source affichée d'une recette rattachée : « Titre, p. 42 ». */
export const bookSourceLabel = (book: Pick<Book, 'title'>, page?: string) =>
  page ? `${book.title}, ${formatBookPage(page)}` : book.title

/** Page nettoyée d'une saisie : « p.42 » → « 42 », « 42 - 43 » → « 42-43 ». */
export function cleanBookPage(input: string) {
  return input
    .trim()
    .replace(/^p(?:ages?|p)?\.?\s*/i, '')
    .replace(/\s*[-–à]\s*/g, '-')
    .slice(0, BOOK_PAGE_MAX)
}

/** Premier nombre de la page, pour trier un sommaire ; `Infinity` sans page lisible (en fin de liste). */
export function bookPageOrder(page: string | undefined) {
  const n = Number.parseInt(page ?? '', 10)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/** Recettes d'un livre dans l'ordre du livre : par page, puis sans page, par titre. */
export const sortByBookPage = (recipes: Recipe[]) => [...recipes].sort((a, b) =>
  bookPageOrder(a.bookPage) - bookPageOrder(b.bookPage) || a.title.localeCompare(b.title, 'fr'))

const PAGE_SUFFIX = /[\s,;:–—-]*\(?\s*\b(?:p(?:ages?|p)?\.?|page)\s*(\d+(?:\s*[-–à]\s*\d+)?)\s*\)?\s*$/i
const LINK = /^(?:https?:\/\/|www\.)|\.(?:com|fr|net|org|io)(?:\/|$)/i

/** Sépare le titre et la page d'une source en texte libre : « Simplissime, p. 42 » → titre « Simplissime », page « 42 ». */
export function splitSourcePage(source: string): { title: string, page: string } {
  const match = source.match(PAGE_SUFFIX)
  if (!match) return { title: source.trim(), page: '' }
  return { title: source.slice(0, match.index).trim(), page: cleanBookPage(match[1]!) }
}

/** Source qui pourrait être un livre : ni un lien, ni un texte vide. */
export const isBookLikeSource = (source: string | undefined) => !!source?.trim() && !LINK.test(source.trim())

/** Livre de la bibliothèque dont le titre correspond à un texte lu ou saisi (titre égal, ou l'un contenant l'autre). */
export function matchBookByTitle(title: string, books: Book[]): Book | undefined {
  const key = bookTitleKey(title)
  if (!key) return undefined
  const exact = books.find(b => bookTitleKey(b.title) === key)
  if (exact) return exact
  // « Ottolenghi Simple » ↔ « Simple » : on n'accepte l'inclusion qu'au-delà d'un mot court, et seulement si elle est unique.
  const partial = books.filter((b) => {
    const bookKey = bookTitleKey(b.title)
    return bookKey.length >= 5 && key.length >= 5 && (bookKey.includes(key) || key.includes(bookKey))
  })
  return partial.length === 1 ? partial[0] : undefined
}

/** Sources en texte libre d'un même livre supposé, à rattacher d'un coup. */
export interface LegacySourceGroup {
  key: string
  /** Titre tel qu'écrit le plus souvent. */
  title: string
  recipes: { recipe: Recipe, page: string }[]
  /** Livre de la bibliothèque qui semble correspondre. */
  match?: Book
}

/**
 * Regroupe les recettes sans livre dont la source ressemble à un titre de livre (« Simplissime », « simplissime
 * p.12 ») ; les liens sont laissés de côté. Les groupes les plus fournis viennent en premier.
 */
export function groupLegacySources(recipes: Recipe[], books: Book[]): LegacySourceGroup[] {
  const groups = new Map<string, { titles: Map<string, number>, recipes: LegacySourceGroup['recipes'] }>()
  for (const recipe of recipes) {
    if (recipe.bookId || !isBookLikeSource(recipe.source)) continue
    const { title, page } = splitSourcePage(recipe.source!)
    const key = bookTitleKey(title)
    if (!key) continue
    const group = groups.get(key) ?? { titles: new Map<string, number>(), recipes: [] as LegacySourceGroup['recipes'] }
    group.titles.set(title, (group.titles.get(title) ?? 0) + 1)
    group.recipes.push({ recipe, page })
    groups.set(key, group)
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const title = [...group.titles.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      return {
        key,
        title,
        recipes: group.recipes.sort((a, b) => bookPageOrder(a.page) - bookPageOrder(b.page)),
        match: matchBookByTitle(title, books),
      }
    })
    .sort((a, b) => b.recipes.length - a.recipes.length || a.title.localeCompare(b.title, 'fr'))
}

// --- Couverture typographique ---

/** Teinte stable d'un livre sans couverture, tirée de son ISBN (ou de son id) : un même livre garde sa couleur. */
export function bookHue(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}
