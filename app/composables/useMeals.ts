import { addWeeks, subWeeks } from 'date-fns'
import { collection, doc, query, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import type { Ref } from 'vue'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Meal, MealSource, MealType } from '~/types/meal'

/** Repas à créer : le jour (minuit, heure locale), la ligne du calendrier et ce qui a été mangé. */
export type NewMeal = {
  date: Date
  mealType: MealType
  source: MealSource
}

/**
 * Repas de l'utilisateur connecté (collection Firestore `meals`) pour la semaine commençant à `weekStart`
 * et la précédente (pour "Copier la semaine précédente"), et écritures associées.
 * La requête (`user` + plage de `date`) demande un index composite `user` ↑, `date` ↑.
 */
export const useMeals = (weekStart: Ref<Date>) => {
  const db = useFirestore()
  const user = useCurrentUser()

  const meals = useCollection<Meal>(() => {
    const uid = user.value?.uid
    if (!uid) return null

    return query(
      collection(db, 'meals'),
      where('user', '==', uid),
      where('date', '>=', Timestamp.fromDate(subWeeks(weekStart.value, 1))),
      where('date', '<', Timestamp.fromDate(addWeeks(weekStart.value, 1)))
    )
  })

  /** Supprime `toDelete` et crée `toCreate` en une seule écriture atomique. */
  const replaceMeals = async (toDelete: Meal[], toCreate: NewMeal[]) => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')

    const batch = writeBatch(db)
    for (const meal of toDelete) batch.delete(doc(db, 'meals', meal.id))

    const now = Date.now()
    toCreate.forEach(({ date, mealType, source }, index) => {
      batch.set(doc(collection(db, 'meals')), {
        ...source,
        user: uid,
        date: Timestamp.fromDate(date),
        mealType,
        // Un décalage d'1 ms par repas conserve leur ordre d'ajout à l'intérieur d'une case.
        createdAt: Timestamp.fromMillis(now + index),
      })
    })
    await batch.commit()
  }

  const addMeal = (meal: NewMeal) => replaceMeals([], [meal])

  /** Déplace un repas vers un autre jour et/ou une autre ligne du calendrier ; ce qu'il contient (recette, quantité...) ne change pas. */
  const moveMeal = (mealId: string, target: Pick<NewMeal, 'date' | 'mealType'>) =>
    updateDoc(doc(db, 'meals', mealId), { date: Timestamp.fromDate(target.date), mealType: target.mealType })

  /**
   * Remplace ce qu'un repas contient (recette, aliment ou macros), sans changer son jour, sa ligne ni son ordre dans la case.
   * Le document est réécrit en entier : passer d'une recette à un aliment ne doit pas laisser traîner `recipeId` / `value`.
   */
  const updateMealSource = (meal: Meal, source: MealSource) =>
    setDoc(doc(db, 'meals', meal.id), {
      ...source,
      user: meal.user,
      date: meal.date,
      mealType: meal.mealType,
      ...(meal.createdAt ? { createdAt: meal.createdAt } : {}),
    })

  return { meals, addMeal, moveMeal, updateMealSource, replaceMeals }
}
