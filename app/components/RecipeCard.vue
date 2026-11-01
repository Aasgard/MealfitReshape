<script setup lang="ts">
import type { Recipe } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { isBaseRecipe, recipeTypeIcon, recipeTypeLabel } from '~/utils/recipeType'
import { baseKey } from '~/utils/recipeLineSource'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'
import { macrosForRecipe } from '~/utils/recipeNutrition'

const props = withDefaults(defineProps<{
  recipe: Recipe
  /** Ingrédients résolus (id document → Ingredient) pour calculer les macros cumulées de la recette. */
  ingredientsById?: Map<string, Ingredient>
}>(), {
  ingredientsById: () => new Map(),
})

const emit = defineEmits<{
  select: []
  edit: []
  duplicate: []
  delete: []
}>()

const difficultyLabel = computed(() => recipeDifficultyLabel(props.recipe.difficulty))
const difficultyColor = computed(() => recipeDifficultyColor(props.recipe.difficulty))
const isBase = computed(() => isBaseRecipe(props.recipe))
/** Parts d'un plat ; rendement en grammes d'une base (« — » s'il manque). */
const personsLabel = computed(() => (isBase.value
  ? (props.recipe.yieldGrams ? `${props.recipe.yieldGrams.toLocaleString('fr-FR')} g` : '— g')
  : `${props.recipe.persons ?? 1}`))

const ingredientCount = computed(() => props.recipe.ingredients?.length ?? 0)
const ingredientCountLabel = computed(() => ingredientCount.value
  ? `${ingredientCount.value} ingrédient${ingredientCount.value > 1 ? 's' : ''}`
  : 'Aucun ingrédient')

/** Par part pour un plat, pour 100 g pour une base (valeurs de son ingrédient virtuel). */
const macros = computed(() => (isBase.value
  ? props.ingredientsById.get(baseKey(props.recipe.id))?.valuesBy100 ?? { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
  : macrosForRecipe(props.recipe.ingredients, props.ingredientsById, props.recipe.persons ?? 1)))
const hasMacros = computed(() =>
  macros.value.calories > 0 || macros.value.protein > 0 || macros.value.carbohydrates > 0 || macros.value.fat > 0
)

const actionItems = computed(() => [
  [
    { label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
    { label: 'Dupliquer', icon: 'i-lucide-copy', onSelect: () => emit('duplicate') },
  ],
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
          :icon="isBase ? recipeTypeIcon(recipe.type)! : 'i-lucide-utensils'"
          :label="recipeTypeLabel(recipe.type)"
          color="neutral"
          variant="subtle"
          size="sm"
          :ui="{ base: 'bg-default' }"
        />
        <div class="flex items-center gap-2 ml-auto">
          <UBadge
            :icon="isBase ? 'i-lucide-weight' : 'i-lucide-users'"
            :label="personsLabel"
            :title="isBase ? 'Rendement' : 'Parts'"
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
          <UIcon name="i-lucide-cooking-pot" class="size-3.5 shrink-0" />
          <span class="font-medium text-highlighted tabular-nums">{{ recipe.cookTime }}</span> min cuisson
        </span>
      </div>

      <div class="mt-1 flex flex-col gap-1">
        <IngredientMacroSummary :macros="hasMacros ? macros : null" />
        <p v-if="isBase" class="text-xs text-dimmed">Pour 100 g</p>
      </div>

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
