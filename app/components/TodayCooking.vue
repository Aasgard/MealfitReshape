<script setup lang="ts">
import type { TodayCookingRecipe } from '~/types/today'

defineProps<{
  /** Recettes à préparer le jour affiché, en une fois pour leurs repas des 7 jours suivants. */
  recipes: TodayCookingRecipe[]
  /** Le jour affiché est aujourd'hui (message vide adapté). */
  isToday?: boolean
}>()

const emit = defineEmits<{
  /** Clic sur une recette : ouvre sa fiche, quantités calculées pour ses parts. */
  open: [recipeId: string, parts: number]
}>()

const formatParts = (parts: number) =>
  `${parts.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} part${parts > 1 ? 's' : ''}`
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-default bg-default">
    <p v-if="!recipes.length" class="p-4 text-sm text-muted">
      Aucune recette à cuisiner {{ isToday ? "aujourd'hui" : 'ce jour-là' }}.
    </p>

    <ul v-else class="divide-y divide-default">
      <li v-for="recipe in recipes" :key="recipe.recipeId">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 p-4 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          @click="emit('open', recipe.recipeId, recipe.parts)"
        >
          <img
            v-if="recipe.imageUrl"
            :src="recipe.imageUrl"
            alt=""
            loading="lazy"
            class="size-10 shrink-0 rounded-full bg-accented object-cover"
          >
          <div v-else class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
            <UIcon name="i-lucide-chef-hat" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-highlighted">
              {{ recipe.title }}
            </p>
            <p class="truncate text-xs text-dimmed">
              {{ recipe.daysLabel }}
            </p>
          </div>
          <p class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">
            {{ formatParts(recipe.parts) }}
          </p>
        </button>
      </li>
    </ul>
  </div>
</template>
