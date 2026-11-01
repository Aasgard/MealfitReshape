<script setup lang="ts">
import type { Book } from '~/types/book'
import { bookHue } from '~/utils/books'

/**
 * Couverture d'un livre au format 2:3 : l'image trouvée par ISBN, sinon une couverture typographique (titre, premier
 * auteur) sur une teinte propre au livre. La taille vient du parent ; le texte suit la largeur (requête de conteneur).
 */
const props = defineProps<{
  book: Pick<Book, 'title' | 'authors' | 'coverUrl' | 'isbn'> & { id?: string }
}>()

const failed = ref(false)
watch(() => props.book.coverUrl, () => { failed.value = false })

const hue = computed(() => bookHue(props.book.isbn || props.book.id || props.book.title))
const showImage = computed(() => !!props.book.coverUrl && !failed.value)
</script>

<template>
  <div class="book-cover" :style="{ '--book-hue': hue }">
    <img
      v-if="showImage"
      :src="book.coverUrl"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      class="size-full object-cover"
      @error="failed = true"
    >
    <div v-else class="book-cover__plain">
      <p class="book-cover__title">{{ book.title }}</p>
      <p v-if="book.authors[0]" class="book-cover__author">{{ book.authors[0] }}</p>
    </div>
  </div>
</template>

<style scoped>
.book-cover {
  position: relative;
  container-type: inline-size;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 2px 4px 4px 2px;
  background: var(--ui-bg-accented);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 6px 14px -8px rgb(0 0 0 / 0.35);
}

/* Pli de la reliure : un léger ombrage près du dos, sur l'image comme sur la couverture typographique. */
.book-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgb(0 0 0 / 0.16) 0, rgb(255 255 255 / 0.1) 2.5%, transparent 6%);
}

.book-cover__plain {
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: space-between;
  gap: 6cqi;
  padding: 12cqi 10cqi 10cqi 13cqi;
  background: oklch(91% 0.045 var(--book-hue));
  color: oklch(30% 0.06 var(--book-hue));
}

.book-cover__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  font-size: clamp(0.4375rem, 12cqi, 1.25rem);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.02em;
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.book-cover__author {
  overflow: hidden;
  border-top: 1px solid oklch(30% 0.06 var(--book-hue) / 0.3);
  padding-top: 4cqi;
  font-size: clamp(0.375rem, 8cqi, 0.8125rem);
  font-weight: 500;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:root.dark .book-cover__plain {
  background: oklch(34% 0.05 var(--book-hue));
  color: oklch(92% 0.03 var(--book-hue));
}

:root.dark .book-cover__author {
  border-top-color: oklch(92% 0.03 var(--book-hue) / 0.3);
}
</style>
