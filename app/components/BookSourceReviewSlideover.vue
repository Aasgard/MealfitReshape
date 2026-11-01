<script setup lang="ts">
import type { Book } from '~/types/book'
import type { LegacySourceGroup } from '~/utils/books'

/**
 * Reprise des sources écrites à la main : les recettes qui citent un même livre en texte sont regroupées, et chaque
 * groupe se rattache d'un coup à un livre de la bibliothèque (choisi, ou créé avec ce titre). La page lue dans le
 * texte (« p. 42 ») est gardée.
 */
const props = defineProps<{
  groups: LegacySourceGroup[]
  books: Book[]
  /** Groupe en cours d'écriture. */
  busyKey: string | null
}>()

const emit = defineEmits<{
  link: [group: LegacySourceGroup, bookId: string]
  create: [group: LegacySourceGroup]
  ignore: [group: LegacySourceGroup]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const bookOptions = computed(() => props.books.map(b => ({ id: b.id, label: b.title, description: b.authors.join(', ') || undefined })))

/** Livre choisi par groupe ; par défaut, celui dont le titre correspond. */
const chosen = ref<Record<string, string | undefined>>({})
watch(() => props.groups, (groups) => {
  for (const group of groups) {
    if (!(group.key in chosen.value)) chosen.value[group.key] = group.match?.id
  }
}, { immediate: true })

const SHOWN_TITLES = 3
const recipeTitles = (group: LegacySourceGroup) => group.recipes.slice(0, SHOWN_TITLES).map(r => r.recipe.title).join(', ')
const moreCount = (group: LegacySourceGroup) => Math.max(0, group.recipes.length - SHOWN_TITLES)
const pagesLabel = (group: LegacySourceGroup) => {
  const pages = group.recipes.map(r => r.page).filter(Boolean)
  return pages.length ? `p. ${pages.join(', ')}` : ''
}

const totalRecipes = computed(() => props.groups.reduce((n, g) => n + g.recipes.length, 0))

watch(() => props.groups.length, (n) => {
  if (n === 0) open.value = false
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Rattacher les sources"
    :description="`${totalRecipes} recette${totalRecipes > 1 ? 's' : ''} citent un livre en texte libre. Rattachez-les à la bibliothèque pour les retrouver par livre.`"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <ul class="-my-2 flex flex-col divide-y divide-default">
        <li v-for="group in groups" :key="group.key" class="flex flex-col gap-3 py-4">
          <div class="min-w-0">
            <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span class="font-semibold text-highlighted">« {{ group.title }} »</span>
              <span class="text-xs text-dimmed tabular-nums">
                {{ group.recipes.length }} recette{{ group.recipes.length > 1 ? 's' : '' }}<template v-if="pagesLabel(group)"> · {{ pagesLabel(group) }}</template>
              </span>
            </p>
            <p class="mt-0.5 text-xs text-muted text-pretty">
              {{ recipeTitles(group) }}<template v-if="moreCount(group)"> et {{ moreCount(group) }} autre{{ moreCount(group) > 1 ? 's' : '' }}</template>
            </p>
          </div>

          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div class="flex min-w-0 flex-1 gap-2">
              <USelectMenu
                v-model="chosen[group.key]"
                :items="bookOptions"
                value-key="id"
                placeholder="Choisir un livre…"
                :search-input="{ placeholder: 'Rechercher un livre...' }"
                icon="i-lucide-book-open"
                :aria-label="`Livre de « ${group.title} »`"
                class="min-w-0 flex-1"
                :disabled="!books.length"
              />
              <UButton
                label="Rattacher"
                color="primary"
                :variant="chosen[group.key] ? 'solid' : 'soft'"
                :disabled="!chosen[group.key] || (!!busyKey && busyKey !== group.key)"
                :loading="busyKey === group.key"
                @click="emit('link', group, chosen[group.key]!)"
              />
            </div>
            <div class="flex gap-2">
              <UButton
                label="Créer le livre"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                :disabled="!!busyKey"
                class="flex-1 justify-center sm:flex-none"
                @click="emit('create', group)"
              />
              <UButton
                label="Ignorer"
                color="neutral"
                variant="ghost"
                :disabled="!!busyKey"
                :aria-label="`Ignorer « ${group.title} »`"
                @click="emit('ignore', group)"
              />
            </div>
          </div>
        </li>
      </ul>
    </template>
  </USlideover>
</template>
