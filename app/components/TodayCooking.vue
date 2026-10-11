<script setup lang="ts">
import type { TodayCookingRecipe } from '~/types/today'
import { dishStorageOf, wholeRecipeGap } from '~/utils/preparedDishes'

defineProps<{
  /** Recettes à préparer le jour affiché, en une fois pour leurs repas des 7 jours suivants. */
  recipes: TodayCookingRecipe[]
  /** Le jour affiché est aujourd'hui (message vide adapté). */
  isToday?: boolean
}>()

const emit = defineEmits<{
  /** Clic sur une recette : ouvre sa fiche, quantités calculées pour ses parts. */
  open: [recipeId: string, parts: number]
  /** Prévoir (ou modifier) des parts en plus pour le stock. */
  surplus: [recipe: TodayCookingRecipe]
}>()

const formatNumber = (parts: number) => parts.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

const formatParts = (parts: number) => `${formatNumber(parts)} part${parts > 1 ? 's' : ''}`

/** Écart à des recettes entières ; `null` quand le compte est rond. */
const gapOf = (recipe: TodayCookingRecipe) => wholeRecipeGap(recipe.parts, recipe.persons)
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-default bg-default">
    <p v-if="!recipes.length" class="p-4 text-sm text-muted">
      Aucune recette à cuisiner {{ isToday ? "aujourd'hui" : 'ce jour-là' }}.
    </p>

    <ul v-else class="divide-y divide-default">
      <!-- Le bouton du stock est à côté de la zone cliquable, pas dedans : un <button> ne peut pas en contenir un autre. -->
      <li v-for="recipe in recipes" :key="recipe.recipeId" class="flex items-center">
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-4 pe-2 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
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
            <!--
              Un bloc insécable par jour : un retour à la ligne commence toujours par un jour.
              Chaque bloc porte son « · » devant lui ; la marge négative pousse celui d'un début de ligne hors du cadre, qui le masque.
              Le surplus pour le stock ferme la ligne, comme un récipient de plus.
            -->
            <span class="mt-0.5 block overflow-hidden text-xs text-dimmed">
              <span class="-ms-3 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span
                  v-for="day in recipe.days"
                  :key="day.key"
                  class="inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <span class="w-2 text-center" aria-hidden="true">·</span>
                  <span>{{ day.label }}</span>
                  <span
                    v-for="portion in day.portions"
                    :key="portion.key"
                    class="inline-flex items-center gap-0.5"
                  >
                    <UIcon
                      v-if="portion.meal"
                      :name="portion.meal.icon"
                      class="size-3.5 shrink-0"
                      :title="portion.meal.label"
                      aria-hidden="true"
                    />
                    <span v-if="portion.meal" class="sr-only">{{ portion.meal.label }}</span>
                    <span class="font-semibold tabular-nums text-muted">{{ formatNumber(portion.parts) }}</span>
                  </span>
                </span>
                <span v-if="recipe.surplus" class="inline-flex items-center gap-1 whitespace-nowrap text-primary">
                  <span class="w-2 text-center text-dimmed" aria-hidden="true">·</span>
                  <UIcon :name="dishStorageOf(recipe.surplus.storage).icon" class="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Stock</span>
                  <span class="font-semibold tabular-nums">{{ formatNumber(recipe.surplus.parts) }}</span>
                </span>
              </span>
            </span>
          </div>
          <!-- Alerte condensée : les parts ne font pas un nombre entier de recettes (ex. 3 parts d'une recette de 4). -->
          <div v-if="gapOf(recipe)" class="flex shrink-0 flex-col items-end text-warning" :title="`La recette fait ${formatParts(recipe.persons!)}`">
            <p class="flex items-center gap-1 text-sm font-semibold tabular-nums">
              <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" aria-hidden="true" />
              {{ formatParts(recipe.parts) }}
            </p>
            <p class="text-xs tabular-nums">
              {{ formatNumber(gapOf(recipe)!.recipes) }} recette{{ gapOf(recipe)!.recipes >= 2 ? 's' : '' }}<span class="sr-only"> de {{ formatParts(recipe.persons!) }} : pas un nombre entier</span>
            </p>
          </div>
          <p v-else class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">
            {{ formatParts(recipe.parts) }}
          </p>
        </button>
        <UTooltip :text="recipe.surplus ? 'Modifier le surplus pour le stock' : 'En faire plus pour le stock'">
          <UButton
            :icon="recipe.surplus ? 'i-lucide-archive' : 'i-lucide-package-plus'"
            :color="recipe.surplus ? 'primary' : 'neutral'"
            variant="ghost"
            class="me-2 shrink-0"
            :class="!recipe.surplus && 'text-dimmed'"
            :aria-label="recipe.surplus
              ? `Modifier le surplus de ${recipe.title} pour le stock (${formatParts(recipe.surplus.parts)})`
              : `En faire plus pour le stock : ${recipe.title}`"
            @click="emit('surplus', recipe)"
          />
        </UTooltip>
      </li>
    </ul>
  </div>
</template>
