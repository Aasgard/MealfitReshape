<script setup lang="ts">
import type { Recipe } from '~/types/recipe'
import { recipeTypeLabel } from '~/utils/recipeType'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'

const props = defineProps<{
  recipe: Recipe
}>()

const emit = defineEmits<{
  select: []
  edit: []
  delete: []
}>()

const difficultyLabel = computed(() => recipeDifficultyLabel(props.recipe.difficulty))
const difficultyColor = computed(() => recipeDifficultyColor(props.recipe.difficulty))

const ingredientCount = computed(() => props.recipe.ingredients?.length ?? 0)
const ingredientCountLabel = computed(() => ingredientCount.value
  ? `${ingredientCount.value} ingrédient${ingredientCount.value > 1 ? 's' : ''}`
  : 'Aucun ingrédient')

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

      <p v-if="recipe.type" class="text-sm text-muted flex items-center gap-1.5 min-w-0 truncate">
        <UIcon name="i-lucide-utensils" class="size-3.5 shrink-0" />
        <span class="truncate">{{ recipeTypeLabel(recipe.type) }}</span>
      </p>

      <p v-if="recipe.description" class="text-xs text-dimmed truncate">
        {{ recipe.description }}
      </p>

      <div v-if="recipe.prepTime != null || recipe.cookTime != null" class="flex items-center gap-3 text-xs text-dimmed mt-1">
        <span v-if="recipe.prepTime != null" class="flex items-center gap-1 shrink-0">
          <UIcon name="i-lucide-clock" class="size-3.5 shrink-0" />
          <span class="font-medium text-highlighted tabular-nums">{{ recipe.prepTime }}</span> min prép.
        </span>
        <span v-if="recipe.cookTime != null" class="flex items-center gap-1 shrink-0">
          <UIcon name="i-lucide-flame" class="size-3.5 shrink-0" />
          <span class="font-medium text-highlighted tabular-nums">{{ recipe.cookTime }}</span> min cuisson
        </span>
      </div>

      <div class="flex items-center gap-2 mt-1 pt-2 border-t border-default">
        <UBadge
          icon="i-lucide-list"
          :label="ingredientCountLabel"
          :color="ingredientCount ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
        />
        <UBadge
          icon="i-lucide-gauge"
          :label="difficultyLabel"
          :color="difficultyColor"
          variant="subtle"
          size="sm"
        />
      </div>
    </div>
  </div>
</template>
