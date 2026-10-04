<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { Ingredient } from '~/types/ingredient'
import { nextSort, type SortOption, type SortState } from '~/utils/listSort'
import { ingredientSortOption, type IngredientSortKey } from '~/utils/ingredientSort'
import { categoryIconName } from '~/utils/categoryIcon'
import { ingredientPieceUnit } from '~/utils/ingredientNutrition'

/**
 * Vue liste du catalogue : un tableau triable par colonne à partir de `lg`, une liste compacte sur deux lignes en dessous.
 * Le tri est un état de la page (partagé avec la vue cartes) : ce composant ne fait que l'afficher et le modifier.
 *
 * Coût de rendu : une seule des deux variantes est montée (pas de masquage CSS), les lignes n'utilisent que des
 * éléments natifs, et un menu d'actions unique (SharedActionsMenu) sert toutes les lignes.
 */
const props = defineProps<{
  ingredients: Ingredient[]
  isOwned: (ingredient: Ingredient) => boolean
  loading?: boolean
}>()

const sort = defineModel<SortState<IngredientSortKey>>('sort', { required: true })

const emit = defineEmits<{
  select: [ingredient: Ingredient]
  edit: [ingredient: Ingredient]
  delete: [ingredient: Ingredient]
}>()

const isDesktop = useMediaQuery('(min-width: 1024px)')

const onSort = (option: SortOption<IngredientSortKey>) => {
  sort.value = nextSort(sort.value, option)
}

const MACRO_COLUMNS = [
  { key: 'carbohydrates', short: 'G', dot: 'bg-green-500' },
  { key: 'protein', short: 'P', dot: 'bg-red-700' },
  { key: 'fat', short: 'L', dot: 'bg-amber-500' },
] as const

const isSorted = (key: IngredientSortKey) => sort.value.key === key
/** La colonne triée ressort : c'est elle que l'œil compare de ligne en ligne. */
const valueClass = (key: IngredientSortKey) => isSorted(key) ? 'text-highlighted font-semibold' : 'text-default'

const round = (n: number) => Math.round(n)

const actionsMenu = ref<{ toggle: (event: MouseEvent) => void } | null>(null)
const actionsTarget = shallowRef<Ingredient | null>(null)
const actionItems = computed(() => {
  const ingredient = actionsTarget.value
  if (!ingredient) return []
  return [
    [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => emit('edit', ingredient) }],
    [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', ingredient) }],
  ]
})
const openActions = (ingredient: Ingredient, event: MouseEvent) => {
  actionsTarget.value = ingredient
  actionsMenu.value?.toggle(event)
}

const skeletonRows = computed(() => Array.from({ length: props.loading ? 12 : 0 }, (_, i) => i))
</script>

