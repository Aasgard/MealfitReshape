<script setup lang="ts">
import type { Book } from '~/types/book'
import type { Recipe } from '~/types/recipe'
import { bookAuthorsLabel, formatIsbn, sortByBookPage } from '~/utils/books'
import { recipeTypeIcon } from '~/utils/recipeType'

/**
 * Fiche d'un livre de cuisine : sa couverture, puis ses recettes en sommaire, dans l'ordre des pages. Une recette
 * s'ouvre dans sa fiche ; « Voir dans Recettes » filtre la page Recettes sur ce livre.
 */
const props = defineProps<{
  book: Book | null
  /** Recettes rattachées à ce livre. */
  recipes: Recipe[]
}>()

const emit = defineEmits<{
  edit: [book: Book]
  delete: [book: Book]
  selectRecipe: [recipe: Recipe]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const contents = computed(() => sortByBookPage(props.recipes))

const details = computed(() => {
  const b = props.book
  if (!b) return ''
  return [b.publisher, b.year].filter(Boolean).join(' · ')
})

const recipeCountLabel = computed(() => {
  const n = props.recipes.length
  return n === 0 ? 'Aucune recette' : n === 1 ? '1 recette' : `${n} recettes`
})

const actionItems = computed(() => props.book
  ? [[{ label: 'Supprimer le livre', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', props.book!) }]]
  : [])
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="book?.title ?? 'Livre'"
    :close="false"
    :ui="{ content: 'sm:max-w-lg', wrapper: 'min-w-0 flex-1', title: 'line-clamp-2' }"
  >
    <template #actions>
      <div class="flex shrink-0 items-center rounded-md ring ring-inset ring-default">
        <UButton
          v-if="book"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          aria-label="Modifier le livre"
          title="Modifier le livre"
          class="shrink-0"
          @click="emit('edit', book)"
        />
        <UDropdownMenu v-if="book" :items="actionItems" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" aria-label="Autres actions" title="Autres actions" class="shrink-0" />
        </UDropdownMenu>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          aria-label="Fermer"
          title="Fermer"
          class="shrink-0"
          @click="() => { open = false }"
        />
      </div>
    </template>

    <template #body>
      <div v-if="book" class="flex flex-col gap-8">
        <div class="flex gap-4 sm:gap-5">
          <div class="w-24 shrink-0 sm:w-28">
            <BookCover :book="book" />
          </div>
          <dl class="flex min-w-0 flex-1 flex-col gap-1">
            <div v-if="book.authors.length">
              <dt class="sr-only">Auteurs</dt>
              <dd class="text-sm font-medium text-highlighted">{{ bookAuthorsLabel(book) }}</dd>
            </div>
            <div v-if="details">
              <dt class="sr-only">Éditeur et année</dt>
              <dd class="text-sm text-muted">{{ details }}</dd>
            </div>
            <div v-if="book.isbn">
              <dt class="sr-only">ISBN</dt>
              <dd class="text-xs text-dimmed tabular-nums">ISBN {{ formatIsbn(book.isbn) }}</dd>
            </div>
            <div v-if="recipes.length" class="mt-auto pt-3">
              <UButton
                label="Voir dans Recettes"
                icon="i-lucide-chef-hat"
                color="neutral"
                variant="outline"
                size="sm"
                :to="{ path: '/dashboard/recipes', query: { livre: book.id } }"
              />
            </div>
          </dl>
        </div>

        <section aria-labelledby="book-contents-title">
          <div class="mb-2 flex items-baseline justify-between gap-2 border-b border-default pb-2">
            <h3 id="book-contents-title" class="text-xs font-semibold uppercase tracking-wide text-dimmed">Sommaire</h3>
            <p class="text-xs text-dimmed tabular-nums">{{ recipeCountLabel }}</p>
          </div>

          <ol v-if="contents.length" class="-mx-2 flex flex-col">
            <li v-for="recipe in contents" :key="recipe.id">
              <button
                type="button"
                class="book-contents-row group flex w-full items-baseline gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                @click="emit('selectRecipe', recipe)"
              >
                <UIcon
                  v-if="recipeTypeIcon(recipe.type)"
                  :name="recipeTypeIcon(recipe.type)!"
                  class="size-3.5 shrink-0 self-center text-dimmed"
                  aria-hidden="true"
                />
                <span class="min-w-0 text-highlighted group-hover:text-primary">{{ recipe.title }}</span>
                <span class="book-contents-leader min-w-4 flex-1" aria-hidden="true" />
                <span class="shrink-0 tabular-nums" :class="recipe.bookPage ? 'text-default' : 'text-dimmed'">
                  <span class="sr-only">{{ recipe.bookPage ? 'page' : 'page non indiquée' }}</span>
                  <span :aria-hidden="!recipe.bookPage">{{ recipe.bookPage || '—' }}</span>
                </span>
              </button>
            </li>
          </ol>
          <p v-else class="py-6 text-center text-sm text-muted text-pretty">
            Aucune recette rattachée. Choisissez ce livre dans la source d'une recette, ou rattachez d'un coup les
            sources écrites à la main depuis la bibliothèque.
          </p>
        </section>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
/* Points de conduite du sommaire, comme dans un livre : ils relient le titre à sa page. */
.book-contents-leader {
  align-self: baseline;
  height: 0.25em;
  background-image: radial-gradient(circle, var(--ui-border-accented) 0.75px, transparent 1px);
  background-size: 6px 3px;
  background-repeat: repeat-x;
  background-position: left center;
}
</style>
