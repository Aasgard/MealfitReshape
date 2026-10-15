import { addDays, format, parseISO } from 'date-fns'
import type { GroceryListState } from '~/composables/useGroceryList'
import { surplusMeals } from '~/utils/preparedDishes'
import { isPlannedMeal } from '~/utils/plannedMealRows'
import { stockNeeds } from '~/utils/stockCheck'

/** Une fournée se cuisine pour ses repas des 7 jours : on remonte d'autant pour ne pas recompter une fournée déjà cuisinée. */
const LOOKBACK_DAYS = 7

/**
 * Données de « Vérifier un article » : besoins par ingrédient d'aujourd'hui à la fin de la période de la liste. Les
 * repas ne se chargent que panneau ouvert.
 */
export function useStockCheck(list: GroceryListState) {
  const { recipes, ingredients, recipesById, ingredientsById } = useFoodCatalog()
  const { dishes } = usePreparedDishes()

  /** D'aujourd'hui à la fin de la période ; `null` sans période complète, ou si elle est déjà passée. */
  const days = computed(() => {
    const end = list.rangeDays?.end
    const start = format(list.today, 'yyyy-MM-dd')
    return end && end >= start ? { start, end } : null
  })

  const loadRange = computed(() => (list.isStockCheckOpen && days.value
    ? { start: addDays(list.today, -LOOKBACK_DAYS), end: parseISO(days.value.end) }
    : null))
  const meals = useMealsBetween(loadRange)

  const isLoading = computed(() => meals.pending.value || recipes.pending.value || ingredients.pending.value)

  const needs = computed(() => {
    const span = days.value
    if (!span || !loadRange.value) return { ingredients: [], skipped: [] }
    const allMeals = [
      ...meals.value.filter(isPlannedMeal),
      ...surplusMeals(dishes.value, { start: format(loadRange.value.start, 'yyyy-MM-dd'), end: span.end }),
    ]
    return stockNeeds(allMeals, list.inclusionByMealId, { recipesById: recipesById.value, ingredientsById: ingredientsById.value }, span)
  })

  return reactive({ days, isLoading, needs, ingredientsById })
}
