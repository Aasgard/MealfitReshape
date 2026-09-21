import { addWeeks, subWeeks } from 'date-fns'
import { collection, doc, query, Timestamp, where, writeBatch } from 'firebase/firestore'
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

  return { meals, addMeal, replaceMeals }
}
