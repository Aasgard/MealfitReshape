<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

type Category = 'Petit-déjeuner' | 'Déjeuner' | 'Dîner' | 'Collation' | 'Dessert'
type Difficulty = 'Facile' | 'Moyen' | 'Difficile'

interface TestRecipe {
  id: string
  title: string
  ingredientsPreview: string
  category: Category
  prepTime: number
  calories: number
  difficulty: Difficulty
  emoji: string
  gradient: string
  isFavorite: boolean
}

const recipes = ref<TestRecipe[]>([
  { id: '1', title: 'Banana bread', ingredientsPreview: 'banane, farine, noix', category: 'Collation', prepTime: 60, calories: 290, difficulty: 'Moyen', emoji: '🍌', gradient: 'from-amber-200 to-orange-100', isFavorite: false },
  { id: '2', title: 'Bowl de saumon teriyaki', ingredientsPreview: 'saumon, riz, avocat', category: 'Dîner', prepTime: 30, calories: 540, difficulty: 'Moyen', emoji: '🍣', gradient: 'from-rose-200 to-orange-100', isFavorite: true },
  { id: '3', title: 'Buddha bowl végétarien', ingredientsPreview: 'quinoa, avocat, pois chiche', category: 'Déjeuner', prepTime: 25, calories: 450, difficulty: 'Moyen', emoji: '🥗', gradient: 'from-emerald-200 to-teal-100', isFavorite: false },
  { id: '4', title: 'Chili con carne', ingredientsPreview: 'bœuf, haricots, tomate', category: 'Dîner', prepTime: 50, calories: 560, difficulty: 'Moyen', emoji: '🌶️', gradient: 'from-rose-200 to-pink-100', isFavorite: false },
  { id: '5', title: 'Curry de légumes', ingredientsPreview: 'carotte, brocoli, riz', category: 'Dîner', prepTime: 40, calories: 390, difficulty: 'Moyen', emoji: '🍛', gradient: 'from-orange-200 to-amber-100', isFavorite: false },
  { id: '6', title: 'Lasagnes bolognaise', ingredientsPreview: 'bœuf, pâtes, tomate', category: 'Dîner', prepTime: 80, calories: 640, difficulty: 'Difficile', emoji: '🧀', gradient: 'from-pink-200 to-rose-100', isFavorite: false },
  { id: '7', title: 'Mousse au chocolat', ingredientsPreview: 'chocolat, œuf, sucre', category: 'Dessert', prepTime: 25, calories: 320, difficulty: 'Moyen', emoji: '🍫', gradient: 'from-stone-300 to-amber-100', isFavorite: true },
  { id: '8', title: 'Œufs brouillés & avocat', ingredientsPreview: 'œuf, avocat, pain', category: 'Petit-déjeuner', prepTime: 12, calories: 340, difficulty: 'Facile', emoji: '🥑', gradient: 'from-lime-200 to-emerald-100', isFavorite: false },
  { id: '9', title: 'Pancakes protéinés', ingredientsPreview: 'avoine, œuf, banane', category: 'Petit-déjeuner', prepTime: 20, calories: 380, difficulty: 'Facile', emoji: '🥞', gradient: 'from-amber-200 to-yellow-100', isFavorite: false },
  { id: '10', title: 'Smoothie bowl', ingredientsPreview: 'fruits rouges, yaourt, granola', category: 'Petit-déjeuner', prepTime: 10, calories: 260, difficulty: 'Facile', emoji: '🍓', gradient: 'from-fuchsia-200 to-pink-100', isFavorite: false },
  { id: '11', title: 'Poke bowl thon', ingredientsPreview: 'thon, riz, edamame', category: 'Déjeuner', prepTime: 20, calories: 470, difficulty: 'Moyen', emoji: '🍥', gradient: 'from-cyan-200 to-sky-100', isFavorite: false },
  { id: '12', title: 'Tiramisu', ingredientsPreview: 'mascarpone, café, cacao', category: 'Dessert', prepTime: 35, calories: 410, difficulty: 'Difficile', emoji: '🍮', gradient: 'from-amber-200 to-stone-100', isFavorite: true },
])

const categories: Array<'Toutes' | Category> = ['Toutes', 'Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collation', 'Dessert']
const difficultyOptions = ['Toutes difficultés', 'Facile', 'Moyen', 'Difficile']
const sortOptions = ['Nom (A–Z)', 'Nom (Z–A)', 'Calories ↓', 'Calories ↑', 'Temps ↑']

const searchQuery = ref('')
const selectedCategory = ref<'Toutes' | Category>('Toutes')
const selectedDifficulty = ref('Toutes difficultés')
const selectedSort = ref('Nom (A–Z)')

const difficultyColor = (d: Difficulty) =>
  d === 'Facile' ? 'success' : d === 'Moyen' ? 'warning' : 'error'

const filteredRecipes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()

  let list = recipes.value.filter((r) => {
    const matchesQuery = !q
      || r.title.toLowerCase().includes(q)
      || r.ingredientsPreview.toLowerCase().includes(q)
    const matchesCategory = selectedCategory.value === 'Toutes' || r.category === selectedCategory.value
    const matchesDifficulty = selectedDifficulty.value === 'Toutes difficultés' || r.difficulty === selectedDifficulty.value
    return matchesQuery && matchesCategory && matchesDifficulty
  })

  list = [...list].sort((a, b) => {
    switch (selectedSort.value) {
      case 'Nom (Z–A)': return b.title.localeCompare(a.title, 'fr')
      case 'Calories ↓': return b.calories - a.calories
      case 'Calories ↑': return a.calories - b.calories
      case 'Temps ↑': return a.prepTime - b.prepTime
      default: return a.title.localeCompare(b.title, 'fr')
    }
  })

  return list
})

