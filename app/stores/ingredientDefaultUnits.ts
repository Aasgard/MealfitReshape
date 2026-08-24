import type { IngredientDefaultUnit } from '~/types/ingredientDefaultUnit'

export const useIngredientDefaultUnitsStore = defineStore('ingredientDefaultUnits', {
  state: () => ({
    units: [] as IngredientDefaultUnit[],
  }),

  actions: {
    setUnits(units: IngredientDefaultUnit[]) {
      this.units = units
    },

    reset() {
      this.units = []
    }
  }
})
