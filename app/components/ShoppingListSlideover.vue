<script setup lang="ts">
import { format, isAfter, isValid, parse } from 'date-fns'
import type { Ingredient } from '~/types/ingredient'
import type { Meal } from '~/types/meal'
import type { Recipe } from '~/types/recipe'
import type { DayRange } from '~/composables/useMeals'
import { categoryIconName } from '~/utils/categoryIcon'
import { entryFromMeal } from '~/utils/menuEntries'
import { buildShoppingList, formatShoppingListText, formatShoppingQuantity, type ShoppingListItem } from '~/utils/shoppingList'

/**
 * Liste de courses des repas planifiés sur une plage de jours, regroupés par recette / aliment. Les repas cochés
 * fournissent les ingrédients :
 * ceux des recettes (en recettes entières) et les aliments seuls, convertis en grammes et cumulés par ingrédient.
 * Les ingrédients cochés se copient en texte, un par ligne, prêts à coller dans Todoist (ou toute autre liste).
 */
const props = defineProps<{
  recipesById: Map<string, Recipe>
  ingredientsById: Map<string, Ingredient>
  /** Plage proposée à l'ouverture (ex. la semaine affichée). */
  initialRange: DayRange
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const toast = useToast()

const DATE_INPUT_FORMAT = 'yyyy-MM-dd'
const startInput = ref('')
const endInput = ref('')

/** Recettes / aliments décochés (mangés dehors, déjà cuisinés...), par clé de regroupement : leurs ingrédients sortent de la liste. */
const excludedMealKeys = ref(new Set<string>())
/** Ingrédients décochés (déjà dans les placards...) : exclus de la copie. */
const excludedIds = ref(new Set<string>())

watch(open, (isOpen) => {
  if (!isOpen) return
  startInput.value = format(props.initialRange.start, DATE_INPUT_FORMAT)
  endInput.value = format(props.initialRange.end, DATE_INPUT_FORMAT)
  excludedMealKeys.value = new Set()
  excludedIds.value = new Set()
}, { immediate: true })

const parseDateInput = (value: string) => {
  const date = parse(value, DATE_INPUT_FORMAT, new Date())
  return isValid(date) ? date : null
}

/** `null` si une date manque ou si la fin précède le début. */
const range = computed<DayRange | null>(() => {
  const start = parseDateInput(startInput.value)
  const end = parseDateInput(endInput.value)
  if (!start || !end || isAfter(start, end)) return null
  return { start, end }
})

const rangeError = computed(() => {
  const start = parseDateInput(startInput.value)
  const end = parseDateInput(endInput.value)
  return start && end && isAfter(start, end) ? 'La date de fin doit suivre la date de début' : undefined
})

/** Pas de requête tant que le panneau est fermé. */
const meals = useMealsBetween(() => (open.value ? range.value : null))
watch(meals.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger les repas : ${error.message}`, color: 'error' })
})

const isLoading = computed(() => meals.pending.value)

const rangeMeals = computed(() => (range.value ? meals.value : []))

/** Les macros saisies à la main n'ont pas d'ingrédients : affichées, mais pas sélectionnables. */
const hasIngredients = (meal: Meal) => meal.category !== 'RAW'

/** Clé de regroupement : une ligne par recette, par aliment dans une même unité, par libellé de macros saisies. */
const mealKey = (meal: Meal) => {
  switch (meal.category) {
    case 'RECIPE': return `recipe:${meal.recipeId}`
    case 'INGREDIENT': return `ingredient:${meal.ingredientId}:${meal.unitId ?? 'g'}`
    case 'RAW': return `raw:${meal.label}`
  }
}

type MealRow = { key: string, label: string, quantityLabel?: string, isSelectable: boolean, rank: number }
const CATEGORY_RANK = { RECIPE: 0, INGREDIENT: 1, RAW: 2 } as const

/** Repas regroupés (parts ou quantités cumulées), recettes puis aliments puis macros, par ordre alphabétique. */
const mealRows = computed(() => {
  const totals = new Map<string, Meal>()
  for (const meal of rangeMeals.value) {
    const key = mealKey(meal)
    const total = totals.get(key)
    if (!total) totals.set(key, { ...meal })
    else if (total.category === 'RECIPE' && meal.category === 'RECIPE') total.value += meal.value
    else if (total.category === 'INGREDIENT' && meal.category === 'INGREDIENT') total.quantity += meal.quantity
  }

  const rows: MealRow[] = [...totals].map(([key, total]) => {
    const entry = entryFromMeal(total, props.recipesById, props.ingredientsById)
    return {
      key,
      label: total.category === 'RAW' ? total.label : entry.label,
      quantityLabel: total.category === 'RAW' ? 'Macros seules' : entry.quantityLabel,
      isSelectable: hasIngredients(total),
      rank: CATEGORY_RANK[total.category],
    }
  })
  return rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'fr'))
})

const selectableRows = computed(() => mealRows.value.filter(row => row.isSelectable))
const selectedMeals = computed(() =>
  rangeMeals.value.filter(meal => hasIngredients(meal) && !excludedMealKeys.value.has(mealKey(meal)))
)

const toggleMealRow = (key: string, isChecked: boolean | 'indeterminate') => {
  const next = new Set(excludedMealKeys.value)
  if (isChecked === true) next.delete(key)
  else next.add(key)
  excludedMealKeys.value = next
}

const areAllMealsSelected = computed(() => selectableRows.value.every(row => !excludedMealKeys.value.has(row.key)))
const toggleAllMeals = () => {
  excludedMealKeys.value = areAllMealsSelected.value ? new Set(selectableRows.value.map(row => row.key)) : new Set()
}

const shoppingList = computed(() => buildShoppingList(selectedMeals.value, props.recipesById, props.ingredientsById))

/** Ingrédients regroupés par catégorie, dans l'ordre de la liste (déjà triée par catégorie). */
const groups = computed(() => {
  const result: { key: string, label: string, icon?: string, items: ShoppingListItem[] }[] = []
  for (const item of shoppingList.value.items) {
    const key = item.category?.label ?? '__none__'
    let group = result.at(-1)
    if (group?.key !== key) {
      group = { key, label: item.category?.label ?? 'Sans catégorie', icon: categoryIconName(item.category?.icon), items: [] }
      result.push(group)
    }
    group.items.push(item)
  }
  return result
})

const selectedItems = computed(() => shoppingList.value.items.filter(item => !excludedIds.value.has(item.ingredientId)))

const toggleItem = (ingredientId: string, isChecked: boolean | 'indeterminate') => {
  const next = new Set(excludedIds.value)
  if (isChecked === true) next.delete(ingredientId)
  else next.add(ingredientId)
  excludedIds.value = next
}

const mealCountLabel = computed(() => {
  const count = rangeMeals.value.length
  return `${count} repas planifié${count > 1 ? 's' : ''}`
})

const close = () => { open.value = false }

const copyList = async () => {
  try {
    await navigator.clipboard.writeText(formatShoppingListText(selectedItems.value))
    const count = selectedItems.value.length
    toast.add({
      title: 'Liste copiée',
      description: `${count} ingrédient${count > 1 ? 's' : ''} à coller dans votre liste de courses.`,
      color: 'success',
    })
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `La liste n'a pas pu être copiée : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Liste de courses"
    description="Ingrédients des repas planifiés, en grammes"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Du" :error="!!rangeError">
            <UInput v-model="startInput" type="date" :max="endInput || undefined" size="md" variant="outline" class="w-full" />
          </UFormField>
          <UFormField label="Au" :error="!!rangeError">
            <UInput v-model="endInput" type="date" :min="startInput || undefined" size="md" variant="outline" class="w-full" />
          </UFormField>
          <p v-if="rangeError" class="col-span-2 -mt-2 text-sm text-error">
            {{ rangeError }}
          </p>
        </div>

        <p v-if="isLoading" class="text-sm text-muted">
          Chargement des repas...
        </p>

        <template v-else-if="range">
          <section class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed">
                {{ mealCountLabel }}
              </h2>
              <UButton
                v-if="selectableRows.length"
                :label="areAllMealsSelected ? 'Tout décocher' : 'Tout cocher'"
                color="neutral"
                variant="link"
                size="xs"
                @click="toggleAllMeals"
              />
            </div>

            <p v-if="!mealRows.length" class="rounded-md border border-dashed border-default px-3 py-6 text-center text-sm text-muted">
              Aucun repas planifié sur cette période.
            </p>

            <ul v-else class="divide-y divide-default border-t border-default">
              <li v-for="row in mealRows" :key="row.key">
                <label
                  class="flex items-center gap-3 py-1.5"
                  :class="row.isSelectable ? 'cursor-pointer' : 'cursor-not-allowed'"
                >
                  <UCheckbox
                    :model-value="row.isSelectable && !excludedMealKeys.has(row.key)"
                    :disabled="!row.isSelectable"
                    @update:model-value="toggleMealRow(row.key, $event)"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-sm"
                    :class="row.isSelectable && !excludedMealKeys.has(row.key) ? 'text-highlighted' : 'text-dimmed'"
                  >
                    {{ row.label }}
                  </span>
                  <span class="shrink-0 text-xs tabular-nums text-dimmed">
                    {{ row.quantityLabel }}
                  </span>
                </label>
              </li>
            </ul>
          </section>

          <h2 v-if="mealRows.length" class="text-xs font-semibold uppercase tracking-wider text-dimmed">
            {{ shoppingList.items.length }} ingrédient{{ shoppingList.items.length > 1 ? 's' : '' }}
          </h2>

          <p v-if="mealRows.length && !shoppingList.items.length" class="rounded-md border border-dashed border-default px-3 py-6 text-center text-sm text-muted">
            Aucun ingrédient à acheter pour les repas cochés.
          </p>

          <section v-for="group in groups" :key="group.key" class="flex flex-col">
            <h3 class="flex items-center gap-1.5 border-b border-default pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
              <UIcon v-if="group.icon" :name="group.icon" class="size-3.5 shrink-0" />
              {{ group.label }}
            </h3>
            <ul class="divide-y divide-default">
              <li v-for="item in group.items" :key="item.ingredientId">
                <label class="flex cursor-pointer items-center gap-3 py-2">
                  <UCheckbox
                    :model-value="!excludedIds.has(item.ingredientId)"
                    @update:model-value="toggleItem(item.ingredientId, $event)"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-sm"
                    :class="excludedIds.has(item.ingredientId) ? 'text-dimmed line-through' : 'text-highlighted'"
                  >
                    {{ item.label }}
                  </span>
                  <span
                    class="shrink-0 text-sm tabular-nums"
                    :class="excludedIds.has(item.ingredientId) ? 'text-dimmed line-through' : 'text-muted'"
                  >
                    {{ formatShoppingQuantity(item) }}
                  </span>
                </label>
              </li>
            </ul>
          </section>

          <p v-if="shoppingList.skipped.length" class="flex gap-2 text-xs text-muted">
            <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0" />
            <span>Non inclus : {{ shoppingList.skipped.join(', ') }}.</span>
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <UButton label="Fermer" color="neutral" variant="ghost" @click="close" />
      <UButton
        :label="`Copier (${selectedItems.length})`"
        icon="i-lucide-clipboard-copy"
        color="primary"
        :disabled="!selectedItems.length"
        @click="copyList"
      />
    </template>
  </USlideover>
</template>
