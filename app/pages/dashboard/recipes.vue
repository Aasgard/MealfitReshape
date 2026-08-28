<script setup lang="ts">
import type { RecipeCategory, RecipeDifficulty, RecipePreview } from '~/types/recipe'

useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

const recipes = ref<RecipePreview[]>([
  { id: '1', title: 'Banana bread', ingredientsPreview: 'banane, farine, noix', category: 'Collation', prepTime: 60, calories: 290, difficulty: 'Moyen', isFavorite: false },
  { id: '2', title: 'Bowl de saumon teriyaki', ingredientsPreview: 'saumon, riz, avocat', category: 'Dîner', prepTime: 30, calories: 540, difficulty: 'Moyen', isFavorite: true },
  { id: '3', title: 'Buddha bowl végétarien', ingredientsPreview: 'quinoa, avocat, pois chiche', category: 'Déjeuner', prepTime: 25, calories: 450, difficulty: 'Moyen', isFavorite: false },
  { id: '4', title: 'Chili con carne', ingredientsPreview: 'bœuf, haricots, tomate', category: 'Dîner', prepTime: 50, calories: 560, difficulty: 'Moyen', isFavorite: false },
  { id: '5', title: 'Curry de légumes', ingredientsPreview: 'carotte, brocoli, riz', category: 'Dîner', prepTime: 40, calories: 390, difficulty: 'Moyen', isFavorite: false },
  { id: '6', title: 'Lasagnes bolognaise', ingredientsPreview: 'bœuf, pâtes, tomate', category: 'Dîner', prepTime: 80, calories: 640, difficulty: 'Difficile', isFavorite: false },
  { id: '7', title: 'Mousse au chocolat', ingredientsPreview: 'chocolat, œuf, sucre', category: 'Dessert', prepTime: 25, calories: 320, difficulty: 'Moyen', isFavorite: true },
  { id: '8', title: 'Œufs brouillés & avocat', ingredientsPreview: 'œuf, avocat, pain', category: 'Petit-déjeuner', prepTime: 12, calories: 340, difficulty: 'Facile', isFavorite: false },
  { id: '9', title: 'Pancakes protéinés', ingredientsPreview: 'avoine, œuf, banane', category: 'Petit-déjeuner', prepTime: 20, calories: 380, difficulty: 'Facile', isFavorite: false },
  { id: '10', title: 'Smoothie bowl', ingredientsPreview: 'fruits rouges, yaourt, granola', category: 'Petit-déjeuner', prepTime: 10, calories: 260, difficulty: 'Facile', isFavorite: false },
  { id: '11', title: 'Poke bowl thon', ingredientsPreview: 'thon, riz, edamame', category: 'Déjeuner', prepTime: 20, calories: 470, difficulty: 'Moyen', isFavorite: false },
  { id: '12', title: 'Tiramisu', ingredientsPreview: 'mascarpone, café, cacao', category: 'Dessert', prepTime: 35, calories: 410, difficulty: 'Difficile', isFavorite: true },
])

const searchQuery = ref('')

const categoryOptions: Array<{ value: 'Toutes' | RecipeCategory, label: string }> = [
  { value: 'Toutes', label: 'Toutes les catégories' },
  { value: 'Petit-déjeuner', label: 'Petit-déjeuner' },
  { value: 'Déjeuner', label: 'Déjeuner' },
  { value: 'Dîner', label: 'Dîner' },
  { value: 'Collation', label: 'Collation' },
  { value: 'Dessert', label: 'Dessert' },
]
const selectedCategory = ref<'Toutes' | RecipeCategory>('Toutes')

const difficultyOptions: Array<{ value: 'Toutes' | RecipeDifficulty, label: string }> = [
  { value: 'Toutes', label: 'Toutes difficultés' },
  { value: 'Facile', label: 'Facile' },
  { value: 'Moyen', label: 'Moyen' },
  { value: 'Difficile', label: 'Difficile' },
]
const selectedDifficulty = ref<'Toutes' | RecipeDifficulty>('Toutes')

const sortOptions = [
  { value: 'label-asc', label: 'Nom (A–Z)' },
  { value: 'label-desc', label: 'Nom (Z–A)' },
  { value: 'calories-desc', label: 'Calories ↓' },
  { value: 'calories-asc', label: 'Calories ↑' },
  { value: 'time-asc', label: 'Temps ↑' },
]
const selectedSort = ref('label-asc')

const favoritesOnly = ref(false)

