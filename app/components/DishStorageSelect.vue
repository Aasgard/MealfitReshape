<script setup lang="ts">
import type { DishStorage } from '~/types/preparedDish'
import { DISH_STORAGES } from '~/utils/preparedDishes'

/** Choix du rangement d'un plat du stock : congélateur, frigo ou ambiant, chacun avec son icône. */
const storage = defineModel<DishStorage>({ required: true })
</script>

<template>
  <div role="radiogroup" aria-label="Rangement" class="grid grid-cols-3 gap-1 rounded-lg bg-elevated p-1">
    <button
      v-for="option in DISH_STORAGES"
      :key="option.key"
      type="button"
      role="radio"
      :aria-checked="storage === option.key"
      class="flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary"
      :class="storage === option.key ? 'bg-default text-primary shadow-sm ring ring-default' : 'text-muted hover:text-highlighted'"
      @click="storage = option.key"
    >
      <UIcon :name="option.icon" class="size-5" aria-hidden="true" />
      {{ option.label }}
    </button>
  </div>
</template>
