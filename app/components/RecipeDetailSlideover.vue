<script setup lang="ts">
import type { Recipe } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { recipeTypeLabel } from '~/utils/recipeType'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'
import { describeRecipeLine, macrosForRecipe } from '~/utils/recipeNutrition'

const props = defineProps<{
  recipe: Recipe | null
  /** Catalogue d'ingrédients (privés + publics) pour résoudre les noms, quantités et macros des lignes. */
  ingredientsById: Map<string, Ingredient>
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const { formatDate } = useDateFormat()

const persons = computed(() => props.recipe?.persons ?? 1)

const macros = computed(() => macrosForRecipe(props.recipe?.ingredients, props.ingredientsById, persons.value))
const hasMacros = computed(() => {
  const m = macros.value
  return m.calories > 0 || m.protein > 0 || m.carbohydrates > 0 || m.fat > 0
})

/** Lignes d'ingrédients résolues (nom + quantité affichable). */
const lines = computed(() => {
  const recipe = props.recipe
  if (!recipe?.ingredients?.length) return []
  return recipe.ingredients.map((line, idx) => {
    const described = describeRecipeLine(line, props.ingredientsById)
    return {
      key: `${line.ingredientRef?.id ?? 'unknown'}-${idx}`,
      label: described?.label ?? 'Ingrédient introuvable',
      quantityLabel: described?.quantityLabel ?? `${line.quantity}`,
    }
  })
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="recipe?.title"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <img
          v-if="recipe?.imageUrl"
          :src="recipe.imageUrl"
          :alt="recipe.title"
          class="w-full h-40 object-cover rounded-lg"
        />

        <!-- Repas / difficulté / parts / temps -->
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            v-if="recipe?.type"
            icon="i-lucide-utensils"
            :label="recipeTypeLabel(recipe.type)"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            icon="i-lucide-gauge"
            :label="recipeDifficultyLabel(recipe?.difficulty)"
            :color="recipeDifficultyColor(recipe?.difficulty)"
            variant="subtle"
            size="sm"
          />
          <UBadge
            icon="i-lucide-users"
            :label="`${persons} part${persons > 1 ? 's' : ''}`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="recipe?.prepTime != null"
            icon="i-lucide-clock"
            :label="`${recipe.prepTime} min prép.`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="recipe?.cookTime != null"
            icon="i-lucide-flame"
            :label="`${recipe.cookTime} min cuisson`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>

        <!-- Valeurs nutritionnelles -->
        <div v-if="hasMacros">
          <p class="text-xs text-dimmed mb-2">Valeurs nutritionnelles pour une part</p>
          <IngredientMacroSummary :macros="macros" />
        </div>
        <p v-if="!hasMacros" class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
          Valeurs non renseignées
        </p>

        <!-- Ingrédients -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-list" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Ingrédients</p>
          </div>
          <ul v-if="lines.length" class="rounded-lg border border-default bg-elevated overflow-hidden">
            <li
              v-for="line in lines"
              :key="line.key"
              class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-default last:border-b-0"
            >
              <span class="text-sm font-medium text-highlighted truncate">{{ line.label }}</span>
              <span class="text-sm tabular-nums text-muted shrink-0">{{ line.quantityLabel }}</span>
            </li>
          </ul>
          <p v-else class="flex items-center gap-1.5 text-xs text-dimmed">
            <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
            Aucun ingrédient
          </p>
        </div>

        <!-- Tags -->
        <div v-if="recipe?.tags?.length">
          <p class="text-xs text-dimmed mb-2">Tags</p>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="tag in recipe.tags"
              :key="tag"
              :label="tag"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
        </div>

        <!-- Description -->
        <div v-if="recipe?.description">
          <p class="text-xs text-dimmed mb-1">Description</p>
          <p class="text-sm text-muted whitespace-pre-line">{{ recipe.description }}</p>
        </div>

        <!-- Instructions -->
        <div v-if="recipe?.instructions">
          <p class="text-xs text-dimmed mb-1">Instructions</p>
          <p class="text-sm text-muted whitespace-pre-line">{{ recipe.instructions }}</p>
        </div>

        <!-- Source -->
        <div v-if="recipe?.source">
          <p class="text-xs text-dimmed mb-1">Source</p>
          <p class="text-sm text-muted">{{ recipe.source }}</p>
        </div>

        <!-- Modifiée le -->
        <div v-if="recipe">
          <p class="text-xs text-dimmed mb-1">Modifiée le</p>
          <p class="text-sm text-muted">{{ formatDate(recipe.updatedAt) }}</p>
        </div>
      </div>
    </template>
  </USlideover>
</template>
