<script setup lang="ts">
import type { RecipePreview } from '~/types/recipe'

const props = defineProps<{
  recipe: RecipePreview
}>()

const emit = defineEmits<{
  select: []
  edit: []
  delete: []
  favorite: []
}>()

const ingredientCount = computed(() => props.recipe.ingredientsPreview
  ? props.recipe.ingredientsPreview.split(',').map(s => s.trim()).filter(Boolean).length
  : 0)
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
    :aria-label="[
      `Voir le détail de ${recipe.title}`,
      `${recipe.calories} kcal`,
      recipe.isFavorite ? 'favori' : null,
    ].filter(Boolean).join(', ')"
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
        <div class="flex items-center gap-1 shrink-0">
          <UButton
            icon="i-lucide-heart"
            :color="recipe.isFavorite ? 'primary' : 'neutral'"
            :variant="recipe.isFavorite ? 'solid' : 'ghost'"
            size="xs"
            :aria-label="recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
            :aria-pressed="recipe.isFavorite"
            :ui="{ leadingIcon: recipe.isFavorite ? 'fill-current' : '' }"
            @click.stop="emit('favorite')"
          />
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
      </div>

      <p class="text-sm text-muted flex items-center gap-1.5 min-w-0 truncate">
        <UIcon name="i-lucide-utensils" class="size-3.5 shrink-0" />
        <span class="truncate">{{ recipe.category }}</span>
      </p>

      <p class="text-xs text-dimmed truncate">
        {{ recipe.ingredientsPreview }}
      </p>

      <div class="flex items-center gap-3 text-xs text-dimmed mt-1">
        <span class="flex items-center gap-1 shrink-0">
          <UIcon name="i-lucide-clock" class="size-3.5 shrink-0" />
          <span class="font-medium text-highlighted tabular-nums">{{ recipe.prepTime }}</span> min
        </span>
        <p class="flex items-baseline gap-1 shrink-0 ml-auto">
          <span class="font-semibold text-highlighted tabular-nums">{{ recipe.calories }}</span>
          <span>kcal</span>
        </p>
      </div>

      <div class="flex items-center gap-2 mt-1 pt-2 border-t border-default">
        <UBadge
          icon="i-lucide-list"
          :label="ingredientCountLabel"
          :color="ingredientCount ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
        />
        <span class="text-xs text-dimmed ml-auto">{{ recipe.difficulty }}</span>
      </div>
    </div>
  </div>
</template>
