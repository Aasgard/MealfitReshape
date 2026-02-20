import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import type { IngredientCategory } from '~/types/ingredientCategory'

export const useIngredientCategoriesStore = defineStore('ingredientCategories', {
  state: () => ({
    categories: [] as IngredientCategory[],
    loaded: false,
    loading: false,
    error: null as string | null
  }),

  getters: {
    categoriesOrdered: (state) => [...state.categories].sort((a, b) => a.order - b.order),
    getCategoryById: (state) => (id: string) => state.categories.find((c) => c.id === id)
  },

  actions: {
    setCategories(categories: any) {
      this.categories = categories
    },

    async fetchCategories() {
      const user = useCurrentUser()
      if (!user.value) {
        this.error = 'Utilisateur non connecté'
        return
      }

      this.loading = true
      this.error = null

      try {
        const db = useFirestore()
        const q = query(
          collection(db, 'ingredientCategories'),
          orderBy('order', 'asc')
        )
        const snapshot = await getDocs(q)

        this.categories = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            id: doc.id,
            label: data.label ?? '',
            order: data.order ?? 0,
            icon: data.icon ?? 'circle'
          } satisfies IngredientCategory
        })
        this.loaded = true
      } catch (e: any) {
        this.error = e?.message ?? 'Erreur lors du chargement des catégories'
        this.categories = []
      } finally {
        this.loading = false
      }
    },

    reset() {
      this.categories = []
      this.loaded = false
      this.loading = false
      this.error = null
    }
  }
})