<template>
  <!-- Desktop : le cadre du tableau ne bouge pas (bordure, coins, en-tête) ; seules les lignes défilent à l'intérieur. -->
  <div v-if="isDesktop" class="flex-1 min-h-0 rounded-xl border border-default bg-default overflow-y-auto overflow-x-hidden overscroll-contain">
    <table class="w-full border-separate border-spacing-0 text-sm">
      <caption class="sr-only">
        Ingrédients, valeurs nutritionnelles pour 100 g
      </caption>
      <thead>
        <tr class="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-default [&>th]:border-b [&>th]:border-default">
          <!-- Ordre : nom, kcal, ratio, G, P, L, pièce, saison. -->
          <SortableHeader :option="ingredientSortOption('label')" :sort="sort" class="pl-1" @sort="onSort" />
          <SortableHeader :option="ingredientSortOption('calories')" :sort="sort" dense align="right" @sort="onSort">
            <span title="Calories pour 100 g">kcal</span>
          </SortableHeader>
          <!-- Trié par part de protéines (protéines / G + P + L), comme dans le tableau des recettes. -->
          <SortableHeader :option="ingredientSortOption('ratio')" :sort="sort" dense align="right" @sort="onSort">
            <span title="Trier par part de protéines">Ratio</span>
          </SortableHeader>
          <SortableHeader
            v-for="column in MACRO_COLUMNS"
            :key="column.key"
            :option="ingredientSortOption(column.key)"
            :sort="sort"
            dense
            align="right"
            @sort="onSort"
          >
            <span class="size-2 rounded-full shrink-0" :class="column.dot" />
            <span aria-hidden="true" :title="ingredientSortOption(column.key).label">{{ column.short }}</span>
            <span class="sr-only">{{ ingredientSortOption(column.key).label }}</span>
          </SortableHeader>
          <SortableHeader :option="ingredientSortOption('piece')" :sort="sort" dense align="right" @sort="onSort">
            <span title="Poids d’une pièce">Pièce</span>
          </SortableHeader>
          <th scope="col" class="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            Saison
          </th>
          <th scope="col" class="w-px">
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>

      <tbody class="[&>tr:not(:first-child)>td]:border-t [&>tr>td]:border-default">
        <template v-if="loading">
          <tr v-for="i in skeletonRows" :key="`skeleton-${i}`">
            <td class="px-4 py-3"><USkeleton class="h-4 w-40" /></td>
            <td class="pl-2 pr-5 py-3"><USkeleton class="h-4 w-10 ml-auto" /></td>
            <td class="pl-2 pr-5 py-3"><USkeleton class="size-5 rounded-full ml-auto" /></td>
            <td v-for="c in 4" :key="c" class="pl-2 pr-5 py-3"><USkeleton class="h-4 w-10 ml-auto" /></td>
            <td class="px-3 py-3"><USkeleton class="h-4 w-16" /></td>
            <td class="px-3 py-3" />
          </tr>
        </template>

        <template v-else>
          <tr
            v-for="ingredient in ingredients"
            :key="ingredient.id"
            class="cursor-pointer transition-colors hover:[&>td]:bg-elevated/60"
            @click="emit('select', ingredient)"
          >
            <td class="w-full max-w-0 pl-4 pr-3 py-2">
              <div class="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  class="min-w-0 truncate text-left font-medium text-highlighted rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-default"
                  :title="ingredient.label"
                  :aria-label="`Voir le détail de ${ingredient.label}`"
                  @click.stop="emit('select', ingredient)"
                >
                  {{ ingredient.label }}
                </button>
                <ListPrivateBadge v-if="isOwned(ingredient)" />
              </div>
            </td>

            <template v-if="ingredient.valuesBy100">
              <td class="pl-2 pr-5 py-2 text-right tabular-nums whitespace-nowrap" :class="valueClass('calories')">
                {{ round(ingredient.valuesBy100.calories) }}
              </td>
              <td class="pl-2 pr-5 py-2">
                <MacroPie
                  :carbohydrates="ingredient.valuesBy100.carbohydrates"
                  :protein="ingredient.valuesBy100.protein"
                  :fat="ingredient.valuesBy100.fat"
                  size-class="size-5 block ml-auto"
                />
              </td>
              <td
                v-for="column in MACRO_COLUMNS"
                :key="column.key"
                class="pl-2 pr-5 py-2 text-right tabular-nums whitespace-nowrap"
                :class="valueClass(column.key)"
              >
                {{ round(ingredient.valuesBy100[column.key]) }}<span class="ml-0.5 text-xs font-normal text-dimmed">g</span>
              </td>
            </template>
            <td v-else colspan="5" class="pl-2 pr-5 py-2 text-right text-xs text-dimmed whitespace-nowrap">
              Valeurs non renseignées
            </td>

            <td class="pl-2 pr-5 py-2 text-right tabular-nums whitespace-nowrap" :class="valueClass('piece')">
              <template v-if="ingredientPieceUnit(ingredient)">
                {{ round(ingredientPieceUnit(ingredient)!.value) }}<span class="ml-0.5 text-xs font-normal text-dimmed">{{ ingredientPieceUnit(ingredient)!.unit }}</span>
              </template>
              <span v-else class="text-dimmed font-normal">—</span>
            </td>

            <td class="px-3 py-2">
              <IngredientSeasonMark :ingredient="ingredient" />
            </td>

            <td class="pl-1 pr-2 py-2" @click.stop>
              <ListActionsButton :label="`Actions pour ${ingredient.label}`" @click="openActions(ingredient, $event)" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <!-- Fin de la liste (repère de chargement de la suite), dans le cadre qui défile. -->
    <slot name="footer" />
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
          <USkeleton class="h-3 w-24" />
          <USkeleton class="h-3 w-28" />
        </div>
      </li>
    </template>

    <template v-else>
      <li v-for="ingredient in ingredients" :key="ingredient.id" class="flex items-stretch">
        <button
          type="button"
          class="flex-1 min-w-0 flex flex-col gap-1 py-2.5 pl-3 pr-1 text-left transition-colors hover:bg-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          :aria-label="[
            `Voir le détail de ${ingredient.label}`,
            ingredient.valuesBy100 ? `${round(ingredient.valuesBy100.calories)} kcal pour 100 g` : null,
          ].filter(Boolean).join(', ')"
          @click="emit('select', ingredient)"
        >
          <span class="flex items-center gap-2 min-w-0">
            <span class="truncate font-medium text-highlighted">{{ ingredient.label }}</span>
            <ListPrivateBadge v-if="isOwned(ingredient)" />
            <span v-if="ingredient.valuesBy100" class="ml-auto flex items-center gap-2 shrink-0 text-sm">
              <span class="flex items-baseline gap-1">
                <span class="tabular-nums text-highlighted" :class="isSorted('calories') ? 'font-bold' : 'font-semibold'">{{ round(ingredient.valuesBy100.calories) }}</span>
                <span class="text-xs text-dimmed">kcal</span>
              </span>
              <MacroPie
                :carbohydrates="ingredient.valuesBy100.carbohydrates"
                :protein="ingredient.valuesBy100.protein"
                :fat="ingredient.valuesBy100.fat"
                size-class="size-4"
              />
            </span>
          </span>

          <span class="flex items-center gap-3 min-w-0 text-xs">
            <span v-if="ingredient.category?.label" class="flex items-center gap-1 min-w-0 text-muted">
              <UIcon v-if="categoryIconName(ingredient.category.icon)" :name="categoryIconName(ingredient.category.icon)!" class="size-3 shrink-0" />
              <span class="truncate">{{ ingredient.category.label }}</span>
            </span>

            <span class="ml-auto flex items-center gap-2 shrink-0">
              <IngredientSeasonMark :ingredient="ingredient" compact />
              <template v-if="ingredient.valuesBy100">
                <span
                  v-for="column in MACRO_COLUMNS"
                  :key="column.key"
                  class="flex items-center gap-1 tabular-nums"
                  :class="isSorted(column.key) ? 'text-highlighted font-semibold' : 'text-muted'"
                >
                  <span class="size-1.5 rounded-full shrink-0" :class="column.dot" />
                  <span class="sr-only">{{ ingredientSortOption(column.key).label }}</span>
                  <span aria-hidden="true">{{ column.short }}</span>
                  {{ round(ingredient.valuesBy100[column.key]) }}
                </span>
              </template>
              <span v-else class="text-dimmed">Valeurs non renseignées</span>
            </span>
          </span>
        </button>

        <div class="flex items-center pl-1 pr-2">
          <ListActionsButton :label="`Actions pour ${ingredient.label}`" @click="openActions(ingredient, $event)" />
        </div>
      </li>
    </template>
  </ul>
  <!-- Fin de la liste (repère de chargement de la suite) ; ici, la page défile. -->
  <slot v-if="!isDesktop" name="footer" />

  <SharedActionsMenu ref="actionsMenu" :items="actionItems" />
</template>
