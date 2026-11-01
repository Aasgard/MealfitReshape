import type { BookFields } from '~/types/book'

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes'
const OPEN_LIBRARY_URL = 'https://openlibrary.org/api/books'

/** Fiche d'un livre trouvée par son ISBN ; aucune notion de cuisine ici, la recherche vaut pour tout livre. */
export type IsbnBook = Required<Pick<BookFields, 'title' | 'authors'>> & Pick<BookFields, 'publisher' | 'year' | 'coverUrl'>

export type IsbnLookupState =
  | { kind: 'idle' }
  | { kind: 'loading', isbn: string }
  | { kind: 'error', isbn: string }
  /** `book` : `null` si aucun des deux services ne connaît cet ISBN. */
  | { kind: 'done', isbn: string, book: IsbnBook | null }

const yearOf = (date: unknown) => {
  const year = Number.parseInt(String(date ?? '').match(/\d{4}/)?.[0] ?? '', 10)
  return Number.isFinite(year) ? year : undefined
}

/** Titre et sous-titre, sans la mention d'édition qu'Open Library ajoute parfois (« (French Edition) »). */
const joinTitle = (title: unknown, subtitle: unknown) =>
  [title, subtitle]
    .filter(part => typeof part === 'string' && part.trim())
    .map(part => (part as string).replace(/\s*\((?:French|English) Edition\)\s*$/i, '').trim())
    .join(' : ')

const uniqueNames = (names: unknown[]) => [...new Set(names.filter((n): n is string => typeof n === 'string' && !!n.trim()).map(n => n.trim()))]

/** Google Books : la meilleure couverture des livres français ; vignette en https, sans l'effet « page cornée ». */
async function fromGoogleBooks(isbn: string, key: string, signal: AbortSignal): Promise<IsbnBook | null> {
  const response = await fetch(`${GOOGLE_BOOKS_URL}?q=isbn:${isbn}&maxResults=1${key ? `&key=${encodeURIComponent(key)}` : ''}`, { signal })
  if (!response.ok) throw new Error(`Google Books ${response.status}`)
  const data = await response.json() as { items?: { volumeInfo?: Record<string, any> }[] }
  const info = data.items?.[0]?.volumeInfo
  const title = joinTitle(info?.title, info?.subtitle)
  if (!info || !title) return null
  const thumbnail: string | undefined = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail
  return {
    title,
    authors: Array.isArray(info.authors) ? uniqueNames(info.authors) : [],
    publisher: typeof info.publisher === 'string' ? info.publisher : undefined,
    year: yearOf(info.publishedDate),
    coverUrl: thumbnail?.replace(/^http:/, 'https:').replace(/&edge=curl/, ''),
  }
}

/** Open Library : en secours, et pour la couverture quand Google Books n'en a pas. */
async function fromOpenLibrary(isbn: string, signal: AbortSignal): Promise<IsbnBook | null> {
  const response = await fetch(`${OPEN_LIBRARY_URL}?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { signal })
  if (!response.ok) throw new Error(`Open Library ${response.status}`)
  const data = await response.json() as Record<string, Record<string, any>>
  const info = data[`ISBN:${isbn}`]
  const title = joinTitle(info?.title, info?.subtitle)
  if (!info || !title) return null
  return {
    title,
    authors: Array.isArray(info.authors) ? uniqueNames(info.authors.map((a: any) => a?.name)) : [],
    publisher: typeof info.publishers?.[0]?.name === 'string' ? info.publishers[0].name : undefined,
    year: yearOf(info.publish_date),
    coverUrl: info.cover?.medium ?? info.cover?.large,
  }
}

/**
 * Recherche d'un livre par ISBN, directement depuis le navigateur (ni route serveur ni clé d'API) : Google Books,
 * complété ou remplacé par Open Library. Une nouvelle recherche annule la précédente, comme le démontage.
 */
export function useIsbnLookup() {
  const state = shallowRef<IsbnLookupState>({ kind: 'idle' })
  const googleKey = String(useRuntimeConfig().public.googleBooksKey ?? '')
  let controller: AbortController | null = null

  async function lookup(isbn: string) {
    controller?.abort()
    const current = new AbortController()
    controller = current
    state.value = { kind: 'loading', isbn }

    const settle = <T>(promise: Promise<T>) => promise.then(value => ({ value }), error => ({ error }))
    const google = await settle(fromGoogleBooks(isbn, googleKey, current.signal))
    if (current.signal.aborted) return
    const googleBook = 'value' in google ? google.value : null

    // Open Library n'est interrogé que s'il manque la fiche ou la couverture.
    let openBook: IsbnBook | null = null
    let openFailed = false
    if (!googleBook?.coverUrl) {
      const open = await settle(fromOpenLibrary(isbn, current.signal))
      if (current.signal.aborted) return
      if ('value' in open) openBook = open.value
      else openFailed = true
    }

    if (!googleBook && !openBook && 'error' in google && openFailed) {
      console.error('Recherche ISBN impossible', google.error)
      state.value = { kind: 'error', isbn }
      return
    }
    const book = googleBook
      ? { ...googleBook, coverUrl: googleBook.coverUrl ?? openBook?.coverUrl }
      : openBook
    state.value = { kind: 'done', isbn, book }
  }

  function retry() {
    if (state.value.kind === 'error') lookup(state.value.isbn)
  }

  function reset() {
    controller?.abort()
    state.value = { kind: 'idle' }
  }

  onBeforeUnmount(() => controller?.abort())

  return { state, lookup, retry, reset }
}
