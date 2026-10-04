<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { Recipe } from '~/types/recipe'
import type { IngredientMacros } from '~/utils/ingredientNutrition'
import { nextSort, type SortOption, type SortState } from '~/utils/listSort'
import { recipeDifficultyRank, recipeSortOption, recipeTotalTime, type RecipeSortKey } from '~/utils/recipeSort'
import { recipeTypeIcon, recipeTypeLabel } from '~/utils/recipeType'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'

/**
 * Vue liste des recettes : un tableau triable par colonne à partir de `lg`, une liste compacte sur deux lignes en dessous.
 * Le tri est un état de la page (partagé avec la vue cartes) : ce composant ne fait que l'afficher et le modifier.
 *
 * Coût de rendu : une seule des deux variantes est montée (pas de masquage CSS), les lignes n'utilisent que des
 * éléments natifs, et un menu d'actions unique (SharedActionsMenu) sert toutes les lignes.
 */
const props = defineProps<{
  recipes: Recipe[]
  /** Macros par part, par id de recette ; `null` = valeurs non calculables. */
  macrosById: Map<string, IngredientMacros | null>
  loading?: boolean
}>()

const sort = defineModel<SortState<RecipeSortKey>>('sort', { required: true })

const emit = defineEmits<{
  select: [recipe: Recipe]
  edit: [recipe: Recipe]
  duplicate: [recipe: Recipe]
  delete: [recipe: Recipe]
}>()

const isDesktop = useMediaQuery('(min-width: 1024px)')

const onSort = (option: SortOption<RecipeSortKey>) => {
  sort.value = nextSort(sort.value, option)
}

const MACRO_COLUMNS = [
  { key: 'carbohydrates', short: 'G', dot: 'bg-green-500' },
  { key: 'protein', short: 'P', dot: 'bg-red-700' },
  { key: 'fat', short: 'L', dot: 'bg-amber-500' },
] as const

/** Temps de préparation puis de cuisson, en colonnes séparées (le temps total reste dans la liste compacte). */
const TIME_COLUMNS = ['prepTime', 'cookTime'] as const

const isSorted = (key: RecipeSortKey) => sort.value.key === key
/** La colonne triée ressort : c'est elle que l'œil compare de ligne en ligne. */
const valueClass = (key: RecipeSortKey) => isSorted(key) ? 'text-highlighted font-semibold' : 'text-default'

const round = (n: number) => Math.round(n)
const macrosOf = (recipe: Recipe) => props.macrosById.get(recipe.id) ?? null

/** Jauge compacte de difficulté : 1 à 3 barres remplies aux couleurs de la difficulté (libellé en infobulle). */
const DIFFICULTY_BAR_COLOR_CLASS = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  neutral: 'bg-muted',
} as const
const difficultyBars = (recipe: Recipe) => {
  const rank = recipeDifficultyRank(recipe.difficulty)
  if (rank == null) return null
  const fill = DIFFICULTY_BAR_COLOR_CLASS[recipeDifficultyColor(recipe.difficulty)]
  return [0, 1, 2].map(i => i <= rank ? fill : 'bg-accented')
}

