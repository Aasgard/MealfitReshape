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
const allYear = computed(() => (props.ingredient.activeMonths?.length ?? 0) === 12)
const unitCount = computed(() => Object.keys(props.ingredient.units ?? {}).length)
const unitLabel = computed(() => unitCount.value
  ? `${unitCount.value} unité${unitCount.value > 1 ? 's' : ''}`
  : 'Aucune unité')
const macros = computed(() => props.ingredient.valuesBy100 ?? null)

const macroTotal = computed(() => macros.value ? macros.value.carbohydrates + macros.value.protein + macros.value.fat : 0)

/** Segments de la barre de composition, dans l'ordre G/P/L utilisé partout ailleurs ; les macros à 0 sont omises pour éviter un segment invisible collé à un gap. */
const macroSegments = computed(() => {
  if (!macros.value || macroTotal.value <= 0) return []
  return ([
    { key: 'carbohydrates', value: macros.value.carbohydrates, colorClass: 'bg-green-500' },
    { key: 'protein', value: macros.value.protein, colorClass: 'bg-red-700' },
    { key: 'fat', value: macros.value.fat, colorClass: 'bg-amber-500' },
  ] as const)
    .filter(segment => segment.value > 0)
    .map(segment => ({ ...segment, width: `${(segment.value / macroTotal.value) * 100}%` }))
})

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
      macros ? `${macros.calories} kcal pour 100 g` : null,
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

      <div class="flex items-center gap-2">
        <p v-if="ingredient.category?.label" class="text-sm text-muted flex items-center gap-1.5 min-w-0 truncate">
          <UIcon v-if="categoryIconName(ingredient.category.icon)" :name="categoryIconName(ingredient.category.icon)!" class="size-3.5 shrink-0" />
          <span class="truncate">{{ ingredient.category.label }}</span>
        </p>
      </div>

      <div v-if="macros" class="flex flex-col gap-1.5 mt-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dimmed">
          <span class="flex items-center gap-1 shrink-0">
            <span class="size-2 rounded-full bg-green-500 shrink-0" />
            G <span class="font-medium text-highlighted tabular-nums">{{ macros.carbohydrates }}g</span>
          </span>
          <span class="flex items-center gap-1 shrink-0">
            <span class="size-2 rounded-full bg-red-700 shrink-0" />
            P <span class="font-medium text-highlighted tabular-nums">{{ macros.protein }}g</span>
          </span>
          <span class="flex items-center gap-1 shrink-0">
            <span class="size-2 rounded-full bg-amber-500 shrink-0" />
            L <span class="font-medium text-highlighted tabular-nums">{{ macros.fat }}g</span>
          </span>
          <p class="flex items-baseline gap-1 shrink-0 ml-auto">
            <span class="font-semibold text-highlighted tabular-nums">{{ macros.calories }}</span>
            <span>kcal</span>
          </p>
        </div>
        <div class="flex h-1.5 rounded-full bg-accented overflow-hidden gap-0.5">
          <div
            v-for="segment in macroSegments"
            :key="segment.key"
            class="h-full rounded-full transition-all duration-500"
            :class="segment.colorClass"
            :style="{ width: segment.width }"
          />
        </div>
      </div>
      <p v-else class="flex items-center gap-1.5 text-xs text-dimmed mt-1">
        <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
        Valeurs non renseignées
      </p>

      <div class="flex items-center gap-2 mt-1 pt-2 border-t border-default">
        <UBadge
          icon="i-lucide-git-branch"
          :label="unitLabel"
          :color="unitCount ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
        />
        <span v-if="allYear" class="text-xs text-dimmed ml-auto">Toute l'année</span>
        <span
          v-else-if="inSeason"
          class="flex items-center justify-center size-5 rounded-full bg-primary/10 ml-auto"
          title="De saison"
        >
          <UIcon name="i-lucide-leaf" class="size-3 text-primary" />
        </span>
        <span v-else class="text-xs text-dimmed ml-auto">Hors saison</span>
      </div>
    </div>
  </div>
</template>
