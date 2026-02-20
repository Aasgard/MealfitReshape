import { collection, orderBy, query } from 'firebase/firestore'
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
      const categoriesStore = useIngredientCategoriesStore()
      const categories = useCollection<IngredientCategory>(
        () => query(
          collection(useFirestore(), 'ingredientCategories'),
          orderBy('order', 'asc')
        ), 
        { once: true }
      )
      await categories.promise.value
      categoriesStore.setCategories(categories.value)
    }
  }
})
