import { collection, doc, orderBy, query, setDoc } from 'firebase/firestore'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { useIngredientDefaultUnitsStore } from '~/stores/ingredientDefaultUnits'
import type { IngredientCategory } from '~/types/ingredientCategory'
import type { IngredientDefaultUnit } from '~/types/ingredientDefaultUnit'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/dashboard')) {
    const user = await getCurrentUser()

    if (!user) {
      return navigateTo({
        path: '/login',
        query: {
          redirect: to.fullPath
        }
      })
    }

    const hasVisitedDashboard = useState('hasVisitedDashboard', () => false)
    if (!hasVisitedDashboard.value) {
      const db = useFirestore()

      // Pas d'await : hors ligne, la promesse n'aboutit qu'à la synchronisation et bloquerait la navigation.
      setDoc(doc(db, 'users', user.uid), {
        account: {
          fullName: user.displayName,
          avatar: user.photoURL
        }
      }, { merge: true }).catch(error => console.error('Mise à jour du profil impossible', error))

      // Un échec de chargement ne doit pas bloquer le dashboard : on réessaie à la navigation suivante.
      try {
        const categories = useCollection<IngredientCategory>(
          () => query(
            collection(db, 'ingredientCategories'),
            orderBy('order', 'asc')
          ),
          { once: true }
        )
        const defaultUnits = useCollection<IngredientDefaultUnit>(
          () => query(
            collection(db, 'ingredientDefaultUnits'),
            orderBy('label', 'asc')
          ),
          { once: true }
        )
        await Promise.all([categories.promise.value, defaultUnits.promise.value])

        useIngredientCategoriesStore().setCategories(categories.value)
        useIngredientDefaultUnitsStore().setUnits(defaultUnits.value)
        hasVisitedDashboard.value = true
      } catch (error) {
        console.error('Chargement des catégories et unités impossible', error)
      }
    }
  }
})
