<script setup lang="ts">
import { useCurrentUser } from 'vuefire'
import type { Ingredient } from '~/types/ingredient'
import type { RecipeDraft } from '~/types/recipe'
import type { CatalogBook, CatalogIngredient, RecipeReading } from '#shared/types/recipeReading'
import { cropImage, resizeImage } from '~/utils/imageResize'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'

/**
 * Lecture d'une recette sur 1 à 4 photos (page de livre ou de magazine, capture d'écran) par Claude.
 * Les pages sont réduites dans le navigateur pour l'envoi ; l'original reste en mémoire le temps de recadrer
 * l'illustration du plat. Rien n'est stocké : le brouillon part dans le formulaire de création, à relire.
 */
const props = defineProps<{
  /** Catalogue visible (publics + privés), envoyé à Claude pour rapprocher les ingrédients lus. */
  ingredients: Ingredient[]
}>()

const emit = defineEmits<{
  read: [draft: RecipeDraft]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const user = useCurrentUser()
const categoriesStore = useIngredientCategoriesStore()
/** Livres de cuisine, envoyés à Claude pour reconnaître celui d'où vient la page. */
const { books } = useBooks()
const { generate: generateId } = useFirestoreId()

const MAX_PAGES = 4

interface PageDraft {
  key: string
  /** Fichier d'origine, pleine résolution : sert à recadrer l'illustration du plat. */
  file: File
  /** Version réduite envoyée à Claude : assez grande pour lire un texte de livre. */
  blob: Blob
  objectUrl: string
}

const pages = ref<PageDraft[]>([])
const processing = ref(false)
const pickError = ref<string | null>(null)
const reading = ref(false)
const readError = ref<string | null>(null)
let abortController: AbortController | null = null

const cameraInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)

const canAddPage = computed(() => pages.value.length < MAX_PAGES && !reading.value)
const canRead = computed(() => pages.value.length > 0 && !processing.value && !reading.value)

function clearPages() {
  for (const page of pages.value) URL.revokeObjectURL(page.objectUrl)
  pages.value = []
}

watch(open, (isOpen) => {
  if (isOpen) return
  abortController?.abort()
  clearPages()
  pickError.value = null
  readError.value = null
})

onBeforeUnmount(clearPages)

async function onFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // Vide le champ pour pouvoir choisir à nouveau le même fichier.
  input.value = ''
  if (!files.length) return

  pickError.value = null
  readError.value = null
  const room = MAX_PAGES - pages.value.length
  processing.value = true
  try {
    for (const file of files.slice(0, room)) {
      try {
        const blob = await resizeImage(file, 1600, 0.85)
        pages.value.push({ key: generateId(), file, blob, objectUrl: URL.createObjectURL(blob) })
      } catch (cause) {
        console.error('Photo illisible :', cause)
        pickError.value = 'Une image n\'a pas pu être lue. Essayez une photo JPEG ou PNG.'
      }
    }
    if (files.length > room) {
      pickError.value = `${MAX_PAGES} pages au maximum : les suivantes n'ont pas été ajoutées.`
    }
  } finally {
    processing.value = false
  }
}

function removePage(key: string) {
  const page = pages.value.find(p => p.key === key)
  if (page) URL.revokeObjectURL(page.objectUrl)
  pages.value = pages.value.filter(p => p.key !== key)
  readError.value = null
}

function catalogForReading(): CatalogIngredient[] {
  return props.ingredients.map(i => ({
    id: i.id,
    label: i.label,
    units: Object.entries(i.units ?? {}).map(([id, u]) => ({ id, label: u.label, value: u.value, unit: u.unit })),
  }))
}

/** L'illustration est un bonus : un recadrage impossible laisse simplement le champ Image vide. */
async function dishImageFor(result: RecipeReading, sources: PageDraft[]) {
  const box = result.dishImage
  const page = box ? sources[box.photoIndex] : undefined
  if (!box || !page) return null
  try {
    return await cropImage(page.file, box)
  } catch (cause) {
    console.error('Recadrage de l\'illustration impossible :', cause)
    return null
  }
}

