<script setup lang="ts">
import type { Book, BookFields } from '~/types/book'
import type { IsbnBook } from '~/composables/useIsbnLookup'
import { BOOK_TITLE_MAX, formatIsbn } from '~/utils/books'

/**
 * Ajout ou modification d'un livre de cuisine. En haut, la lecture de l'ISBN (scan, photo, saisie) remplit la fiche ;
 * tout reste modifiable, et un livre sans code-barres se saisit à la main.
 * `book` nul = création ; `prefillTitle` : titre proposé (source d'une recette) ; `autoScan` : la caméra s'ouvre
 * dès l'ouverture (bouton « Scanner un livre »).
 */
const props = withDefaults(defineProps<{
  book: Book | null
  prefillTitle?: string
  autoScan?: boolean
}>(), {
  prefillTitle: '',
  autoScan: false,
})

const emit = defineEmits<{
  created: [id: string]
  /** L'ISBN lu est déjà dans la bibliothèque : le parent ouvre sa fiche. */
  existing: [book: Book]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const toast = useToast()
const { findByIsbn, add, update } = useBooks()

const isEditMode = computed(() => props.book !== null)

const title = ref('')
const authors = ref<string[]>([])
const isbn = ref<string | undefined>()
const publisher = ref('')
const year = ref('')
const coverUrl = ref('')
const saving = ref(false)
const submitted = ref(false)
/** Résultat de la dernière lecture d'ISBN, pour le signaler au-dessus de la fiche. */
const lookupOutcome = ref<'found' | 'not-found' | null>(null)

const lookupRef = useTemplateRef<{ openScanner: () => void }>('lookup')

function resetForm() {
  const b = props.book
  title.value = b?.title ?? props.prefillTitle
  authors.value = b ? [...b.authors] : []
  isbn.value = b?.isbn
  publisher.value = b?.publisher ?? ''
  year.value = b?.year ? String(b.year) : ''
  coverUrl.value = b?.coverUrl ?? ''
  submitted.value = false
  lookupOutcome.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) return
  resetForm()
  if (props.autoScan && !isEditMode.value) nextTick(() => lookupRef.value?.openScanner())
}, { immediate: true })

/** Livre de la bibliothèque qui porte déjà cet ISBN (autre que celui qu'on modifie). */
const duplicate = computed(() => {
  const twin = isbn.value ? findByIsbn(isbn.value) : undefined
  return twin && twin.id !== props.book?.id ? twin : undefined
})

/**
 * Fiche trouvée : en création, elle remplace la saisie (le titre proposé n'était qu'une supposition) ; en
 * modification, elle ne complète que les champs vides.
 */
function onFound(foundIsbn: string, found: IsbnBook | null) {
  isbn.value = foundIsbn
  lookupOutcome.value = found ? 'found' : 'not-found'
  if (!found) return
  const replace = !isEditMode.value
  const fill = (current: string, value: string | undefined) => (replace || !current.trim()) && value ? value : current
  title.value = fill(title.value, found.title)
  if ((replace || !authors.value.length) && found.authors.length) authors.value = [...found.authors]
  publisher.value = fill(publisher.value, found.publisher)
  year.value = fill(year.value, found.year ? String(found.year) : undefined)
  coverUrl.value = fill(coverUrl.value, found.coverUrl)
}

const clearIsbn = () => {
  isbn.value = undefined
  lookupOutcome.value = null
}

const titleError = computed(() => {
  if (!submitted.value) return undefined
  const trimmed = title.value.trim()
  if (!trimmed) return 'Donnez le titre du livre.'
  if (trimmed.length > BOOK_TITLE_MAX) return `${BOOK_TITLE_MAX} caractères au plus.`
  return undefined
})

const parsedYear = computed(() => {
  const n = Number(year.value.trim())
  return year.value.trim() && Number.isInteger(n) ? n : undefined
})
const yearError = computed(() => {
  if (!submitted.value || !year.value.trim()) return undefined
  const max = new Date().getFullYear() + 1
  return parsedYear.value && parsedYear.value >= 1450 && parsedYear.value <= max ? undefined : `Une année entre 1450 et ${max}.`
})

