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
import { matchesSearch } from '~/utils/search'
import { sortList, type SortState } from '~/utils/listSort'
import { DEFAULT_INGREDIENT_SORT, INGREDIENT_MENU_SORT_OPTIONS, ingredientSortValue, type IngredientSortKey } from '~/utils/ingredientSort'

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
  { value: 'all', label: 'Tous', icon: 'i-lucide-eye' },
  { value: 'private', label: 'Privés', icon: 'i-lucide-lock' },
  { value: 'public', label: 'Publics', icon: 'i-lucide-globe' },
]
const selectedVisibility = ref<'all' | 'private' | 'public'>('all')
const selectedVisibilityOption = computed(() =>
  visibilityOptions.find(o => o.value === selectedVisibility.value) ?? visibilityOptions[0]!
)
const seasonOnly = ref(false)
const unitsOnly = ref(false)

/** Un ingrédient sans `owner` appartient au catalogue public : il n'est ni privé, ni modifiable. */
const isOwnedByUser = (ingredient: Ingredient) =>
  !!ingredient.owner && ingredient.owner === user.value?.uid

/** Ingrédients masqués immédiatement pendant le délai d'annulation d'une suppression (voir confirmDeleteIngredient). */
const pendingDeleteIds = ref(new Set<string>())

const filteredIngredients = computed(() => {
  const list = [...(ingredients.value ?? [])].filter(i => !pendingDeleteIds.value.has(i.id))
  return list.filter((i) => {
    const matchesQuery = matchesSearch(i.label, searchQuery.value)
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

const viewMode = useViewMode('ingredients')


/** Tri commun aux deux vues (non mémorisé) : en-têtes de colonnes en vue liste desktop, champ « Trier par » ailleurs. */
const sort = ref<SortState<IngredientSortKey>>({ ...DEFAULT_INGREDIENT_SORT })

/**
 * Critères du champ « Trier par » (les mêmes dans les deux vues). Un tri posé depuis un en-tête absent du menu
 * (poids d'une pièce, en vue liste desktop) repasse au tri par nom en revenant aux cartes, pour que le menu affiche un critère connu.
 */
const sortOptions = INGREDIENT_MENU_SORT_OPTIONS
watch(viewMode, () => {
  if (!sortOptions.some(o => o.key === sort.value.key)) sort.value = { ...DEFAULT_INGREDIENT_SORT }
})
const sortedIngredients = computed(() =>
  sortList(filteredIngredients.value, i => ingredientSortValue(i, sort.value.key), sort.value.direction, i => i.label)
)

/**
 * Le catalogue (public + privé) n'a pas de limite côté requête Firestore : les filtres
 * (recherche, catégorie...) doivent porter sur l'ensemble des résultats déjà chargés.
 * On limite donc le nombre d'éléments montés dans le DOM plutôt que la requête elle-même,
 * par pages plus longues en vue liste où les lignes sont denses.
 * Changer de vue garde le nombre d'éléments déjà affichés : on ne monte pas d'un coup toute une page de plus.
 */
const pageSize = computed(() => viewMode.value === 'list' ? 50 : 24)
const visibleCount = ref(pageSize.value)
const displayedIngredients = computed(() => sortedIngredients.value.slice(0, visibleCount.value))
const hasMoreIngredients = computed(() => sortedIngredients.value.length > visibleCount.value)

watch([searchQuery, selectedCategoryIds, selectedVisibility, seasonOnly, unitsOnly], () => {
  visibleCount.value = pageSize.value
})

const showMoreIngredients = () => {
  visibleCount.value += pageSize.value
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
  <UDashboardPanel id="ingredients" :ui="{ body: 'p-0 sm:p-0 gap-0 sm:gap-0 lg:overflow-hidden' }">
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
      <!-- À partir de lg, la barre de filtres reste fixe et seule la zone de liste défile ; les deux réservent la même gouttière
           de barre de défilement pour garder le même alignement gauche/droite en vue cartes et en vue liste. -->
      <div class="flex flex-col lg:flex-1 lg:min-h-0">
        <div class="flex flex-col gap-3 shrink-0 px-4 sm:px-6 pt-4 pb-4 lg:overflow-y-hidden lg:[scrollbar-gutter:stable]">
          <div class="flex flex-col sm:flex-row gap-3">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              size="md"
              variant="outline"
              placeholder="Rechercher un ingrédient..."
              class="w-full"
            />
            <!--
              En mobile : une ligne visibilité / saison / unités, puis les catégories en dessous (order-last).
              À partir de sm, `contents` rend tous ces champs à la ligne de filtres, dans l'ordre du code.
            -->
            <div class="flex flex-col gap-3 sm:contents">
              <USelectMenu
                v-model="selectedCategoryIds"
                :items="categoryOptions"
                value-key="id"
                multiple
                placeholder="Toutes les catégories"
                :search-input="{ placeholder: 'Rechercher une catégorie...' }"
                icon="i-lucide-shapes"
                class="order-last w-full sm:order-none sm:w-56 sm:shrink-0"
              />
              <div class="flex items-center gap-3 sm:contents">
                <!-- Icône seule : elle change avec le choix et passe en indigo quand un filtre est actif ; le libellé est dans l'infobulle. -->
                <UTooltip :text="`Visibilité : ${selectedVisibilityOption.label}`">
                  <USelectMenu
                    v-model="selectedVisibility"
                    :items="visibilityOptions"
                    value-key="value"
                    :search-input="false"
                    :icon="selectedVisibilityOption.icon"
                    class="w-auto shrink-0"
                    :ui="{
                      leadingIcon: selectedVisibility === 'all' ? undefined : 'text-primary',
                      content: 'min-w-36',
                    }"
                  >
                    <!-- Sans libellé visible, ce bloc vide (h-5) garde la hauteur de ligne des autres champs. -->
                    <span class="block h-5 w-0" aria-hidden="true" />
                    <span class="sr-only">Visibilité : {{ selectedVisibilityOption.label }}</span>
                  </USelectMenu>
                </UTooltip>
                <div class="flex flex-1 items-center gap-1.5 border-l border-default pl-3 sm:flex-none sm:shrink-0">
                  <UTooltip text="Filtrer les ingrédients de saison" class="flex-1 sm:flex-none">
                    <UButton
                      :color="seasonOnly ? 'primary' : 'neutral'"
                      :variant="seasonOnly ? 'solid' : 'outline'"
                      icon="i-lucide-leaf"
                      aria-label="Filtrer les ingrédients de saison"
                      :aria-pressed="seasonOnly"
                      class="w-full justify-center sm:w-auto"
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
                      class="w-full justify-center sm:w-auto"
                      @click="unitsOnly = !unitsOnly"
                    />
                  </UTooltip>
                </div>
              </div>
            </div>
          </div>
          <!-- Sous les filtres : résultat, tri et choix de la vue, toujours sur une seule ligne (contrôles condensés en mobile). -->
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="flex items-center gap-2 sm:gap-3 min-w-0">
              <p class="text-sm font-medium text-highlighted whitespace-nowrap">
                {{ ingredientListHeaderLabel }}
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
            v-if="!ingredientsLoading && ingredients.length === 0"
            class="py-12"
            icon="i-lucide-carrot"
            title="Aucun ingrédient"
            description="Ajoutez votre premier ingrédient pour le retrouver ici."
            :actions="[{ label: 'Ajouter un ingrédient', icon: 'i-lucide-plus', onClick: openCreateForm }]"
          />
          <UEmpty
            v-else-if="!ingredientsLoading && filteredIngredients.length === 0"
            class="py-12"
            icon="i-lucide-search-x"
            title="Aucun ingrédient trouvé"
            description="Essayez un autre terme de recherche ou ajoutez un nouvel ingrédient."
          />
          <IngredientList
            v-else-if="viewMode === 'list'"
            v-model:sort="sort"
            :ingredients="displayedIngredients"
            :is-owned="isOwnedByUser"
            :loading="ingredientsLoading"
            @select="selectIngredient"
            @edit="openEditForm"
            @delete="askDeleteIngredient"
          >
            <template v-if="hasMoreIngredients" #footer>
              <LoadMoreSentinel :key="visibleCount" @load="showMoreIngredients" />
            </template>
          </IngredientList>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <!-- Chargement de la suite à l'approche du bas ; en vue liste, le repère est dans la liste (slot footer). -->
          <LoadMoreSentinel v-if="hasMoreIngredients && viewMode === 'cards'" :key="visibleCount" @load="showMoreIngredients" />
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
