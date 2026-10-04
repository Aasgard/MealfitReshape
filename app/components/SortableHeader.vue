<script setup lang="ts" generic="K extends string">
import type { SortOption, SortState } from '~/utils/listSort'

/** En-tête de colonne cliquable ; la colonne triée passe en indigo (critère actif) avec une flèche de sens. */
const props = defineProps<{
  option: SortOption<K>
  sort: SortState<K>
  /** Padding gauche réduit (pl-2) : colonnes de valeurs. */
  dense?: boolean
  /** Alignement du titre ; à droite, les cellules de la colonne utilisent le même padding (pl-2 pr-5) pour s'aligner sur lui. */
  align?: 'left' | 'right'
}>()

const emit = defineEmits<{
  sort: [option: SortOption<K>]
}>()

const active = computed(() => props.sort.key === props.option.key)
const ariaSort = computed(() => {
  if (!active.value) return 'none'
  return props.sort.direction === 'asc' ? 'ascending' : 'descending'
})
const arrowIcon = computed(() => {
  if (!active.value) return 'i-lucide-chevrons-up-down'
  return props.sort.direction === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
})
</script>

<template>
  <th scope="col" :aria-sort="ariaSort" class="p-0 font-normal" :class="align === 'right' ? 'text-right' : 'text-left'">
    <!--
      La flèche de tri suit le titre, dans un padding droit qui lui est réservé (pr-5), pour ne jamais être recouverte
      par l'en-tête voisin. Colonnes de valeurs : titre aligné à droite, cellules en pl-2 pr-5 text-right, si bien que
      titre et valeurs se terminent au même endroit. Colonnes de texte (nom, catégorie) : alignées à gauche.
    -->
    <button
      type="button"
      class="group inline-flex items-center py-2.5 pr-5 text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary rounded-sm"
      :class="[
        dense ? 'pl-2' : 'pl-3',
        active ? 'text-primary' : 'text-muted hover:text-highlighted',
      ]"
      @click="emit('sort', option)"
    >
      <span class="relative inline-flex items-center gap-1 whitespace-nowrap">
        <slot>{{ option.label }}</slot>
        <UIcon
          :name="arrowIcon"
          class="absolute left-full ml-0.5 size-3 shrink-0"
          :class="active ? '' : 'opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60'"
        />
      </span>
    </button>
  </th>
</template>