const coverError = computed(() =>
  submitted.value && coverUrl.value.trim() && !/^https:\/\//.test(coverUrl.value.trim()) ? 'Un lien en https://' : undefined)

const preview = computed(() => ({
  id: props.book?.id,
  title: title.value.trim() || 'Titre du livre',
  authors: authors.value,
  isbn: isbn.value,
  coverUrl: /^https:\/\//.test(coverUrl.value.trim()) ? coverUrl.value.trim() : undefined,
}))

async function handleSubmit() {
  submitted.value = true
  if (titleError.value || yearError.value || coverError.value || duplicate.value) return

  const fields: BookFields = {
    title: title.value,
    authors: authors.value,
    isbn: isbn.value,
    publisher: publisher.value,
    year: parsedYear.value,
    coverUrl: coverUrl.value,
  }
  saving.value = true
  try {
    if (props.book) {
      await update(props.book, fields)
      toast.add({ title: 'Modifié', description: `« ${fields.title.trim()} » a été mis à jour`, color: 'success' })
    } else {
      const id = await add(fields)
      toast.add({ title: 'Ajouté', description: `« ${fields.title.trim()} » est dans la bibliothèque`, color: 'success' })
      emit('created', id)
    }
    open.value = false
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: `Le livre n'a pas pu être enregistré : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

function openExisting() {
  if (!duplicate.value) return
  emit('existing', duplicate.value)
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="isEditMode ? 'Modifier le livre' : 'Ajouter un livre'"
    :dismissible="!saving"
    :close="!saving"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-2" aria-label="Code-barres du livre">
          <BookIsbnLookup ref="lookup" @found="onFound" />

          <UAlert
            v-if="duplicate"
            color="warning"
            variant="subtle"
            icon="i-lucide-library"
            title="Déjà dans la bibliothèque"
            :description="`« ${duplicate.title} » porte déjà cet ISBN.`"
            :actions="[{ label: 'Ouvrir sa fiche', color: 'warning', variant: 'outline', onClick: openExisting }]"
            orientation="horizontal"
          />
          <p v-else-if="lookupOutcome === 'found'" class="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            <UIcon name="i-lucide-circle-check" class="size-3.5 shrink-0 text-success" />
            Fiche remplie d'après l'ISBN : relisez-la avant d'enregistrer.
          </p>
          <p v-else-if="lookupOutcome === 'not-found'" class="flex items-start gap-1.5 text-xs text-muted" aria-live="polite">
            <UIcon name="i-lucide-search-x" class="size-3.5 shrink-0 mt-px" />
            Aucune fiche pour cet ISBN chez Google Books ni Open Library : complétez le titre et l'auteur.
          </p>
        </section>

        <div class="flex gap-4">
          <div class="w-20 shrink-0 sm:w-24">
            <BookCover :book="preview" />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-4">
            <UFormField label="Titre" required :error="titleError">
              <UInput v-model="title" placeholder="ex : Simplissime" size="md" variant="outline" class="w-full" :maxlength="BOOK_TITLE_MAX + 20" />
            </UFormField>
            <UFormField label="Auteurs (optionnel)" hint="Entrée pour valider">
              <UInputTags v-model="authors" placeholder="ex : Jean-François Mallet" variant="outline" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="grid grid-cols-[1fr_6rem] gap-4">
          <UFormField label="Éditeur (optionnel)">
            <UInput v-model="publisher" placeholder="ex : Hachette Pratique" size="md" variant="outline" class="w-full" />
          </UFormField>
          <UFormField label="Année" :error="yearError">
            <UInput v-model="year" type="text" inputmode="numeric" placeholder="2015" size="md" variant="outline" class="w-full" :ui="{ base: 'tabular-nums' }" />
          </UFormField>
        </div>

        <UFormField label="Couverture (optionnel)" hint="Lien vers une image" :error="coverError">
          <UInput v-model="coverUrl" type="url" placeholder="https://…" size="md" variant="outline" class="w-full" />
        </UFormField>

        <div v-if="isbn" class="flex items-center justify-between gap-2 text-sm">
          <p class="text-muted">
            ISBN <span class="tabular-nums text-highlighted">{{ formatIsbn(isbn) }}</span>
          </p>
          <UButton label="Retirer" color="neutral" variant="link" size="xs" @click="clearIsbn" />
        </div>
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton label="Enregistrer" color="primary" :loading="saving" :disabled="!!duplicate" @click="handleSubmit" />
    </template>
  </USlideover>
</template>
