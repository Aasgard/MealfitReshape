<script setup lang="ts">
/**
 * Nom d'un magasin, précédé de sa pastille d'enseigne (DESIGN.md, « The Store Identity Exception ») : seule la
 * pastille est en couleur, le nom suit le texte autour. La couleur ne sert qu'à reconnaître le magasin.
 */
import type { Store } from '~/types/store'
import { storeColor } from '~/utils/stores'

withDefaults(defineProps<{
  store: Pick<Store, 'name' | 'color'>
  /** Pastille seule devant le nom ; `false` : le nom seul. */
  dot?: boolean
}>(), { dot: true })
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1.5">
    <span v-if="dot" class="size-2 shrink-0 rounded-full outline -outline-offset-1" :class="storeColor(store.color).dot" aria-hidden="true" />
    <span class="truncate">{{ store.name }}</span>
  </span>
</template>
