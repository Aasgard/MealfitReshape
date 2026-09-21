import { collection, or, query, where } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Ingredient } from '~/types/ingredient'
import type { Recipe } from '~/types/recipe'

/** Recettes et ingrédients accessibles à l'utilisateur (les siens + le catalogue public), pour calculer les kcal et macros des repas. */
export const useFoodCatalog = () => {
  const db = useFirestore()
  const user = useCurrentUser()

  const ownedOrPublic = (collectionName: 'recipes' | 'ingredients') => {
    const uid = user.value?.uid
    if (!uid) return null

    return query(
      collection(db, collectionName),
      or(
        where('owner', '==', uid),
        where('owner', '==', null)
      )
    )
  }

  const recipes = useCollection<Recipe>(() => ownedOrPublic('recipes'))
  const ingredients = useCollection<Ingredient>(() => ownedOrPublic('ingredients'))

  const recipesById = computed(() => new Map(recipes.value.map(r => [r.id, r])))
  const ingredientsById = computed(() => new Map(ingredients.value.map(i => [i.id, i])))

  return { recipes, ingredients, recipesById, ingredientsById }
}
