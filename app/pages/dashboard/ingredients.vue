<script setup lang="ts">
import { watch } from 'vue'
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, query, deleteDoc, doc, orderBy } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import type { Recipe } from '~/types/recipe'
import { ingredientUnitEntries } from '~/utils/ingredientNutrition'
import { recipesUsingIngredient, formatRecipeTitles } from '~/utils/recipeUsage'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { categoryIconName } from '~/utils/categoryIcon'
import { isIngredientInSeason } from '~/utils/ingredientSeason'

useSeoMeta({
  title: 'Dashboard - Ingrédients - Mealfit',
  description: 'Dashboard - Ingrédients - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()

const ingredients = useCollection<Ingredient>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'ingredients'),
    // or(
    //   where('owner', '==', uid),
    //   where('owner', '==', null)
    // ),
    orderBy('label', 'asc')
  )
})
/** Recettes accessibles (privées + publiques), pour interdire la suppression d'un ingrédient ou d'une unité utilisés. */
const recipes = useCollection<Recipe>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'recipes'),
    // or(
    //   where('owner', '==', uid),
    //   where('owner', '==', null)
    // )
  )
})
await Promise.all([ingredients.promise.value, recipes.promise.value])

/** Vrai tant que l'utilisateur n'est pas résolu (requête non lancée) ou que la première lecture Firestore n'est pas revenue. */
const ingredientsLoading = computed(() => !user.value || ingredients.pending.value)

const searchQuery = ref('')

const ingredientCategoriesStore = useIngredientCategoriesStore()
const selectedCategoryIds = ref<string[]>([])

const categoryOptions = computed(() =>
  ingredientCategoriesStore.categories.map(c => ({ id: c.id, label: c.label, icon: categoryIconName(c.icon) }))
)

const visibilityOptions = [
  { value: 'all', label: 'Tous' },
  { value: 'private', label: 'Privés' },
  { value: 'public', label: 'Publics' },
]
const selectedVisibility = ref<'all' | 'private' | 'public'>('all')
const seasonOnly = ref(false)
const unitsOnly = ref(false)

/** Un ingrédient sans `owner` appartient au catalogue public : il n'est ni privé, ni modifiable. */
const isOwnedByUser = (ingredient: Ingredient) =>
  !!ingredient.owner && ingredient.owner === user.value?.uid

/** Ingrédients masqués immédiatement pendant le délai d'annulation d'une suppression (voir confirmDeleteIngredient). */
const pendingDeleteIds = ref(new Set<string>())

const filteredIngredients = computed(() => {
  const list = [...(ingredients.value ?? [])].filter(i => !pendingDeleteIds.value.has(i.id))
  const q = searchQuery.value.trim().toLowerCase()
  return list.filter((i) => {
    const matchesQuery = !q || i.label.toLowerCase().includes(q)
    const matchesCategory = selectedCategoryIds.value.length === 0
      || (!!i.category?.id && selectedCategoryIds.value.includes(i.category.id))
    const matchesVisibility = selectedVisibility.value === 'all'
      || (selectedVisibility.value === 'public' ? !isOwnedByUser(i) : isOwnedByUser(i))
    const matchesSeason = !seasonOnly.value || isIngredientInSeason(i)
    const matchesUnits = !unitsOnly.value || ingredientUnitEntries(i).length > 0
    return matchesQuery && matchesCategory && matchesVisibility && matchesSeason && matchesUnits
  })
})

const ingredientListHeaderLabel = computed(() => {
  const n = filteredIngredients.value.length
  const q = searchQuery.value.trim()
  if (n === 0) return q ? 'Aucun résultat' : 'Aucun ingrédient'
  if (n === 1) return '1 Ingrédient'
  return `${n} Ingrédients`
})

const hasActiveFilters = computed(() =>
  !!searchQuery.value.trim()
  || selectedCategoryIds.value.length > 0
  || selectedVisibility.value !== 'all'
  || seasonOnly.value
  || unitsOnly.value
)

const resetFilters = () => {
  searchQuery.value = ''
  selectedCategoryIds.value = []
  selectedVisibility.value = 'all'
  seasonOnly.value = false
  unitsOnly.value = false
}

/**
 * Le catalogue (public + privé) n'a pas de limite côté requête Firestore : les filtres
 * (recherche, catégorie...) doivent porter sur l'ensemble des résultats déjà chargés.
 * On limite donc le nombre de cartes montées dans le DOM plutôt que la requête elle-même.
 */