const actionsMenu = ref<{ toggle: (event: MouseEvent) => void } | null>(null)
const actionsTarget = shallowRef<Recipe | null>(null)
const actionItems = computed(() => {
  const recipe = actionsTarget.value
  if (!recipe) return []
  return [
    [
      { label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => emit('edit', recipe) },
      { label: 'Dupliquer', icon: 'i-lucide-copy', onSelect: () => emit('duplicate', recipe) },
    ],
    [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', recipe) }],
  ]
})
const openActions = (recipe: Recipe, event: MouseEvent) => {
  actionsTarget.value = recipe
  actionsMenu.value?.toggle(event)
}

const skeletonRows = computed(() => Array.from({ length: props.loading ? 10 : 0 }, (_, i) => i))
</script>

<template>
  <!-- Desktop : le cadre du tableau ne bouge pas (bordure, coins, en-tête) ; seules les lignes défilent à l'intérieur. -->
  <div v-if="isDesktop" class="flex-1 min-h-0 rounded-xl border border-default bg-default overflow-y-auto overflow-x-hidden overscroll-contain">
    <table class="w-full border-separate border-spacing-0 text-sm">
      <caption class="sr-only">
        Recettes, valeurs nutritionnelles par part
      </caption>
      <thead>
        <tr class="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-default [&>th]:border-b [&>th]:border-default">
          <!-- Ordre : nom, kcal, ratio, G, P, L, type, difficulté, préparation, cuisson, ingrédients. -->
          <SortableHeader :option="recipeSortOption('title')" :sort="sort" class="pl-1" @sort="onSort" />
          <SortableHeader :option="recipeSortOption('calories')" :sort="sort" dense align="right" @sort="onSort">
            <span title="Calories par part">kcal</span>
          </SortableHeader>
          <!-- Trié par part de protéines (protéines / G + P + L). -->
          <SortableHeader :option="recipeSortOption('ratio')" :sort="sort" dense align="right" @sort="onSort">
            <span title="Trier par part de protéines">Ratio</span>
          </SortableHeader>
          <SortableHeader
            v-for="column in MACRO_COLUMNS"
            :key="column.key"
            :option="recipeSortOption(column.key)"
            :sort="sort"
            dense
            align="right"
           
            @sort="onSort"
          >
            <span class="size-2 rounded-full shrink-0" :class="column.dot" />
            <span aria-hidden="true">{{ column.short }}</span>
            <span class="sr-only">{{ recipeSortOption(column.key).label }}</span>
          </SortableHeader>
          <SortableHeader :option="recipeSortOption('type')" :sort="sort" dense align="right" class="hidden xl:table-cell" @sort="onSort">
            <UIcon name="i-lucide-utensils" class="size-4" aria-hidden="true" title="Type" />
            <span class="sr-only">Type</span>
          </SortableHeader>
          <SortableHeader :option="recipeSortOption('difficulty')" :sort="sort" dense align="right" @sort="onSort">
            <UIcon name="i-lucide-gauge" class="size-4" aria-hidden="true" title="Difficulté" />
            <span class="sr-only">Difficulté</span>
          </SortableHeader>
          <SortableHeader :option="recipeSortOption('prepTime')" :sort="sort" dense align="right" @sort="onSort">
            <UIcon name="i-lucide-clock" class="size-4" aria-hidden="true" title="Préparation" />
            <span class="sr-only">Préparation</span>
          </SortableHeader>
          <SortableHeader :option="recipeSortOption('cookTime')" :sort="sort" dense align="right" @sort="onSort">
            <UIcon name="i-lucide-cooking-pot" class="size-4" aria-hidden="true" title="Cuisson" />
            <span class="sr-only">Cuisson</span>
          </SortableHeader>
          <SortableHeader :option="recipeSortOption('ingredients')" :sort="sort" dense align="right" class="hidden xl:table-cell" @sort="onSort">
            <UIcon name="i-lucide-list" class="size-4" aria-hidden="true" title="Ingrédients" />
            <span class="sr-only">Ingrédients</span>
          </SortableHeader>
          <th scope="col" class="w-px">
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>

      <tbody class="[&>tr:not(:first-child)>td]:border-t [&>tr>td]:border-default">
        <template v-if="loading">
          <tr v-for="i in skeletonRows" :key="`skeleton-${i}`">
            <td class="px-4 py-2"><div class="flex items-center gap-2.5"><USkeleton class="size-6 shrink-0" /><USkeleton class="h-4 w-48" /></div></td>
            <td class="pl-2 pr-5 py-3"><USkeleton class="h-4 w-8 ml-auto" /></td>
            <td class="pl-2 pr-5 py-3"><USkeleton class="size-5 rounded-full ml-auto" /></td>
            <td v-for="c in 3" :key="c" class="pl-2 pr-5 py-3"><USkeleton class="h-4 w-8 ml-auto" /></td>
            <td class="hidden xl:table-cell pl-2 pr-5 py-3"><USkeleton class="size-4 ml-auto" /></td>
            <td class="pl-2 pr-5 py-3"><USkeleton class="h-3 w-4 ml-auto" /></td>
            <td v-for="c in 2" :key="`t${c}`" class="pl-2 pr-5 py-3"><USkeleton class="h-4 w-8 ml-auto" /></td>
            <td class="hidden xl:table-cell pl-2 pr-5 py-3"><USkeleton class="h-4 w-8 ml-auto" /></td>
            <td class="px-3 py-3" />
          </tr>
        </template>

        <template v-else>
          <tr
            v-for="recipe in recipes"
            :key="recipe.id"
            class="cursor-pointer transition-colors hover:[&>td]:bg-elevated/60"
            @click="emit('select', recipe)"
          >
            <td class="w-full max-w-0 pl-4 pr-3 py-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <!-- Miniature 24 px : la hauteur du bouton « ⋮ », qui fixe déjà celle de la ligne. -->
                <img
                  v-if="recipe.imageUrl"
                  :src="recipe.imageUrl"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  class="size-6 shrink-0 rounded-sm object-cover bg-accented"
                >
                <span v-else class="flex items-center justify-center size-6 shrink-0 rounded-sm bg-accented" aria-hidden="true">
                  <UIcon name="i-lucide-image-off" class="size-3 text-dimmed" />
                </span>
                <button
                  type="button"
                  class="min-w-0 truncate text-left font-medium text-highlighted rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-default"
                  :title="recipe.title"
                  :aria-label="`Voir le détail de ${recipe.title}`"
                  @click.stop="emit('select', recipe)"
                >
                  {{ recipe.title }}
                </button>
              </div>
            </td>

            <template v-if="macrosOf(recipe)">
              <td class="pl-2 pr-5 py-2 text-right tabular-nums whitespace-nowrap" :class="valueClass('calories')">
                {{ round(macrosOf(recipe)!.calories) }}
              </td>
              <td class="pl-2 pr-5 py-2">
                <MacroPie
                  :carbohydrates="macrosOf(recipe)!.carbohydrates"
                  :protein="macrosOf(recipe)!.protein"
                  :fat="macrosOf(recipe)!.fat"
                  size-class="size-5 block ml-auto"
                />
              </td>
              <td
                v-for="column in MACRO_COLUMNS"
                :key="column.key"
                class="pl-2 pr-5 py-2 text-right tabular-nums whitespace-nowrap"
                :class="valueClass(column.key)"
              >
                {{ round(macrosOf(recipe)![column.key]) }}<span class="ml-0.5 text-xs font-normal text-dimmed">g</span>
              </td>
            </template>
            <td v-else colspan="5" class="pl-2 pr-5 py-2 text-right text-xs text-dimmed whitespace-nowrap">
              Valeurs non renseignées
            </td>

            <td class="hidden xl:table-cell pl-2 pr-5 py-2 text-right">
              <span v-if="recipeTypeIcon(recipe.type)" class="inline-flex" :title="recipeTypeLabel(recipe.type)">
                <UIcon :name="recipeTypeIcon(recipe.type)!" class="size-4" :class="isSorted('type') ? 'text-highlighted' : 'text-muted'" aria-hidden="true" />
                <span class="sr-only">{{ recipeTypeLabel(recipe.type) }}</span>
              </span>
              <span v-else class="text-dimmed">—</span>
            </td>

            <td class="pl-2 pr-5 py-2 text-right whitespace-nowrap">
              <span
                v-if="difficultyBars(recipe)"
                class="inline-flex items-end gap-0.5 h-3"
                :title="recipeDifficultyLabel(recipe.difficulty)"
              >
                <span
                  v-for="(barClass, i) in difficultyBars(recipe)"
                  :key="i"
                  class="w-1 rounded-full"
                  :class="[barClass, ['h-1.5', 'h-2.5', 'h-3'][i]]"
                />
                <span class="sr-only">{{ recipeDifficultyLabel(recipe.difficulty) }}</span>
              </span>
              <span v-else class="text-dimmed">—</span>
            </td>

            <td
              v-for="timeKey in TIME_COLUMNS"
              :key="timeKey"
              class="pl-2 pr-5 py-2 text-right tabular-nums whitespace-nowrap"
              :class="valueClass(timeKey)"
            >
              <template v-if="recipe[timeKey] != null">
                {{ recipe[timeKey] }}<span class="ml-0.5 text-xs font-normal text-dimmed">min</span>
              </template>
              <span v-else class="text-dimmed font-normal">—</span>
            </td>

            <td class="hidden xl:table-cell pl-2 pr-5 py-2 text-right tabular-nums" :class="valueClass('ingredients')">
              <template v-if="recipe.ingredients?.length">{{ recipe.ingredients.length }}</template>
              <span v-else class="text-dimmed font-normal">—</span>
            </td>

            <td class="pl-1 pr-2 py-2" @click.stop>
              <ListActionsButton :label="`Actions pour ${recipe.title}`" @click="openActions(recipe, $event)" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>

  <!-- Mobile et tablette : liste compacte sur deux lignes, sans défilement horizontal. -->
  <ul v-else class="rounded-xl border border-default bg-default divide-y divide-default overflow-hidden">
    <template v-if="loading">
      <li v-for="i in skeletonRows" :key="`skeleton-${i}`" class="flex flex-col gap-2 px-3 py-3">
        <div class="flex items-center justify-between gap-3">
          <USkeleton class="h-4 w-1/2" />
          <USkeleton class="h-4 w-14" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <USkeleton class="h-3 w-32" />
          <USkeleton class="h-3 w-28" />
        </div>
      </li>
    </template>

    <template v-else>
      <li v-for="recipe in recipes" :key="recipe.id" class="flex items-stretch">
        <button
          type="button"
          class="flex-1 min-w-0 flex flex-col gap-1 py-2.5 pl-3 pr-1 text-left transition-colors hover:bg-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          :aria-label="[
            `Voir le détail de ${recipe.title}`,
            macrosOf(recipe) ? `${round(macrosOf(recipe)!.calories)} kcal par part` : null,
          ].filter(Boolean).join(', ')"
          @click="emit('select', recipe)"
        >
          <span class="flex items-center gap-2 min-w-0">
            <span class="truncate font-medium text-highlighted">{{ recipe.title }}</span>
            <span v-if="macrosOf(recipe)" class="ml-auto flex items-center gap-2 shrink-0 text-sm">
              <span class="flex items-baseline gap-1">
                <span class="tabular-nums font-semibold text-highlighted">{{ round(macrosOf(recipe)!.calories) }}</span>
                <span class="text-xs text-dimmed">kcal</span>
              </span>
              <MacroPie
                :carbohydrates="macrosOf(recipe)!.carbohydrates"
                :protein="macrosOf(recipe)!.protein"
                :fat="macrosOf(recipe)!.fat"
                size-class="size-4"
              />
            </span>
          </span>

          <span class="flex items-center gap-3 min-w-0 text-xs">
            <span class="flex items-center gap-1.5 min-w-0 text-muted">
              <span v-if="recipe.type" class="truncate">{{ recipeTypeLabel(recipe.type) }}</span>
              <template v-if="recipeTotalTime(recipe) != null">
                <span v-if="recipe.type" aria-hidden="true" class="text-dimmed">·</span>
                <span class="shrink-0 tabular-nums" :class="isSorted('time') && 'text-highlighted font-semibold'">{{ recipeTotalTime(recipe) }} min</span>
              </template>
            </span>

            <span class="ml-auto flex items-center gap-2 shrink-0">
              <template v-if="macrosOf(recipe)">
                <span
                  v-for="column in MACRO_COLUMNS"
                  :key="column.key"
                  class="flex items-center gap-1 tabular-nums"
                  :class="isSorted(column.key) ? 'text-highlighted font-semibold' : 'text-muted'"
                >
                  <span class="size-1.5 rounded-full shrink-0" :class="column.dot" />
                  <span class="sr-only">{{ recipeSortOption(column.key).label }}</span>
                  <span aria-hidden="true">{{ column.short }}</span>
                  {{ round(macrosOf(recipe)![column.key]) }}
                </span>
              </template>
              <span v-else class="text-dimmed">Valeurs non renseignées</span>
            </span>
          </span>
        </button>

        <div class="flex items-center pl-1 pr-2">
          <ListActionsButton :label="`Actions pour ${recipe.title}`" @click="openActions(recipe, $event)" />
        </div>
      </li>
    </template>
  </ul>

  <SharedActionsMenu ref="actionsMenu" :items="actionItems" />
</template>
