<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, orderBy, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import type { Recipe, RecipeIngredientLine } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { RECIPE_TYPES, recipeTypeIcon, recipeTypeLabel, type RecipeType } from '~/utils/recipeType'
import { matchesSearch } from '~/utils/search'
import { macrosForRecipe } from '~/utils/recipeNutrition'
import type { IngredientMacros } from '~/utils/ingredientNutrition'
import { sortList, type SortState } from '~/utils/listSort'
import { DEFAULT_RECIPE_SORT, RECIPE_CARD_SORT_OPTIONS, RECIPE_SORT_OPTIONS, recipeSortValue, type RecipeSortKey } from '~/utils/recipeSort'

useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()

const recipes = useCollection<Recipe>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'recipes'),
    // or(
    //   where('owner', '==', uid),
    //   where('owner', '==', null)
    // ),
    orderBy('title', 'asc')
  )
})
await recipes.promise.value

/** Vrai tant que l'utilisateur n'est pas résolu (requête non lancée) ou que la première lecture Firestore n'est pas revenue. */
const recipesLoading = computed(() => !user.value || recipes.pending.value)

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

const typeOptions = RECIPE_TYPES.map(t => ({ value: t, label: recipeTypeLabel(t), icon: recipeTypeIcon(t) ?? undefined }))
/** Une recette doit être de l'un des types sélectionnés ; aucun = tous les types. */
const selectedTypes = ref<RecipeType[]>([])

const toggleType = (type: RecipeType) => {
  selectedTypes.value = selectedTypes.value.includes(type)
    ? selectedTypes.value.filter(t => t !== type)
    : [...selectedTypes.value, type]
}