const PAGE_SIZE = 24
const visibleCount = ref(PAGE_SIZE)
const displayedIngredients = computed(() => filteredIngredients.value.slice(0, visibleCount.value))
const hasMoreIngredients = computed(() => filteredIngredients.value.length > visibleCount.value)

watch([searchQuery, selectedCategoryIds, selectedVisibility, seasonOnly, unitsOnly], () => {
  visibleCount.value = PAGE_SIZE
})

const showMoreIngredients = () => {
  visibleCount.value += PAGE_SIZE
}

const slideoverOpen = ref(false)
const selectedIngredient = ref<Ingredient | null>(null)

/** Slideover d'ajout/modification (voir IngredientFormSlideover) : `formIngredient` nul = création. */
const formSlideoverOpen = ref(false)
const formIngredient = ref<Ingredient | null>(null)

const openCreateForm = () => {
  formIngredient.value = null
  formSlideoverOpen.value = true
}

const openEditForm = (ingredient: Ingredient) => {
  formIngredient.value = ingredient
  formSlideoverOpen.value = true
}

const openEditFromDetail = () => {
  if (!selectedIngredient.value) return
  const ingredient = selectedIngredient.value
  slideoverOpen.value = false
  openEditForm(ingredient)
}

const selectIngredient = (ingredient: Ingredient) => {
  console.log(ingredient.id)
  selectedIngredient.value = ingredient
  slideoverOpen.value = true
}

const ingredientToDelete = ref<Ingredient | null>(null)
const deleteDialogOpen = ref(false)

const askDeleteIngredient = (ingredient: Ingredient) => {
  const usedIn = recipesUsingIngredient(recipes.value, ingredient.id)
  if (usedIn.length) {
    toast.add({
      title: 'Suppression impossible',
      description: `« ${ingredient.label} » est utilisé dans ${usedIn.length > 1 ? `${usedIn.length} recettes` : 'la recette'} ${formatRecipeTitles(usedIn)}. Retirez-le de ces recettes avant de le supprimer.`,
      color: 'warning',
      icon: 'i-lucide-link',
    })
    return
  }

  ingredientToDelete.value = ingredient
  deleteDialogOpen.value = true
}

const deleteConfirmDescription = computed(() => {
  const label = ingredientToDelete.value?.label
  return label
    ? `« ${label} » sera supprimé après un court délai, le temps d'annuler si besoin.`
    : undefined
})

const DELETE_GRACE_PERIOD_MS = 6000
/** Handles des suppressions programmées mais pas encore exécutées (délai d'annulation en cours), par id d'ingrédient. */
const pendingDeleteTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const performDelete = async (id: string, label: string) => {
  try {
    await deleteDoc(doc(db, 'ingredients', id))
  } catch (error: any) {
    console.error('Erreur lors de la suppression:', error)
    // La suppression a échoué : on réaffiche la carte, masquée depuis le clic sur « Supprimer ».
    pendingDeleteIds.value.delete(id)
    toast.add({
      title: 'Erreur',
      description: `« ${label} » n'a pas pu être supprimé : ${error.message || 'une erreur est survenue'}.`,
      color: 'error'
    })
    return
  }
  pendingDeleteIds.value.delete(id)
}

const confirmDeleteIngredient = () => {
  const ingredient = ingredientToDelete.value
  if (!ingredient) return

  deleteDialogOpen.value = false
  ingredientToDelete.value = null

  // Le slideover afficherait sinon un ingrédient en cours de suppression.
  if (selectedIngredient.value?.id === ingredient.id) {
    slideoverOpen.value = false
    selectedIngredient.value = null
  }

  const { id, label } = ingredient
  pendingDeleteIds.value.add(id)

  const timeout = setTimeout(() => {
    pendingDeleteTimeouts.delete(id)
    performDelete(id, label)
  }, DELETE_GRACE_PERIOD_MS)
  pendingDeleteTimeouts.set(id, timeout)

  toast.add({
    title: 'Ingrédient supprimé',
    description: `« ${label} » sera définitivement supprimé.`,
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
        toast.add({ title: 'Suppression annulée', description: `« ${label} » a été conservé`, color: 'success' })
      }
    }]
  })
}

</script>