async function read() {
  if (!canRead.value || !user.value) return

  reading.value = true
  readError.value = null
  abortController = new AbortController()
  const sources = [...pages.value]
  try {
    const body = new FormData()
    sources.forEach((page, index) => body.append('photo', page.blob, `page-${index + 1}.jpg`))
    body.append('catalog', JSON.stringify(catalogForReading()))
    body.append('categories', JSON.stringify(categoriesStore.categories.map(c => ({ id: c.id, label: c.label }))))
    body.append('books', JSON.stringify(books.value.map((b): CatalogBook => ({ id: b.id, title: b.title, authors: b.authors }))))

    const result = await $fetch<RecipeReading>('/api/read-recipe', {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${await user.value.getIdToken()}` },
      signal: abortController.signal,
    })

    emit('read', { reading: result, photoCount: sources.length, dishImage: await dishImageFor(result, sources) })
    open.value = false
  } catch (error) {
    if (abortController?.signal.aborted) return
    console.error('Lecture impossible :', error)
    // Message du serveur dans le corps JSON de l'erreur ; à défaut (hors ligne, délai dépassé), message générique.
    const serverMessage = (error as { data?: { message?: string } }).data?.message
    readError.value = serverMessage ?? 'La lecture a échoué. Vérifiez la connexion et réessayez.'
  } finally {
    reading.value = false
    abortController = null
  }
}

function cancel() {
  abortController?.abort()
  open.value = false
}

const readingStatus = computed(() => {
  if (!reading.value) return ''
  const count = pages.value.length
  return `Lecture ${count > 1 ? `des ${count} pages` : 'de la page'}… comptez une vingtaine de secondes.`
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Recette depuis une photo"
    :dismissible="!reading"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <p class="text-sm text-muted text-pretty">
          Photographiez la page du livre ou importez une capture d'écran. Ingrédients et étapes sur deux pages&nbsp;?
          Ajoutez-les dans l'ordre. Les photos ne sont pas conservées.
        </p>

        <ul class="grid grid-cols-2 gap-3" aria-label="Pages de la recette">
          <li
            v-for="(page, index) in pages"
            :key="page.key"
            class="page-frame relative aspect-[3/4] overflow-hidden rounded-xl border border-default bg-accented"
            :class="{ 'is-reading': reading }"
            :style="{ '--scan-delay': `${index * -0.45}s` }"
          >
            <img :src="page.objectUrl" :alt="`Page ${index + 1}`" class="size-full object-contain">
            <UBadge
              :label="`Page ${index + 1}`"
              color="neutral"
              variant="solid"
              size="sm"
              class="absolute bottom-2 left-2 tabular-nums"
            />
            <UButton
              v-if="!reading"
              icon="i-lucide-x"
              color="neutral"
              variant="solid"
              size="xs"
              :aria-label="`Retirer la page ${index + 1}`"
              class="absolute top-2 right-2"
              @click="removePage(page.key)"
            />
          </li>

          <li
            v-if="canAddPage"
            class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-accented p-4 text-center"
            :class="pages.length === 0 ? 'col-span-2 min-h-56' : 'aspect-[3/4]'"
          >
            <UIcon
              :name="processing ? 'i-lucide-loader-circle' : 'i-lucide-scan-text'"
              class="size-7 text-dimmed"
              :class="{ 'animate-spin': processing }"
            />
            <div class="flex flex-col gap-0.5">
              <p class="text-sm font-medium text-highlighted">
                {{ pages.length === 0 ? 'Ajoutez la recette' : 'Page suivante' }}
              </p>
              <p class="text-xs text-dimmed">
                {{ pages.length === 0 ? 'Page de livre, de magazine ou capture d\'écran' : `${MAX_PAGES - pages.length} de plus au maximum` }}
              </p>
            </div>
            <div class="flex flex-wrap justify-center gap-2">
              <!-- La capture directe n'a de sens que sur un appareil tactile (téléphone, tablette). -->
              <UButton
                label="Photo"
                aria-label="Photographier une page"
                icon="i-lucide-camera"
                color="neutral"
                variant="outline"
                size="sm"
                class="hidden pointer-coarse:flex"
                :disabled="processing"
                @click="cameraInput?.click()"
              />
              <UButton
                label="Importer"
                aria-label="Importer une image"
                icon="i-lucide-image-up"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="processing"
                @click="galleryInput?.click()"
              />
            </div>
          </li>
        </ul>

        <p v-if="reading" class="flex items-center gap-2 text-sm text-muted" role="status">
          <UIcon name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-primary" />
          {{ readingStatus }}
        </p>

        <UAlert
          v-if="pickError"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="pickError"
        />
        <UAlert
          v-if="readError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="readError"
        />

        <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFilesChange">
        <input ref="galleryInput" type="file" accept="image/*" multiple class="sr-only" tabindex="-1" aria-hidden="true" @change="onFilesChange">
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" @click="cancel" />
      <UButton
        :label="reading ? 'Lecture…' : 'Lire la recette'"
        icon="i-lucide-scan-text"
        color="primary"
        :loading="reading"
        :disabled="!canRead && !reading"
        @click="read"
      />
    </template>
  </USlideover>
</template>

<style scoped>
/*
 * Pendant la lecture, un trait indigo balaie chaque page de haut en bas, comme une tête de lecture :
 * la page reste lisible dessous. Décalé d'une page à l'autre pour ne pas battre à l'unisson.
 */
.page-frame::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 28%;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in oklch, var(--ui-primary) 14%, transparent) 85%,
    color-mix(in oklch, var(--ui-primary) 70%, transparent) 99%,
    var(--ui-primary)
  );
  transform: translateY(-100%);
}

.page-frame.is-reading::after {
  opacity: 1;
  animation: page-scan 2.2s cubic-bezier(0.45, 0, 0.55, 1) var(--scan-delay, 0s) infinite;
}

.page-frame.is-reading img {
  filter: saturate(0.6);
  transition: filter 0.4s ease-out;
}

@keyframes page-scan {
  from { transform: translateY(-100%); }
  to { transform: translateY(360%); }
}

@media (prefers-reduced-motion: reduce) {
  .page-frame.is-reading::after {
    animation: none;
    top: auto;
    bottom: 0;
    height: 3px;
    background: var(--ui-primary);
    transform: none;
  }
}
</style>
