<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import { categoryIconName } from '~/utils/categoryIcon'
import { isIngredientInSeason } from '~/utils/ingredientSeason'

const props = defineProps<{
  ingredient: Ingredient
  ownedByUser: boolean
}>()

const emit = defineEmits<{
  select: []
  edit: []
  delete: []
}>()

const inSeason = computed(() => isIngredientInSeason(props.ingredient))
const unitCount = computed(() => Object.keys(props.ingredient.units ?? {}).length)
const unitLabel = computed(() => unitCount.value
  ? `${unitCount.value} unité${unitCount.value > 1 ? 's' : ''}`
  : 'Aucune unité')
const macros = computed(() => props.ingredient.valuesBy100 ?? null)

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
      `Voir le détail de ${ingredient.label}`,
      macros ? `${Math.round(macros.calories)} kcal pour 100 g` : null,
      inSeason ? 'de saison' : null,
    ].filter(Boolean).join(', ')"
    class="rounded-xl border border-default bg-default overflow-hidden flex flex-col cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
    style="content-visibility: auto; contain-intrinsic-size: 0 200px;"
    @click="emit('select')"
    @keydown.enter.self="emit('select')"
    @keydown.space.self.prevent="emit('select')"
  >
    <div class="p-4 flex flex-col gap-2 flex-1">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-highlighted truncate">
            {{ ingredient.label }}
          </p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <UBadge v-if="ownedByUser" label="Privé" variant="subtle" size="sm" />
          <UDropdownMenu :items="actionItems" :ui="{ content: 'w-40' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="`Actions pour ${ingredient.label}`"
              @click.stop
            />
          </UDropdownMenu>
        </div>
      </div>

      <!-- Ligne toujours présente (h-5), même sans catégorie : les cartes d'une grille gardent la même géométrie. -->
      <p class="h-5 text-sm text-muted flex items-center gap-1.5 min-w-0">
        <template v-if="ingredient.category?.label">
          <UIcon v-if="categoryIconName(ingredient.category.icon)" :name="categoryIconName(ingredient.category.icon)!" class="size-3.5 shrink-0" />
          <span class="truncate">{{ ingredient.category.label }}</span>
        </template>
      </p>

      <IngredientMacroSummary :macros="macros" class="mt-1" />

      <div class="flex items-center gap-2 mt-auto pt-2 border-t border-default">
        <UBadge
          icon="i-lucide-git-branch"
          :label="unitLabel"
          :color="unitCount ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
        />
        <IngredientSeasonMark :ingredient="ingredient" class="ml-auto" />
      </div>
    </div>
  </div>
</template>
