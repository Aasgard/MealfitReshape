import type { Timestamp } from 'firebase/firestore'

/**
 * Nature d'un livre. Seuls les livres de cuisine existent pour l'instant ; la collection est générique pour accueillir
 * plus tard le reste de la bibliothèque (romans…) sans migration : seuls les livres de cuisine servent de source à une
 * recette.
 */
export const BOOK_KINDS = ['cookbook'] as const
export type BookKind = typeof BOOK_KINDS[number]

/**
 * Un livre de la collection Firestore `books`, commune à tous comme les recettes : une recette d'un autre compte
 * peut citer un livre qu'on n'a pas ajouté. Le document ne porte que ce qui vaut pour tout livre ; ce qui relie un
 * livre à la cuisine (recettes, pages) vit sur la recette (`Recipe.bookId`, `Recipe.bookPage`).
 * En lecture depuis VueFire, chaque document a aussi un `id`.
 */
export interface Book {
  id: string
  /** Toujours écrit, même quand il n'y a qu'une nature : Firestore ne sait pas filtrer un champ absent. */
  kind: BookKind
  title: string
  /** Dans l'ordre de la couverture ; vide si inconnu. */
  authors: string[]
  /** ISBN-13, chiffres seuls ; absent pour un livre saisi sans code-barres. */
  isbn?: string
  publisher?: string
  /** Année de parution. */
  year?: number
  /** Image de couverture, lien externe (Google Books, Open Library ou saisi). */
  coverUrl?: string
  /** Compte qui l'a ajouté. */
  createdBy: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

/** Champs saisis dans le formulaire d'un livre, ou trouvés par ISBN. */
export type BookFields = Pick<Book, 'title' | 'authors' | 'isbn' | 'publisher' | 'year' | 'coverUrl'>
