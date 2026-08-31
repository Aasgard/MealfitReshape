<script setup lang="ts">
import type { Recipe } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { recipeTypeLabel } from '~/utils/recipeType'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'
import { macrosForRecipe } from '~/utils/recipeNutrition'

const props = withDefaults(defineProps<{
  recipe: Recipe
  /** Ingrédients résolus (id document → Ingredient) pour calculer les macros cumulées de la recette. */
  ingredientsById?: Map<string, Ingredient>
  /** Index unité → ingrédient parent (voir `buildUnitOwnerIndex`), pour les lignes qui référencent une unité. */
  unitOwnerById?: Map<string, Ingredient>
}>(), {
  ingredientsById: () => new Map(),
  unitOwnerById: () => new Map(),
})

const emit = defineEmits<{
  select: []
  edit: []
  delete: []
}>()

const difficultyLabel = computed(() => recipeDifficultyLabel(props.recipe.difficulty))
const difficultyColor = computed(() => recipeDifficultyColor(props.recipe.difficulty))
const personsLabel = computed(() => `${props.recipe.persons ?? 1}`)

const ingredientCount = computed(() => props.recipe.ingredients?.length ?? 0)
const ingredientCountLabel = computed(() => ingredientCount.value
  ? `${ingredientCount.value} ingrédient${ingredientCount.value > 1 ? 's' : ''}`
  : 'Aucun ingrédient')

const macros = computed(() => macrosForRecipe(props.recipe.ingredients, props.ingredientsById, props.unitOwnerById))
const hasMacros = computed(() =>
  macros.value.calories > 0 || macros.value.protein > 0 || macros.value.carbohydrates > 0 || macros.value.fat > 0
)

const actionItems = computed(() => [
  [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => emit('edit') }],
  [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }],
])
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="`Voir le détail de ${recipe.title}`"
    class="rounded-xl border border-default bg-default overflow-hidden flex flex-col cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
    @click="emit('select')"
    @keydown.enter.self="emit('select')"
    @keydown.space.self.prevent="emit('select')"
  >
    <div class="relative">
      <img
        v-if="recipe.imageUrl"
        :src="recipe.imageUrl"
        :alt="recipe.title"
        class="w-full h-36 object-cover"
      />
      <div v-else class="flex items-center justify-center w-full h-36 bg-accented">
        <UIcon name="i-lucide-image-off" class="size-6 text-dimmed" />
      </div>
      <div class="absolute inset-x-0 top-0 p-2 flex flex-wrap items-start justify-between gap-2">
        <UBadge
          v-if="recipe.type"
          icon="i-lucide-utensils"
          :label="recipeTypeLabel(recipe.type)"
          color="neutral"
          variant="subtle"
          size="sm"
          :ui="{ base: 'bg-default' }"
        />
        <div class="flex items-center gap-2 ml-auto">
          <UBadge
            icon="i-lucide-users"
            :label="personsLabel"
            color="neutral"
            variant="subtle"
            size="sm"
            :ui="{ base: 'bg-default' }"
          />
          <UBadge
            icon="i-lucide-gauge"
            :label="difficultyLabel"
            :color="difficultyColor"
            variant="subtle"
            size="sm"
            :ui="{ base: 'bg-default' }"
          />
        </div>
      </div>
    </div>
    <div class="p-4 flex flex-col gap-2 flex-1">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-highlighted truncate">
            {{ recipe.title }}
          </p>
        </div>
        <UDropdownMenu :items="actionItems" :ui="{ content: 'w-40' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Actions pour ${recipe.title}`"
            @click.stop
          />
        </UDropdownMenu>
      </div>

      <p class="flex items-center gap-1.5 text-xs text-dimmed min-w-0 truncate h-4">
        <template v-if="recipe.tags?.length">
          <UIcon name="i-lucide-tag" class="size-3.5 shrink-0" />
          <span class="truncate">{{ recipe.tags.join(', ') }}</span>
        </template>
      </p>

      <div class="flex items-center gap-3 text-xs text-dimmed mt-1 h-4">
        <span v-if="recipe.prepTime != null" class="flex items-center gap-1 shrink-0">
          <UIcon name="i-lucide-clock" class="size-3.5 shrink-0" />
          <span class="font-medium text-highlighted tabular-nums">{{ recipe.prepTime }}</span> min prép.
        </span>
        <span v-if="recipe.cookTime != null" class="flex items-center gap-1 shrink-0">
          <UIcon name="i-lucide-flame" class="size-3.5 shrink-0" />
          <span class="font-medium text-highlighted tabular-nums">{{ recipe.cookTime }}</span> min cuisson
        </span>
      </div>

      <IngredientMacroSummary v-if="hasMacros" :macros="macros" class="mt-1" />
      <p v-else class="flex items-center gap-1.5 text-xs text-dimmed mt-1">
        <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
        Valeurs non renseignées
      </p>

      <div class="flex flex-wrap items-center gap-2 mt-auto pt-2 border-t border-default">
        <UBadge
          icon="i-lucide-list"
          :label="ingredientCountLabel"
          :color="ingredientCount ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
        />
      </div>
    </div>
  </div>
</template>
