<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, query, where, orderBy } from 'firebase/firestore'
import type { Recipe } from '~/types/recipe'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'

useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()

const recipes = useCollection<Recipe>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'recipes'),
    where('owner', '==', uid),
    orderBy('title', 'asc')
  )
})
await recipes.promise.value

const searchQuery = ref('')

const typeOptions: Array<{ value: 'Toutes' | RecipeType, label: string }> = [
  { value: 'Toutes', label: 'Tous les types' },
  ...RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t) })),
]
const selectedType = ref<'Toutes' | RecipeType>('Toutes')

const sortOptions = [
  { value: 'label-asc', label: 'Nom (A–Z)' },
  { value: 'label-desc', label: 'Nom (Z–A)' },
  { value: 'time-asc', label: 'Temps de préparation ↑' },
  { value: 'time-desc', label: 'Temps de préparation ↓' },
]
const selectedSort = ref('label-asc')

const filteredRecipes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()

  const list = (recipes.value ?? []).filter((r) => {
    const matchesQuery = !q || r.title.toLowerCase().includes(q)
    const matchesType = selectedType.value === 'Toutes' || r.type === selectedType.value
    return matchesQuery && matchesType
  })

  return [...list].sort((a, b) => {
    switch (selectedSort.value) {
      case 'label-desc': return b.title.localeCompare(a.title, 'fr')
      case 'time-asc': return (a.prepTime ?? 0) - (b.prepTime ?? 0)
      case 'time-desc': return (b.prepTime ?? 0) - (a.prepTime ?? 0)
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
  || selectedType.value !== 'Toutes'
)

const resetFilters = () => {
  searchQuery.value = ''
  selectedType.value = 'Toutes'
}

const editRecipe = (recipe: Recipe) => {
  console.log('Modifier', recipe.title)
}

const deleteRecipe = (recipe: Recipe) => {
  console.log('Supprimer', recipe.title)
}

const selectRecipe = (recipe: Recipe) => {
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
          <div class="flex flex-col sm:flex-row gap-3">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              size="md"
              variant="outline"
              placeholder="Rechercher une recette..."
              class="w-full"
            />
            <USelectMenu
              v-model="selectedType"
              :items="typeOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-utensils"
              class="w-full sm:w-48 shrink-0"
            />
            <USelectMenu
              v-model="selectedSort"
              :items="sortOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-arrow-up-down"
              class="w-full sm:w-52 shrink-0"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <template v-if="recipes.length === 0">
            <div
              v-for="i in 8"
              :key="`skeleton-${i}`"
              class="rounded-xl border border-default bg-default p-4 flex flex-col gap-2"
            >
              <div class="flex items-start justify-between gap-2">
                <USkeleton class="h-5 w-2/3" />
                <USkeleton class="size-5 rounded-full shrink-0" />
              </div>
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-4 w-32 mt-1" />
              <USkeleton class="h-5 w-28 mt-2" />
            </div>
          </template>
          <UEmpty
            v-else-if="filteredRecipes.length === 0"
            class="col-span-full py-12"
            icon="i-lucide-search-x"
            title="Aucune recette trouvée"
            description="Essayez un autre terme de recherche ou ajoutez une nouvelle recette."
          />
          <template v-else>
            <RecipeCard
              v-for="recipe in filteredRecipes"
              :key="recipe.id"
              :recipe="recipe"
              @select="selectRecipe(recipe)"
              @edit="editRecipe(recipe)"
              @delete="deleteRecipe(recipe)"
            />
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