const filteredRecipes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()

  const list = recipes.value.filter((r) => {
    const matchesQuery = !q
      || r.title.toLowerCase().includes(q)
      || r.ingredientsPreview.toLowerCase().includes(q)
    const matchesCategory = selectedCategory.value === 'Toutes' || r.category === selectedCategory.value
    const matchesDifficulty = selectedDifficulty.value === 'Toutes' || r.difficulty === selectedDifficulty.value
    const matchesFavorite = !favoritesOnly.value || r.isFavorite
    return matchesQuery && matchesCategory && matchesDifficulty && matchesFavorite
  })

  return [...list].sort((a, b) => {
    switch (selectedSort.value) {
      case 'label-desc': return b.title.localeCompare(a.title, 'fr')
      case 'calories-desc': return b.calories - a.calories
      case 'calories-asc': return a.calories - b.calories
      case 'time-asc': return a.prepTime - b.prepTime
      default: return a.title.localeCompare(b.title, 'fr')
    }
  })
})

const recipeListHeaderLabel = computed(() => {
  const n = filteredRecipes.value.length
  const q = searchQuery.value.trim()
  if (n === 0) return q ? 'Aucun résultat' : 'Aucune recette'
  if (n === 1) return '1 Recette'
  return `${n} Recettes`
})

const hasActiveFilters = computed(() =>
  !!searchQuery.value.trim()
  || selectedCategory.value !== 'Toutes'
  || selectedDifficulty.value !== 'Toutes'
  || favoritesOnly.value
)

const resetFilters = () => {
  searchQuery.value = ''
  selectedCategory.value = 'Toutes'
  selectedDifficulty.value = 'Toutes'
  favoritesOnly.value = false
}

const toggleFavorite = (recipe: RecipePreview) => {
  recipe.isFavorite = !recipe.isFavorite
}

const editRecipe = (recipe: RecipePreview) => {
  console.log('Modifier', recipe.title)
}

const deleteRecipe = (recipe: RecipePreview) => {
  console.log('Supprimer', recipe.title)
}

const selectRecipe = (recipe: RecipePreview) => {
  console.log('Voir', recipe.title)
}

const addRecipe = () => {
  console.log('Ajouter une recette')
}
</script>

<template>
  <UDashboardPanel id="recipes">
    <template #header>
      <UDashboardNavbar title="Recettes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="primary" @click="addRecipe">
            <UIcon name="i-lucide-plus" class="size-5 shrink-0" />
            Ajouter une recette
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 p-4 sm:p-6">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-medium text-highlighted">
              {{ recipeListHeaderLabel }}
            </p>
            <UButton
              v-if="hasActiveFilters"
              label="Réinitialiser les filtres"
              icon="i-lucide-x"
              color="neutral"
              variant="link"
              size="xs"
              class="p-0"
              @click="resetFilters"
            />
          </div>
          <div class="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              size="md"
              variant="outline"
              placeholder="Rechercher une recette, un ingrédient..."
              class="w-full sm:basis-full"
            />
            <USelectMenu
              v-model="selectedCategory"
              :items="categoryOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-utensils"
              class="w-full sm:w-48 shrink-0"
            />
            <USelectMenu
              v-model="selectedDifficulty"
              :items="difficultyOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-gauge"
              class="w-full sm:w-44 shrink-0"
            />
            <USelectMenu
              v-model="selectedSort"
              :items="sortOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-arrow-up-down"
              class="w-full sm:w-40 shrink-0"
            />
            <div class="flex items-center gap-1.5 border-t border-default pt-3 sm:border-t-0 sm:border-l sm:pl-3 sm:pt-0 sm:shrink-0 sm:ml-auto">
              <UTooltip text="Filtrer les recettes favorites" class="flex-1 sm:flex-none">
                <UButton
                  :color="favoritesOnly ? 'primary' : 'neutral'"
                  :variant="favoritesOnly ? 'solid' : 'outline'"
                  icon="i-lucide-heart"
                  aria-label="Filtrer les recettes favorites"
                  :aria-pressed="favoritesOnly"
                  class="w-full sm:w-auto justify-center"
                  @click="favoritesOnly = !favoritesOnly"
                />
              </UTooltip>
            </div>
          </div>
        </div>

        <UEmpty
          v-if="filteredRecipes.length === 0"
          class="py-12"
          icon="i-lucide-search-x"
          title="Aucune recette trouvée"
          description="Essayez un autre terme de recherche ou ajoutez une nouvelle recette."
        />

        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <RecipeCard
            v-for="recipe in filteredRecipes"
            :key="recipe.id"
            :recipe="recipe"
            @select="selectRecipe(recipe)"
            @edit="editRecipe(recipe)"
            @delete="deleteRecipe(recipe)"
            @favorite="toggleFavorite(recipe)"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