/** Ingrédients présents dans au moins une recette, pour ne proposer que des filtres utiles. */
const ingredientOptions = computed(() => {
  const usedIds = new Set<string>()
  for (const r of recipes.value ?? []) {
    for (const line of r.ingredients ?? []) {
      if (line.ingredientRef?.id) usedIds.add(line.ingredientRef.id)
    }
  }
  return [...usedIds]
    .map(id => ingredientsById.value.get(id))
    .filter((i): i is Ingredient => !!i)
    .map(i => ({ id: i.id, label: i.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
})
/** Une recette doit contenir tous les ingrédients sélectionnés. */
const selectedIngredientIds = ref<string[]>([])

/** Recettes masquées immédiatement pendant le délai d'annulation d'une suppression (voir confirmDeleteRecipe). */
const pendingDeleteIds = ref(new Set<string>())

const filteredRecipes = computed(() => {
  const list = (recipes.value ?? []).filter(r => !pendingDeleteIds.value.has(r.id)).filter((r) => {
    const matchesQuery = matchesSearch(r.title, searchQuery.value)
    const matchesType = selectedTypes.value.length === 0 || (!!r.type && selectedTypes.value.includes(r.type))
    const matchesIngredients = selectedIngredientIds.value.length === 0 || (() => {
      const recipeIngredientIds = new Set((r.ingredients ?? []).map(line => line.ingredientRef?.id))
      return selectedIngredientIds.value.every(id => recipeIngredientIds.has(id))
    })()
    return matchesQuery && matchesType && matchesIngredients
  })

  return sortList(list, r => recipeSortValue(r, sort.value.key, recipeMacrosById.value.get(r.id) ?? null), sort.value.direction, r => r.title)
})

const viewMode = useViewMode('recipes')


/** Tri commun aux deux vues (non mémorisé) : en-têtes de colonnes en vue liste desktop, champ « Trier par » ailleurs. */
const sort = ref<SortState<RecipeSortKey>>({ ...DEFAULT_RECIPE_SORT })

/** Critères du champ « Trier par » : réduits en vue cartes ; un critère retiré repasse au tri par nom. */
const sortOptions = computed(() => viewMode.value === 'cards' ? RECIPE_CARD_SORT_OPTIONS : RECIPE_SORT_OPTIONS)
watch(sortOptions, (options) => {
  if (!options.some(o => o.key === sort.value.key)) sort.value = { ...DEFAULT_RECIPE_SORT }
})

/** Macros par part de chaque recette, pour le tri et la vue liste ; `null` quand rien n'est calculable. */
const recipeMacrosById = computed(() => new Map<string, IngredientMacros | null>(
  (recipes.value ?? []).map((r) => {
    const macros = macrosForRecipe(r.ingredients, ingredientsById.value, r.persons ?? 1)
    const hasMacros = macros.calories > 0 || macros.protein > 0 || macros.carbohydrates > 0 || macros.fat > 0
    return [r.id, hasMacros ? macros : null]
  })
))

const recipeListHeaderLabel = computed(() => {
  const n = filteredRecipes.value.length
  const q = searchQuery.value.trim()
  if (n === 0) return q ? 'Aucun résultat' : 'Aucune recette'
  if (n === 1) return '1 Recette'
  return `${n} Recettes`
})

const hasActiveFilters = computed(() =>
  !!searchQuery.value.trim()
  || selectedTypes.value.length > 0
  || selectedIngredientIds.value.length > 0
)

const resetFilters = () => {
  searchQuery.value = ''
  selectedTypes.value = []
  selectedIngredientIds.value = []
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

/** Crée une copie privée de la recette (y compris une recette publique), suffixée par « (copie) ». */
const duplicateRecipe = async (recipe: Recipe) => {
  if (!user.value) return

  const { id: _id, isPublic: _isPublic, owner: _owner, createdAt: _createdAt, updatedAt: _updatedAt, ingredients, ...rest } = recipe
  const title = `${recipe.title} (copie)`
  const now = Timestamp.now()

  // VueFire résout les références : on reconstruit de vraies DocumentReference à partir des ids.
  const ingredientLines: RecipeIngredientLine[] = (ingredients ?? [])
    .filter(line => line.ingredientRef?.id)
    .map((line) => {
      const copy: RecipeIngredientLine = {
        ingredientRef: doc(db, 'ingredients', line.ingredientRef.id),
        quantity: line.quantity,
      }
      if (line.unit) copy.unit = line.unit
      return copy
    })

  try {
    const created = await addDoc(collection(db, 'recipes'), {
      ...rest,
      title,
      ingredients: ingredientLines,
      owner: user.value.uid,
      createdAt: now,
      updatedAt: now,
    })
    toast.add({
      title: 'Recette dupliquée',
      description: `« ${title} » a été ajoutée à vos recettes`,
      color: 'success',
      actions: [{
        label: 'Modifier',
        color: 'neutral',
        variant: 'outline',
        onClick: () => {
          const copy = recipes.value.find(r => r.id === created.id)
          if (copy) editRecipe(copy)
        }
      }]
    })
  } catch (error: any) {
    console.error('Erreur lors de la duplication:', error)
    toast.add({
      title: 'Erreur',
      description: `« ${recipe.title} » n'a pas pu être dupliquée : ${error.message || 'une erreur est survenue'}.`,
      color: 'error'
    })
  }
}

const slideoverOpen = ref(false)
const selectedRecipe = ref<Recipe | null>(null)

const selectRecipe = (recipe: Recipe) => {
  selectedRecipe.value = recipe
  slideoverOpen.value = true
}

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
  <UDashboardPanel id="recipes" :ui="{ body: 'p-0 sm:p-0 gap-0 sm:gap-0 lg:overflow-hidden' }">
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
      <!-- À partir de lg, la barre de filtres reste fixe et seule la zone de liste défile ; les deux réservent la même gouttière
           de barre de défilement pour garder le même alignement gauche/droite en vue cartes et en vue liste. -->
      <div class="flex flex-col lg:flex-1 lg:min-h-0">
        <div class="flex flex-col gap-3 shrink-0 px-4 sm:px-6 pt-4 pb-4 lg:overflow-y-hidden lg:[scrollbar-gutter:stable]">
          <!-- Recherche, types et ingrédients sur une ligne à partir de xl ; en dessous, la recherche garde sa propre ligne. -->
          <div class="flex flex-col xl:flex-row xl:items-center gap-3">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              size="md"
              variant="outline"
              placeholder="Rechercher une recette..."
              class="w-full xl:flex-1 xl:min-w-0"
            />
            <!-- Types puis ingrédients, côte à côte à partir de md, empilés en dessous. -->
            <div class="flex flex-col md:flex-row md:items-center gap-3 xl:shrink-0">
              <!-- Boutons bascule, comme dans la fenêtre d'ajout d'un repas ; plusieurs types peuvent être actifs à la fois. -->
              <!-- p-0.5 : boutons sm (28 px) + 4 px = 32 px, la hauteur des champs ; les lignes de filtres et de tri tombent ainsi au même endroit que sur la page Ingrédients. -->
              <div role="group" aria-label="Filtrer par type de plat" class="flex flex-wrap gap-1 rounded-lg bg-elevated p-0.5 md:shrink-0 md:flex-nowrap">
                <UButton
                  v-for="option in typeOptions"
                  :key="option.value"
                  :label="option.label"
                  :icon="option.icon"
                  :color="selectedTypes.includes(option.value) ? 'primary' : 'neutral'"
                  :variant="selectedTypes.includes(option.value) ? 'solid' : 'outline'"
                  size="sm"
                  :aria-pressed="selectedTypes.includes(option.value)"
                  class="flex-1 justify-center md:flex-none"
                  @click="toggleType(option.value)"
                />
              </div>
              <USelectMenu
                v-model="selectedIngredientIds"
                :items="ingredientOptions"
                value-key="id"
                multiple
                placeholder="Tous les ingrédients"
                :search-input="{ placeholder: 'Rechercher un ingrédient...' }"
                icon="i-lucide-carrot"
                class="w-full md:min-w-0 md:flex-1 xl:w-80 xl:flex-none 2xl:w-96"
              />
            </div>
          </div>
          <!-- Sous les filtres : résultat, tri et choix de la vue, toujours sur une seule ligne (contrôles condensés en mobile). -->
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="flex items-center gap-2 sm:gap-3 min-w-0">
              <p class="text-sm font-medium text-highlighted whitespace-nowrap">
                {{ recipeListHeaderLabel }}
              </p>
              <UButton
                v-if="hasActiveFilters"
                aria-label="Réinitialiser les filtres"
                icon="i-lucide-funnel-x"
                color="neutral"
                variant="link"
                size="xs"
                class="p-0"
                @click="resetFilters"
              >
                <span class="hidden sm:inline">Réinitialiser les filtres</span>
              </UButton>
            </div>
            <div class="flex items-center gap-2 ml-auto">
              <!-- En vue liste desktop, ce sont les en-têtes de colonnes qui trient. -->
              <SortControl v-model="sort" :options="sortOptions" :class="viewMode === 'list' && 'lg:hidden'" />
              <ViewModeToggle v-model="viewMode" />
            </div>
          </div>
        </div>

        <!-- Zone qui défile (à partir de lg) : la liste est rognée sous la barre, rien ne passe derrière.
             En vue liste, c'est le cadre du tableau qui défile : la zone ne défile pas mais garde sa gouttière (même alignement). -->
        <div
          class="flex flex-col gap-4 px-4 sm:px-6 pb-6 lg:flex-1 lg:min-h-0 lg:[scrollbar-gutter:stable]"
          :class="viewMode === 'list' ? 'lg:overflow-y-hidden' : 'lg:overflow-y-auto'"
        >
          <UEmpty
            v-if="!recipesLoading && recipes.length === 0"
            class="py-12"
            icon="i-lucide-chef-hat"
            title="Aucune recette"
            description="Ajoutez votre première recette pour la retrouver ici."
            :actions="[{ label: 'Ajouter une recette', icon: 'i-lucide-plus', onClick: addRecipe }]"
          />
          <UEmpty
            v-else-if="!recipesLoading && filteredRecipes.length === 0"
            class="py-12"
            icon="i-lucide-search-x"
            title="Aucune recette trouvée"
            description="Essayez un autre terme de recherche ou ajoutez une nouvelle recette."
          />
          <RecipeList
            v-else-if="viewMode === 'list'"
            v-model:sort="sort"
            :recipes="filteredRecipes"
            :macros-by-id="recipeMacrosById"
            :loading="recipesLoading"
            @select="selectRecipe"
            @edit="editRecipe"
            @duplicate="duplicateRecipe"
            @delete="askDeleteRecipe"
          />
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <template v-if="recipesLoading">
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
            <template v-else>
              <RecipeCard
                v-for="recipe in filteredRecipes"
                :key="recipe.id"
                :recipe="recipe"
                :ingredients-by-id="ingredientsById"
                @select="selectRecipe(recipe)"
                @edit="editRecipe(recipe)"
                @duplicate="duplicateRecipe(recipe)"
                @delete="askDeleteRecipe(recipe)"
              />
            </template>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <RecipeDetailSlideover
    v-model:open="slideoverOpen"
    :recipe="selectedRecipe"
    :ingredients-by-id="ingredientsById"
  />

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
