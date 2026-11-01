<script setup lang="ts">
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import { collection, query } from 'firebase/firestore'
import { useLocalStorage } from '@vueuse/core'
import type { Book } from '~/types/book'
import type { Recipe } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { bookAuthorsLabel, bookMatchesSearch, groupLegacySources, type LegacySourceGroup } from '~/utils/books'

useSeoMeta({
  title: 'Dashboard - Bibliothèque - Mealfit',
  description: 'Dashboard - Bibliothèque - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const { books, booksById, loading: booksLoading, linkRecipes, remove } = useBooks()

/** Toutes les recettes, comme la page Recettes : un livre compte aussi celles des autres comptes. */
const recipes = useCollection<Recipe>(() => (user.value ? query(collection(db, 'recipes')) : null))
/** Catalogue d'ingrédients, pour ouvrir la fiche d'une recette depuis le sommaire d'un livre. */
const ingredients = useCollection<Ingredient>(() => (user.value ? query(collection(db, 'ingredients')) : null))
const ingredientsById = computed(() => new Map(ingredients.value.map(i => [i.id, i])))

const recipesByBook = computed(() => {
  const map = new Map<string, Recipe[]>()
  for (const recipe of recipes.value) {
    if (!recipe.bookId) continue
    map.set(recipe.bookId, [...(map.get(recipe.bookId) ?? []), recipe])
  }
  return map
})

const recipeCountLabel = (book: Book) => {
  const n = recipesByBook.value.get(book.id)?.length ?? 0
  return n === 0 ? 'Aucune recette' : n === 1 ? '1 recette' : `${n} recettes`
}

// --- Liste ---

/** La recherche n'aide qu'à partir d'une bibliothèque qui ne tient plus d'un coup d'œil. */
const SEARCH_THRESHOLD = 8
const showSearch = computed(() => books.value.length > SEARCH_THRESHOLD)
const searchQuery = ref('')

const filteredBooks = computed(() => books.value.filter(b => !showSearch.value || bookMatchesSearch(b, searchQuery.value)))

const listHeaderLabel = computed(() => {
  const n = filteredBooks.value.length
  if (n === 0) return searchQuery.value.trim() ? 'Aucun résultat' : 'Aucun livre'
  return n === 1 ? '1 livre' : `${n} livres`
})

// --- Fiche d'un livre ---

const detailOpen = ref(false)
const selectedBookId = ref<string | null>(null)
const selectedBook = computed(() => (selectedBookId.value ? booksById.value.get(selectedBookId.value) ?? null : null))

const openBook = (book: Book) => {
  selectedBookId.value = book.id
  detailOpen.value = true
}

// Depuis la fiche d'une recette (« Source ») : `?livre=<id>` ouvre la fiche du livre.
watch([() => route.query.livre, booksById], ([id]) => {
  if (typeof id !== 'string') return
  const book = booksById.value.get(id)
  if (!book) return
  openBook(book)
  router.replace({ query: { ...route.query, livre: undefined } })
}, { immediate: true })

const recipeOpen = ref(false)
const selectedRecipe = ref<Recipe | null>(null)
const openRecipe = (recipe: Recipe) => {
  selectedRecipe.value = recipe
  recipeOpen.value = true
}

// --- Ajout et modification ---

const formOpen = ref(false)
const editingBook = ref<Book | null>(null)
const formAutoScan = ref(false)
const formPrefillTitle = ref('')
/** Groupe de sources à rattacher au livre en cours de création (« Créer le livre » de la reprise). */
const creatingFor = ref<LegacySourceGroup | null>(null)

function openForm(options: { book?: Book, scan?: boolean, title?: string, group?: LegacySourceGroup } = {}) {
  editingBook.value = options.book ?? null
  formAutoScan.value = !!options.scan
  formPrefillTitle.value = options.title ?? ''
  creatingFor.value = options.group ?? null
  formOpen.value = true
}

const scanBook = () => openForm({ scan: true })
const addBook = () => openForm()

const editBook = (book: Book) => {
  detailOpen.value = false
  openForm({ book })
}

function onBookCreated(id: string) {
  const group = creatingFor.value
  creatingFor.value = null
  if (group) linkGroup(group, id)
}

const onExistingBook = (book: Book) => {
  creatingFor.value = null
  toast.add({ title: 'Déjà dans la bibliothèque', description: `« ${book.title} » a déjà sa fiche.`, color: 'neutral' })
  openBook(book)
}

// --- Suppression ---

const bookToDelete = ref<Book | null>(null)
const deleteDialogOpen = ref(false)

const askDeleteBook = (book: Book) => {
  bookToDelete.value = book
  deleteDialogOpen.value = true
}

const deleteDescription = computed(() => {
  const book = bookToDelete.value
  if (!book) return undefined
  const n = recipesByBook.value.get(book.id)?.length ?? 0
  if (n === 0) return `« ${book.title} » quittera la bibliothèque.`
  return `${n === 1 ? 'Sa recette reste' : `Ses ${n} recettes restent`}, avec « ${book.title} » écrit en source.`
})

async function confirmDeleteBook() {
  const book = bookToDelete.value
  if (!book) return
  deleteDialogOpen.value = false
  bookToDelete.value = null
  detailOpen.value = false
  try {
    await remove(book, recipesByBook.value.get(book.id) ?? [])
    toast.add({ title: 'Livre supprimé', description: `« ${book.title} » a quitté la bibliothèque`, color: 'neutral' })
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `« ${book.title} » n'a pas pu être supprimé : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
  }
}

// --- Reprise des sources écrites à la main ---

/** Sources écartées par « Ignorer », propres à cet appareil : elles ne reviennent pas dans la reprise. */
const ignoredSources = useLocalStorage<string[]>('mealfit-ignored-book-sources', [])
const legacyGroups = computed(() => {
  const ignored = new Set(ignoredSources.value)
  return groupLegacySources(recipes.value, books.value).filter(group => !ignored.has(group.key))
})
const legacyRecipeCount = computed(() => legacyGroups.value.reduce((n, g) => n + g.recipes.length, 0))

const reviewOpen = ref(false)
const linkingKey = ref<string | null>(null)

async function linkGroup(group: LegacySourceGroup, bookId: string) {
  const book = booksById.value.get(bookId)
  linkingKey.value = group.key
  try {
    await linkRecipes(bookId, group.recipes)
    const n = group.recipes.length
    toast.add({
      title: 'Sources rattachées',
      description: `${n === 1 ? '1 recette rattachée' : `${n} recettes rattachées`} à « ${book?.title ?? group.title} »`,
      color: 'success',
    })
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `Les recettes n'ont pas pu être rattachées : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
  } finally {
    linkingKey.value = null
  }
}

const createForGroup = (group: LegacySourceGroup) => openForm({ title: group.title, group })

const ignoreGroup = (group: LegacySourceGroup) => {
  ignoredSources.value = [...ignoredSources.value, group.key]
}
</script>

<template>
  <UDashboardPanel id="bibliotheque">
    <template #header>
      <UDashboardNavbar title="Bibliothèque">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            aria-label="Ajouter un livre sans code-barres"
            label="Saisir"
            :ui="{ label: 'hidden sm:inline' }"
            @click="addBook"
          />
          <UButton color="primary" icon="i-lucide-scan-barcode" label="Scanner un livre" @click="scanBook" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-5">
        <div
          v-if="legacyGroups.length"
          class="flex flex-col gap-3 rounded-lg border border-default bg-elevated/50 px-4 py-3 sm:flex-row sm:items-center"
        >
          <UIcon name="i-lucide-book-marked" class="hidden size-5 shrink-0 text-primary sm:block" aria-hidden="true" />
          <p class="min-w-0 flex-1 text-sm text-pretty">
            <span class="font-medium text-highlighted">
              {{ legacyRecipeCount === 1 ? '1 recette cite' : `${legacyRecipeCount} recettes citent` }} un livre en texte libre.
            </span>
            <span class="text-muted"> Rattachez-{{ legacyRecipeCount === 1 ? 'la' : 'les' }} pour retrouver vos recettes par livre.</span>
          </p>
          <UButton label="Rattacher" color="neutral" variant="outline" size="sm" class="self-start sm:self-auto" @click="reviewOpen = true" />
        </div>

        <div v-if="books.length" class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p class="text-sm font-medium text-highlighted whitespace-nowrap">{{ listHeaderLabel }}</p>
          <UInput
            v-if="showSearch"
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Rechercher un titre ou un auteur..."
            variant="outline"
            class="w-full sm:ml-auto sm:w-72"
          />
        </div>

        <ul v-if="booksLoading" class="book-grid" aria-busy="true" aria-label="Chargement de la bibliothèque">
          <li v-for="i in 6" :key="i" class="flex flex-col gap-2">
            <USkeleton class="aspect-[2/3] w-full rounded-[3px]" />
            <USkeleton class="h-4 w-4/5" />
            <USkeleton class="h-3 w-1/2" />
          </li>
        </ul>

        <UEmpty
          v-else-if="!books.length"
          class="py-12"
          icon="i-lucide-library"
          title="Aucun livre"
          description="Scannez le code-barres au dos d'un livre de cuisine : titre, auteur et couverture se remplissent seuls."
          :actions="[
            { label: 'Scanner un livre', icon: 'i-lucide-scan-barcode', onClick: scanBook },
            { label: 'Saisir un livre', icon: 'i-lucide-plus', color: 'neutral', variant: 'outline', onClick: addBook },
          ]"
        />

        <UEmpty
          v-else-if="!filteredBooks.length"
          class="py-12"
          icon="i-lucide-search-x"
          title="Aucun livre trouvé"
          description="Essayez un autre titre ou un autre auteur."
          :actions="[{ label: 'Effacer la recherche', icon: 'i-lucide-x', color: 'neutral', variant: 'outline', onClick: () => { searchQuery = '' } }]"
        />

        <ul v-else class="book-grid">
          <li v-for="book in filteredBooks" :key="book.id">
            <button
              type="button"
              class="book-tile group flex w-full flex-col gap-2.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              @click="openBook(book)"
            >
              <BookCover :book="book" class="book-tile__cover" />
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="line-clamp-2 text-sm font-semibold leading-snug text-highlighted text-balance group-hover:text-primary">{{ book.title }}</span>
                <span v-if="book.authors.length" class="truncate text-xs text-muted">{{ bookAuthorsLabel(book) }}</span>
                <span class="text-xs text-dimmed tabular-nums">{{ recipeCountLabel(book) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </template>
  </UDashboardPanel>

  <BookDetailSlideover
    v-model:open="detailOpen"
    :book="selectedBook"
    :recipes="selectedBook ? recipesByBook.get(selectedBook.id) ?? [] : []"
    @edit="editBook"
    @delete="askDeleteBook"
    @select-recipe="openRecipe"
  />

  <RecipeDetailSlideover
    v-model:open="recipeOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
  />

  <BookFormSlideover
    v-model:open="formOpen"
    :book="editingBook"
    :prefill-title="formPrefillTitle"
    :auto-scan="formAutoScan"
    @created="onBookCreated"
    @existing="onExistingBook"
  />

  <BookSourceReviewSlideover
    v-model:open="reviewOpen"
    :groups="legacyGroups"
    :books="books"
    :busy-key="linkingKey"
    @link="linkGroup"
    @create="createForGroup"
    @ignore="ignoreGroup"
  />

  <ConfirmDialog
    v-model:open="deleteDialogOpen"
    :title="bookToDelete ? `Supprimer « ${bookToDelete.title} » ?` : 'Supprimer ce livre ?'"
    :description="deleteDescription"
    confirm-label="Supprimer"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    @confirm="confirmDeleteBook"
  />
</template>

<style scoped>
.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 1.75rem 1rem;
}

@media (min-width: 40rem) {
  .book-grid {
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 2rem 1.5rem;
  }
}

.book-tile__cover {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@media (hover: hover) {
  .book-tile:hover .book-tile__cover {
    transform: translateY(-3px);
    box-shadow: 0 2px 4px rgb(0 0 0 / 0.12), 0 14px 24px -12px rgb(0 0 0 / 0.4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .book-tile__cover {
    transition: none;
  }
}
</style>