const countLabel = computed(() => {
  const n = filteredRecipes.value.length
  return n <= 1 ? `${n} recette` : `${n} recettes`
})

const categoryCount = (cat: 'Toutes' | Category) =>
  cat === 'Toutes' ? recipes.value.length : recipes.value.filter(r => r.category === cat).length

const toggleFavorite = (recipe: TestRecipe) => {
  recipe.isFavorite = !recipe.isFavorite
}

const resetFilters = () => {
  searchQuery.value = ''
  selectedCategory.value = 'Toutes'
  selectedDifficulty.value = 'Toutes difficultés'
}

const recipeMenuItems = (recipe: TestRecipe) => [
  [
    { label: 'Voir la recette', icon: 'i-lucide-eye', onSelect: () => console.log('Voir', recipe.title) },
    { label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => console.log('Modifier', recipe.title) },
    {
      label: recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
      icon: 'i-lucide-heart',
      onSelect: () => toggleFavorite(recipe),
    },
  ],
  [
    { label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => console.log('Supprimer', recipe.title) },
  ],
]

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
      <div class="flex flex-col gap-5 p-4 sm:p-6">
        <p class="text-sm font-medium text-highlighted">
          {{ countLabel }}
        </p>

        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          size="lg"
          variant="outline"
          placeholder="Rechercher une recette, un ingrédient…"
          class="w-full"
        >
          <template v-if="searchQuery" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-x"
              aria-label="Effacer la recherche"
              @click="() => { searchQuery = '' }"
            />
          </template>
        </UInput>

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="cat in categories"
              :key="cat"
              :color="selectedCategory === cat ? 'primary' : 'neutral'"
              :variant="selectedCategory === cat ? 'solid' : 'outline'"
              size="sm"
              class="rounded-full"
              @click="() => { selectedCategory = cat }"
            >
              {{ cat }}
              <UBadge
                :color="selectedCategory === cat ? 'primary' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ categoryCount(cat) }}
              </UBadge>
            </UButton>
          </div>

          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="selectedDifficulty"
              :items="difficultyOptions"
              :search-input="false"
              icon="i-lucide-gauge"
              class="w-44"
            />
            <USelectMenu
              v-model="selectedSort"
              :items="sortOptions"
              :search-input="false"
              icon="i-lucide-arrow-up-down"
              class="w-40"
            />
          </div>
        </div>

        <USeparator />

        <UEmpty
          v-if="!filteredRecipes.length"
          class="py-16"
          icon="i-lucide-search-x"
          title="Aucune recette trouvée"
          description="Essayez un autre terme de recherche ou réinitialisez les filtres."
        >
          <template #actions>
            <UButton
              label="Réinitialiser les filtres"
              color="neutral"
              variant="subtle"
              icon="i-lucide-rotate-ccw"
              @click="resetFilters"
            />
          </template>
        </UEmpty>

        <div
          v-else
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <UCard
            v-for="recipe in filteredRecipes"
            :key="recipe.id"
            class="overflow-hidden transition-shadow hover:shadow-lg"
            :ui="{ header: 'p-0 sm:px-0', body: 'flex flex-col gap-3' }"
          >
            <template #header>
              <div
                class="relative flex h-32 items-center justify-center bg-linear-to-br"
                :class="recipe.gradient"
              >
                <span class="text-5xl drop-shadow-sm">{{ recipe.emoji }}</span>

                <UBadge
                  :label="recipe.category"
                  variant="solid"
                  size="sm"
                  class="absolute left-3 top-3 bg-white/95 text-highlighted shadow-sm ring-1 ring-black/5"
                />

                <UTooltip :text="recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'">
                  <UButton
                    icon="i-lucide-heart"
                    color="neutral"
                    variant="solid"
                    size="sm"
                    :aria-label="recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
                    class="absolute right-3 top-3 rounded-full bg-white/95 shadow-sm hover:bg-white"
                    :class="recipe.isFavorite ? 'text-red-500' : 'text-gray-500'"
                    :ui="{ leadingIcon: recipe.isFavorite ? 'fill-current' : '' }"
                    @click="toggleFavorite(recipe)"
                  />
                </UTooltip>
              </div>
            </template>

            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-highlighted">
                  {{ recipe.title }}
                </p>
                <p class="truncate text-sm text-muted">
                  {{ recipe.ingredientsPreview }}
                </p>
              </div>
              <UDropdownMenu :items="recipeMenuItems(recipe)" :ui="{ content: 'w-48' }">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                />
              </UDropdownMenu>
            </div>

            <USeparator />

            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-3 text-sm text-muted">
                <span class="inline-flex items-center gap-1">
                  <UIcon name="i-lucide-clock" class="size-4 shrink-0" />
                  <span class="tabular-nums">{{ recipe.prepTime }} min</span>
                </span>
                <span class="inline-flex items-center gap-1">
                  <UIcon name="i-lucide-flame" class="size-4 shrink-0" />
                  <span class="tabular-nums">{{ recipe.calories }}</span>
                </span>
              </div>
              <UBadge
                :label="recipe.difficulty"
                :color="difficultyColor(recipe.difficulty)"
                variant="subtle"
                size="sm"
              />
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
