<script setup lang="ts">
/**
 * Magasins réduits à leurs pastilles d'enseigne, serrées les unes contre les autres ; les noms en infobulle native et
 * pour les lecteurs d'écran (`label` les précède, ex. « Aussi chez »).
 */
import type { Store } from '~/types/store'
import { storeColor } from '~/utils/stores'

const props = withDefaults(defineProps<{
  stores: Pick<Store, 'id' | 'name' | 'color'>[]
  label?: string
}>(), { label: 'Magasins' })

const names = computed(() => `${props.label} : ${props.stores.map(store => store.name).join(', ')}`)
</script>

<template>
  <span v-if="stores.length" class="inline-flex shrink-0 items-center -space-x-0.5" role="img" :aria-label="names" :title="names">
    <span
      v-for="store in stores"
      :key="store.id"
      class="size-2.5 rounded-full outline -outline-offset-1 ring-1 ring-(--ui-bg)"
      :class="storeColor(store.color).dot"
    />
  </span>
</template>