<template>
  <UDashboardPanel id="ingredients">
    <template #header>
      <UDashboardNavbar title="Ingrédients">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="primary" @click="openCreateForm">
            <UIcon name="i-lucide-plus" class="size-5 shrink-0" />
            Ajouter un ingrédient
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 p-4 sm:p-6">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-medium text-highlighted">
              {{ ingredientListHeaderLabel }}
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
              placeholder="Rechercher un ingrédient..."
              class="w-full"
            />
            <USelectMenu
              v-model="selectedCategoryIds"
              :items="categoryOptions"
              value-key="id"
              multiple
              placeholder="Toutes les catégories"
              :search-input="{ placeholder: 'Rechercher une catégorie...' }"
              icon="i-lucide-shapes"
              class="w-full sm:w-56 shrink-0"
            />
            <USelectMenu
              v-model="selectedVisibility"
              :items="visibilityOptions"
              value-key="value"
              :search-input="false"
              icon="i-lucide-eye"
              class="w-full sm:w-40 shrink-0"
            />
            <div class="flex items-center gap-1.5 border-t border-default pt-3 sm:border-t-0 sm:border-l sm:pl-3 sm:pt-0 sm:shrink-0">
              <UTooltip text="Filtrer les ingrédients de saison" class="flex-1 sm:flex-none">
                <UButton
                  :color="seasonOnly ? 'primary' : 'neutral'"
                  :variant="seasonOnly ? 'solid' : 'outline'"
                  icon="i-lucide-leaf"
                  aria-label="Filtrer les ingrédients de saison"
                  :aria-pressed="seasonOnly"
                  class="w-full sm:w-auto justify-center"
                  @click="seasonOnly = !seasonOnly"
                />
              </UTooltip>
              <UTooltip text="Filtrer les ingrédients avec unités" class="flex-1 sm:flex-none">
                <UButton
                  :color="unitsOnly ? 'primary' : 'neutral'"
                  :variant="unitsOnly ? 'solid' : 'outline'"
                  icon="i-lucide-git-branch"
                  aria-label="Filtrer les ingrédients avec unités"
                  :aria-pressed="unitsOnly"
                  class="w-full sm:w-auto justify-center"
                  @click="unitsOnly = !unitsOnly"
                />
              </UTooltip>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <template v-if="ingredientsLoading">
          <div
            v-for="i in 12"
            :key="`skeleton-${i}`"
            class="rounded-xl border border-default bg-default p-4 flex flex-col gap-2"
          >
            <div class="flex items-start justify-between gap-2">
              <USkeleton class="h-5 w-2/3" />
              <USkeleton class="size-5 rounded-full shrink-0" />
            </div>
            <div class="flex items-center justify-between gap-2">
              <USkeleton class="h-4 w-20" />
              <USkeleton class="h-4 w-10" />
            </div>
            <div class="flex flex-col gap-1 mt-1">
              <USkeleton class="h-1.5 w-full rounded-full" />
              <USkeleton class="h-1.5 w-full rounded-full" />
              <USkeleton class="h-1.5 w-full rounded-full" />
            </div>
          </div>
        </template>
        <UEmpty
          v-else-if="ingredients.length === 0"
          class="col-span-full py-12"
          icon="i-lucide-carrot"
          title="Aucun ingrédient"
          description="Ajoutez votre premier ingrédient pour le retrouver ici."
          :actions="[{ label: 'Ajouter un ingrédient', icon: 'i-lucide-plus', onClick: openCreateForm }]"
        />
        <UEmpty
          v-else-if="filteredIngredients.length === 0"
          class="col-span-full py-12"
          icon="i-lucide-search-x"
          title="Aucun ingrédient trouvé"
          description="Essayez un autre terme de recherche ou ajoutez un nouvel ingrédient."
        />
        <template v-else>
          <IngredientCard
            v-for="ingredient in displayedIngredients"
            :key="ingredient.id"
            :ingredient="ingredient"
            :owned-by-user="isOwnedByUser(ingredient)"
            @select="selectIngredient(ingredient)"
            @edit="openEditForm(ingredient)"
            @delete="askDeleteIngredient(ingredient)"
          />
        </template>
        </div>
        <div v-if="hasMoreIngredients" class="flex justify-center pt-2">
          <UButton
            label="Afficher plus"
            color="neutral"
            variant="outline"
            @click="showMoreIngredients"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <IngredientDetailSlideover
    v-model:open="slideoverOpen"
    :ingredient="selectedIngredient"
    :editable="!!selectedIngredient && isOwnedByUser(selectedIngredient)"
    @edit="openEditFromDetail"
  />

  <IngredientFormSlideover v-model:open="formSlideoverOpen" :ingredient="formIngredient" :recipes="recipes" />

  <ConfirmDialog
    v-model:open="deleteDialogOpen"
    title="Supprimer cet ingrédient ?"
    :description="deleteConfirmDescription"
    confirm-label="Supprimer"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    @confirm="confirmDeleteIngredient"
  />
</template>
