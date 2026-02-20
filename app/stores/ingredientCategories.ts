import { collection, orderBy, query } from 'firebase/firestore'
import type { IngredientCategory } from '~/types/ingredientCategory'

export const useIngredientCategoriesStore = defineStore('ingredientCategories', {
  state: () => ({
    categories: [] as IngredientCategory[],
    loaded: false,
    loading: false,
    error: null as string | null
  }),

  getters: {
    getCategoryById: (state) => (id: string) => state.categories.find((c) => c.id === id)
  },

  actions: {
    setCategories(categories: IngredientCategory[]) {
      this.categories = categories
    },

    reset() {
      this.categories = []
      this.loaded = false
      this.loading = false
      this.error = null
    }
  }
})
