import { differenceInCalendarDays, format } from 'date-fns'
import type { Meal, RecipeMealSource } from '~/types/meal'
import type { DishStorage } from '~/types/preparedDish'
import { findBatchSurplus, formatParts, SURPLUS_MEAL_PREFIX } from '~/utils/preparedDishes'
import { macrosForRecipe } from '~/utils/recipeNutrition'
import { COOKING_DAYS, recipesToCook } from '~/utils/recipesToCook'

/**
 * « Mettre au stock » un repas d'une recette, depuis l'accueil ou les menus : le repas quitte le menu et ses parts
 * rejoignent le surplus de sa fournée (voir `sendMealToStock`), ingrédients de la liste de courses compris.
 * `history` : repas chargés autour du repas, assez pour retrouver le jour de cuisine de sa fournée.
 */
export const useSendToStock = (history: () => Meal[]) => {
  const toast = useToast()
  const { recipesById, ingredientsById } = useFoodCatalog()
  const { dishes, sendMealToStock } = usePreparedDishes()
  const shoppingList = useShoppingList()

  const meal = ref<(Meal & RecipeMealSource) | null>(null)
  const isOpen = ref(false)
  const isSaving = ref(false)

  /** Jour où se cuisine la fournée d'un repas : le premier jour de celle qui le couvre, sinon le jour du repas. */
  const cookDayOf = (target: Meal & RecipeMealSource) => {
    const day = target.date.toDate()
    const batch = recipesToCook(history(), COOKING_DAYS)
      .filter(item => item.recipeId === target.recipeId && item.days.some(d => differenceInCalendarDays(d, day) === 0))
      .at(-1)
    return format(batch?.days[0] ?? day, 'yyyy-MM-dd')
  }

  const cookDay = computed(() => meal.value ? cookDayOf(meal.value) : format(new Date(), 'yyyy-MM-dd'))
  const isCooked = computed(() => cookDay.value <= format(new Date(), 'yyyy-MM-dd'))
  const label = computed(() => meal.value ? recipesById.value.get(meal.value.recipeId)?.title ?? '' : '')
  /** Surplus déjà prévu pour la fournée : les parts le rejoignent. */
  const surplus = computed(() => meal.value ? findBatchSurplus(dishes.value, meal.value.recipeId, cookDay.value) ?? null : null)

  /** Seul un repas d'une recette se met au stock. */
  const open = (target: Meal | undefined) => {
    if (target?.category !== 'RECIPE') return
    meal.value = target
    isOpen.value = true
  }

  const confirm = async (storage: DishStorage) => {
    const target = meal.value
    const recipe = target ? recipesById.value.get(target.recipeId) : undefined
    if (!target || !recipe) return
    const day = cookDay.value
    const persons = recipe.persons && recipe.persons > 0 ? recipe.persons : 1

    isSaving.value = true
    try {
      const dishId = await sendMealToStock(target, {
        label: recipe.title,
        perPart: surplus.value?.perPart ?? macrosForRecipe(recipe.ingredients, ingredientsById.value, persons),
        cookDay: day,
        storage,
      })
      isOpen.value = false
      // Ses ingrédients restent dans la liste de courses : ils passent au surplus de la fournée.
      await shoppingList.moveInclusion(target.id, `${SURPLUS_MEAL_PREFIX}${dishId}`, day, {
        recipesById: recipesById.value,
        ingredientsById: ingredientsById.value,
      }).catch((error: any) => {
        toast.add({ title: 'Liste de courses non mise à jour', description: error.message || 'Une erreur est survenue.', color: 'warning' })
      })
      toast.add({
        title: 'Mis au stock',
        description: `${formatParts(target.value)} de « ${recipe.title} »`,
        color: 'success',
        icon: 'i-lucide-archive',
        actions: [{ label: 'Voir le stock', color: 'neutral', variant: 'outline', onClick: () => { navigateTo('/dashboard/stock') } }],
      })
    } catch (error: any) {
      toast.add({ title: 'Erreur', description: `« ${recipe.title} » n'a pas pu être mis au stock : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
    } finally {
      isSaving.value = false
    }
  }

  return { meal, isOpen, isSaving, cookDay, isCooked, label, surplus, open, confirm }
}
