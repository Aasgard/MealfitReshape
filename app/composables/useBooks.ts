import { Timestamp, collection, deleteField, doc, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Book, BookFields, BookKind } from '~/types/book'
import type { Recipe } from '~/types/recipe'
import { bookSourceLabel } from '~/utils/books'

/** Champs écrits d'un livre : les vides sont retirés plutôt qu'enregistrés en chaîne vide. */
function bookPayload(fields: BookFields, isUpdate: boolean) {
  const payload: Record<string, unknown> = {
    title: fields.title.trim().replace(/\s+/g, ' '),
    authors: fields.authors.map(a => a.trim()).filter(Boolean),
    updatedAt: serverTimestamp(),
  }
  const optional = { isbn: fields.isbn, publisher: fields.publisher?.trim(), year: fields.year, coverUrl: fields.coverUrl?.trim() }
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined && value !== '') payload[key] = value
    else if (isUpdate) payload[key] = deleteField()
  }
  return payload
}

/**
 * Livres d'une nature (collection `books`), communs à tous comme les recettes qui les citent. Les livres de cuisine
 * par défaut : ce sont les seuls qu'une recette peut prendre pour source. Tri côté client, sans index composite.
 */
export function useBooks(kind: BookKind = 'cookbook') {
  const db = useFirestore()
  const user = useCurrentUser()
  const booksRef = collection(db, 'books')

  const stored = useCollection<Book>(() => (user.value ? query(booksRef, where('kind', '==', kind)) : null))

  const books = computed(() => [...stored.value].sort((a, b) => a.title.localeCompare(b.title, 'fr')))
  const booksById = computed(() => new Map(books.value.map(book => [book.id, book])))
  const loading = computed(() => !user.value || (stored.pending.value && !stored.value.length))

  const findByIsbn = (isbn: string) => books.value.find(book => book.isbn === isbn)

  /** Ajoute un livre ; renvoie son id. */
  async function add(fields: BookFields) {
    if (!user.value) throw new Error('Vous devez être connecté.')
    const ref = doc(booksRef)
    await setDoc(ref, { ...bookPayload(fields, false), kind, createdBy: user.value.uid, createdAt: serverTimestamp() })
    return ref.id
  }

  const update = (book: Book, fields: BookFields) => updateDoc(doc(booksRef, book.id), bookPayload(fields, true))

  /**
   * Rattache des recettes à un livre, en une écriture : la source texte laisse la place au livre, la page est gardée
   * quand elle est connue.
   */
  async function linkRecipes(bookId: string, entries: { recipe: Recipe, page: string }[]) {
    // Horodatage local, comme le formulaire des recettes : la date de modification s'affiche tout de suite.
    const now = Timestamp.now()
    const batch = writeBatch(db)
    for (const { recipe, page } of entries) {
      batch.update(doc(db, 'recipes', recipe.id), {
        bookId,
        bookPage: page || deleteField(),
        source: deleteField(),
        updatedAt: now,
      })
    }
    await batch.commit()
  }

  /** Supprime un livre ; ses recettes ne perdent rien, leur source redevient un texte (« Titre, p. 42 »). */
  async function remove(book: Book, recipes: Recipe[]) {
    const now = Timestamp.now()
    const batch = writeBatch(db)
    for (const recipe of recipes) {
      batch.update(doc(db, 'recipes', recipe.id), {
        source: bookSourceLabel(book, recipe.bookPage),
        bookId: deleteField(),
        bookPage: deleteField(),
        updatedAt: now,
      })
    }
    batch.delete(doc(booksRef, book.id))
    await batch.commit()
  }

  return { books, booksById, loading, findByIsbn, add, update, linkRecipes, remove }
}
