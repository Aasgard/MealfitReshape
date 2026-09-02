<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, orderBy, deleteDoc, doc } from 'firebase/firestore'
import type { Recipe } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { RECIPE_TYPES, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'
import { describeRecipeLine, macrosForRecipe } from '~/utils/recipeNutrition'

useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const { formatDate } = useDateFormat()

const recipes = useCollection<Recipe>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'recipes'),
    or(
      where('owner', '==', uid),
      where('owner', '==', null)
    ),
    orderBy('title', 'asc')
  )
})
await recipes.promise.value

/** Catalogue d'ingrédients (privés de l'utilisateur + publics) pour résoudre les macros affichées sur les cartes. */
const ingredients = useCollection<Ingredient>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', uid),
      where('owner', '==', null)
    )
  )
})
const ingredientsById = computed(() => new Map(ingredients.value.map(i => [i.id, i])))

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

/** Recettes masquées immédiatement pendant le délai d'annulation d'une suppression (voir confirmDeleteRecipe). */
const pendingDeleteIds = ref(new Set<string>())

const filteredRecipes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()

  const list = (recipes.value ?? []).filter(r => !pendingDeleteIds.value.has(r.id)).filter((r) => {
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

const formOpen = ref(false)
const editingRecipe = ref<Recipe | null>(null)

const addRecipe = () => {
  editingRecipe.value = null
  formOpen.value = true
}

const editRecipe = (recipe: Recipe) => {
  slideoverOpen.value = false
  editingRecipe.value = recipe
  formOpen.value = true
}

const slideoverOpen = ref(false)
useOverlayBackClose(slideoverOpen)
const selectedRecipe = ref<Recipe | null>(null)

const selectRecipe = (recipe: Recipe) => {
  selectedRecipe.value = recipe
  slideoverOpen.value = true
}

const selectedRecipePersons = computed(() => selectedRecipe.value?.persons ?? 1)

const selectedRecipeMacros = computed(() =>
  macrosForRecipe(selectedRecipe.value?.ingredients, ingredientsById.value, selectedRecipePersons.value)
)
const hasSelectedRecipeMacros = computed(() => {
  const m = selectedRecipeMacros.value
  return m.calories > 0 || m.protein > 0 || m.carbohydrates > 0 || m.fat > 0
})

/** Lignes d'ingrédients résolues (nom + quantité affichable) pour la recette sélectionnée. */
const selectedRecipeLines = computed(() => {
  const recipe = selectedRecipe.value
  if (!recipe?.ingredients?.length) return []
  return recipe.ingredients.map((line, idx) => {
    const described = describeRecipeLine(line, ingredientsById.value)
    return {
      key: `${line.ingredientRef?.id ?? 'unknown'}-${idx}`,
      label: described?.label ?? 'Ingrédient introuvable',
      quantityLabel: described?.quantityLabel ?? `${line.quantity}`,
    }
  })
})

const recipeToDelete = ref<Recipe | null>(null)
const deleteDialogOpen = ref(false)

const askDeleteRecipe = (recipe: Recipe) => {
  recipeToDelete.value = recipe
  deleteDialogOpen.value = true
}

const deleteConfirmDescription = computed(() => {
  const title = recipeToDelete.value?.title
  return title
    ? `« ${title} » sera supprimée après un court délai, le temps d'annuler si besoin.`
    : undefined
})

const DELETE_GRACE_PERIOD_MS = 6000
/** Handles des suppressions programmées mais pas encore exécutées (délai d'annulation en cours), par id de recette. */
const pendingDeleteTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const performDelete = async (id: string, title: string) => {
  try {
    await deleteDoc(doc(db, 'recipes', id))
  } catch (error: any) {
    console.error('Erreur lors de la suppression:', error)
    // La suppression a échoué : on réaffiche la carte, masquée depuis le clic sur « Supprimer ».
    pendingDeleteIds.value.delete(id)
    toast.add({
      title: 'Erreur',
      description: `« ${title} » n'a pas pu être supprimée : ${error.message || 'une erreur est survenue'}.`,
      color: 'error'
    })
    return
  }
  pendingDeleteIds.value.delete(id)
}

const confirmDeleteRecipe = () => {
  const recipe = recipeToDelete.value
  if (!recipe) return

  deleteDialogOpen.value = false
  recipeToDelete.value = null

  const { id, title } = recipe
  pendingDeleteIds.value.add(id)

  const timeout = setTimeout(() => {
    pendingDeleteTimeouts.delete(id)
    performDelete(id, title)
  }, DELETE_GRACE_PERIOD_MS)
  pendingDeleteTimeouts.set(id, timeout)

  toast.add({
    title: 'Recette supprimée',
    description: `« ${title} » sera définitivement supprimée.`,
    color: 'neutral',
    actions: [{
      label: 'Annuler',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        const pending = pendingDeleteTimeouts.get(id)
        if (!pending) return
        clearTimeout(pending)
        pendingDeleteTimeouts.delete(id)
        pendingDeleteIds.value.delete(id)
        toast.add({ title: 'Suppression annulée', description: `« ${title} » a été conservée`, color: 'success' })
      }
    }]
  })
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
              class="rounded-xl border border-default bg-default overflow-hidden flex flex-col"
            >
              <USkeleton class="w-full h-36 rounded-none" />
              <div class="p-4 flex flex-col gap-2 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <USkeleton class="h-5 w-2/3" />
                  <USkeleton class="size-5 rounded-full shrink-0" />
                </div>
                <USkeleton class="h-4 w-32 mt-1" />
                <div class="flex items-center gap-2 mt-auto pt-2 border-t border-default">
                  <USkeleton class="h-5 w-24 rounded-full" />
                  <USkeleton class="h-5 w-20 rounded-full" />
                </div>
              </div>
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
              :ingredients-by-id="ingredientsById"
              @select="selectRecipe(recipe)"
              @edit="editRecipe(recipe)"
              @delete="askDeleteRecipe(recipe)"
            />
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <USlideover
    v-model:open="slideoverOpen"
    :title="selectedRecipe?.title"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <img
          v-if="selectedRecipe?.imageUrl"
          :src="selectedRecipe.imageUrl"
          :alt="selectedRecipe.title"
          class="w-full h-40 object-cover rounded-lg"
        />

        <!-- Repas / difficulté / parts / temps -->
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            v-if="selectedRecipe?.type"
            icon="i-lucide-utensils"
            :label="recipeTypeLabel(selectedRecipe.type)"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            icon="i-lucide-gauge"
            :label="recipeDifficultyLabel(selectedRecipe?.difficulty)"
            :color="recipeDifficultyColor(selectedRecipe?.difficulty)"
            variant="subtle"
            size="sm"
          />
          <UBadge
            icon="i-lucide-users"
            :label="`${selectedRecipePersons} part${selectedRecipePersons > 1 ? 's' : ''}`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="selectedRecipe?.prepTime != null"
            icon="i-lucide-clock"
            :label="`${selectedRecipe.prepTime} min prép.`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="selectedRecipe?.cookTime != null"
            icon="i-lucide-flame"
            :label="`${selectedRecipe.cookTime} min cuisson`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>

        <!-- Valeurs nutritionnelles -->
        <div v-if="hasSelectedRecipeMacros">
          <p class="text-xs text-dimmed mb-2">Valeurs nutritionnelles pour une part</p>
          <IngredientMacroSummary :macros="selectedRecipeMacros" />
        </div>
        <p v-if="!hasSelectedRecipeMacros" class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
          Valeurs non renseignées
        </p>

        <!-- Ingrédients -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-list" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Ingrédients</p>
          </div>
          <ul v-if="selectedRecipeLines.length" class="rounded-lg border border-default bg-elevated overflow-hidden">
            <li
              v-for="line in selectedRecipeLines"
              :key="line.key"
              class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-default last:border-b-0"
            >
              <span class="text-sm font-medium text-highlighted truncate">{{ line.label }}</span>
              <span class="text-sm tabular-nums text-muted shrink-0">{{ line.quantityLabel }}</span>
            </li>
          </ul>
          <p v-else class="flex items-center gap-1.5 text-xs text-dimmed">
            <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
            Aucun ingrédient
          </p>
        </div>

        <!-- Tags -->
        <div v-if="selectedRecipe?.tags?.length">
          <p class="text-xs text-dimmed mb-2">Tags</p>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="tag in selectedRecipe.tags"
              :key="tag"
              :label="tag"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
        </div>

        <!-- Description -->
        <div v-if="selectedRecipe?.description">
          <p class="text-xs text-dimmed mb-1">Description</p>
          <p class="text-sm text-muted whitespace-pre-line">{{ selectedRecipe.description }}</p>
        </div>

        <!-- Instructions -->
        <div v-if="selectedRecipe?.instructions">
          <p class="text-xs text-dimmed mb-1">Instructions</p>
          <p class="text-sm text-muted whitespace-pre-line">{{ selectedRecipe.instructions }}</p>
        </div>

        <!-- Source -->
        <div v-if="selectedRecipe?.source">
          <p class="text-xs text-dimmed mb-1">Source</p>
          <p class="text-sm text-muted">{{ selectedRecipe.source }}</p>
        </div>

        <!-- Modifiée le -->
        <div v-if="selectedRecipe">
          <p class="text-xs text-dimmed mb-1">Modifiée le</p>
          <p class="text-sm text-muted">{{ formatDate(selectedRecipe.updatedAt) }}</p>
        </div>
      </div>
    </template>
  </USlideover>

  <RecipeFormSlideover
    v-model:open="formOpen"
    :recipe="editingRecipe"
  />

  <ConfirmDialog
    v-model:open="deleteDialogOpen"
    title="Supprimer cette recette ?"
    :description="deleteConfirmDescription"
    confirm-label="Supprimer"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    @confirm="confirmDeleteRecipe"
  />
</template>
