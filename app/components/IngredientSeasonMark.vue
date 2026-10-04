<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import { isIngredientInSeason } from '~/utils/ingredientSeason'

const props = defineProps<{
  ingredient: Ingredient
  /** Ne montre que la feuille « de saison » (listes compactes) : rien pour « Toute l'année » ni « Hors saison ». */
  compact?: boolean
}>()

const inSeason = computed(() => isIngredientInSeason(props.ingredient))
const allYear = computed(() => (props.ingredient.activeMonths?.length ?? 0) === 12)
</script>

<template>
  <span v-if="allYear && !compact" class="text-xs text-dimmed whitespace-nowrap">Toute l'année</span>
  <span
    v-else-if="inSeason && !allYear"
    class="inline-flex items-center justify-center size-5 rounded-full bg-primary/10 shrink-0"
    title="De saison"
  >
    <UIcon name="i-lucide-leaf" class="size-3 text-primary" />
    <span class="sr-only">De saison</span>
  </span>
  <span v-else-if="!compact" class="text-xs text-dimmed whitespace-nowrap">Hors saison</span>
</template>
