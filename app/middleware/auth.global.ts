import { collection, doc, getDoc, orderBy, query, setDoc } from 'firebase/firestore'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import type { IngredientCategory } from '~/types/ingredientCategory'

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
      hasVisitedDashboard.value = true

      // TODO: debug temporaire, à retirer une fois la vérification terminée
      const db = useFirestore()
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)
      console.log('Utilisateur connecté (/users/' + user.uid + '):', userSnap.exists() ? userSnap.data() : null)

      await setDoc(userRef, {
        account: {
          fullName: user.displayName,
          avatar: user.photoURL
        }
      }, { merge: true })

      const categoriesStore = useIngredientCategoriesStore()
      const categories = useCollection<IngredientCategory>(
        () => query(
          collection(db, 'ingredientCategories'),
          orderBy('order', 'asc')
        ), 
        { once: true }
      )
      await categories.promise.value
      categoriesStore.setCategories(categories.value)
    }
  }
})
