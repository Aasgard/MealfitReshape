<script setup lang="ts">
/**
 * Repère des magasins retenus pour un ingrédient (page Ingrédients) : l'icône magasin suivie de la pastille d'enseigne
 * de chacun, les noms en infobulle. Rien si l'ingrédient s'achète partout, ou hors d'une page qui fournit les magasins
 * (`STORES_KEY`).
 */
import type { Store } from '~/types/store'
import { storeColor } from '~/utils/stores'

const props = defineProps<{
  ingredientId: string
}>()

const stores = inject(STORES_KEY, null)

const ingredientStores = computed<Store[]>(() => (stores
  ? stores.storesForIngredient(props.ingredientId).flatMap(id => stores.storesById.value.get(id) ?? [])
  : []))

const names = computed(() => ingredientStores.value.map(store => store.name).join(', '))
</script>

<template>
  <UTooltip v-if="ingredientStores.length" :text="names">
    <span class="inline-flex shrink-0 items-center gap-1 text-muted" :aria-label="`Magasins : ${names}`" role="img">
      <UIcon name="i-lucide-store" class="size-3.5" aria-hidden="true" />
      <span class="flex items-center -space-x-0.5" aria-hidden="true">
        <span
          v-for="store in ingredientStores"
          :key="store.id"
          class="size-2.5 rounded-full outline -outline-offset-1 ring-1 ring-(--ui-bg)"
          :class="storeColor(store.color).dot"
        />
      </span>
    </span>
  </UTooltip>
</template>
