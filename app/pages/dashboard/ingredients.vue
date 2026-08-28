<script setup lang="ts">
import { watch } from 'vue'
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, deleteDoc, doc, orderBy } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import { macrosForUnit } from '~/utils/ingredientNutrition'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { categoryIconName } from '~/utils/categoryIcon'
import { isIngredientInSeason } from '~/utils/ingredientSeason'

useSeoMeta({
  title: 'Dashboard - Ingrédients - Mealfit',
  description: 'Dashboard - Ingrédients - Mealfit',
})

const { formatDate } = useDateFormat()
const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()

const ingredients = useCollection<Ingredient>(() => {
  const uid = user.value?.uid
  if (!uid) return null

  return query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', uid),
      where('owner', '==', null)
    ),
    orderBy('label', 'asc')
  )
})
await ingredients.promise.value

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
    const matchesUnits = !unitsOnly.value || unitEntries(i).length > 0
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

const monthAbbreviations = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const unitEntries = (ing: Ingredient | null) => {
  if (!ing?.units) return []
  return Object.entries(ing.units).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

const slideoverOpen = ref(false)
useOverlayBackClose(slideoverOpen)
const selectedIngredient = ref<Ingredient | null>(null)

const selectedUnitRows = computed(() => {
  const ing = selectedIngredient.value
  if (!ing) return []
  return unitEntries(ing).map((v) => ({
    ...v,
    scaled: macrosForUnit(ing, v.id),
  }))
})

const selectedIngredientAllYear = computed(() => (selectedIngredient.value?.activeMonths?.length ?? 0) === 12)

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
        <template v-if="ingredients.length === 0">
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

  <USlideover
    v-model:open="slideoverOpen"
    :description="selectedIngredient ? `Modifié le ${formatDate(selectedIngredient.updatedAt)}` : undefined"
  >
    <template #title>
      <div class="flex items-center gap-2">
        <span>{{ selectedIngredient?.label }}</span>
        <UButton
          v-if="selectedIngredient && isOwnedByUser(selectedIngredient)"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Modifier ${selectedIngredient.label}`"
          @click="openEditFromDetail"
        />
      </div>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <!-- Catégorie -->
        <div v-if="selectedIngredient?.category?.label">
          <p class="text-xs text-dimmed mb-1">Catégorie</p>
          <p class="text-sm text-muted flex items-center gap-1.5">
            <UIcon v-if="categoryIconName(selectedIngredient.category.icon)" :name="categoryIconName(selectedIngredient.category.icon)!" class="size-3.5 shrink-0" />
            {{ selectedIngredient.category.label }}
          </p>
        </div>

        <!-- Densité -->
        <div v-if="selectedIngredient?.density != null">
          <p class="text-xs text-dimmed mb-1">Densité</p>
          <p class="text-sm text-muted">{{ selectedIngredient.density }} g/ml</p>
        </div>

        <!-- Valeurs nutritionnelles -->
        <div v-if="selectedIngredient?.valuesBy100">
          <p class="text-xs text-dimmed mb-2">Pour 100 g</p>
          <IngredientMacroSummary :macros="selectedIngredient.valuesBy100" />
        </div>

        <!-- Disponibilité par mois -->
        <div>
          <p class="text-xs text-dimmed mb-2">Disponibilité</p>
          <p v-if="selectedIngredientAllYear" class="text-sm text-muted">
            Toute l'année
          </p>
          <div
            v-else
            class="grid grid-cols-12 gap-1"
            role="group"
            :aria-label="`Disponibilité : ${selectedIngredient?.activeMonths?.length ?? 0} mois sur 12`"
          >
            <div
              v-for="(label, idx) in monthAbbreviations"
              :key="idx"
              role="img"
              :aria-label="`${monthNames[idx]} — ${selectedIngredient?.activeMonths?.includes(idx + 1) ? 'en saison' : 'hors saison'}`"
              :title="monthNames[idx]"
              class="flex items-center justify-center rounded text-xs font-medium h-6 transition-colors"
              :class="selectedIngredient?.activeMonths?.includes(idx + 1)
                ? 'bg-primary text-white'
                : 'bg-accented text-dimmed'"
            >
              {{ label }}
            </div>
          </div>
        </div>

        <!-- Unités / équivalents -->
        <div v-if="selectedIngredient && unitEntries(selectedIngredient).length">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-git-branch" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Unités</p>
          </div>
          <p class="text-xs text-dimmed mb-3">
            Autres portions équivalentes.
          </p>
          <ul class="flex flex-col gap-3">
            <li
              v-for="v in selectedUnitRows"
              :key="v.id"
              class="rounded-lg border border-default bg-elevated/30 overflow-hidden"
            >
              <div class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-default/60">
                <span class="text-sm font-medium text-highlighted truncate">{{ v.label }}</span>
                <span class="text-sm tabular-nums text-muted shrink-0">
                  {{ v.value }}&nbsp;{{ v.unit }}
                </span>
              </div>
              <div
                v-if="v.scaled"
                class="p-3"
              >
                <p class="text-xs text-dimmed mb-2">
                  Pour {{ v.value }}&nbsp;{{ v.unit }}
                </p>
                <IngredientMacroSummary :macros="v.scaled" />
              </div>
              <div
                v-else
                class="px-3 py-2 text-xs text-dimmed"
              >
                Ajoutez les valeurs nutritionnelles et, si cette unité est en ml, la densité de l’ingrédient pour afficher l’équivalent.
              </div>
            </li>
          </ul>
        </div>

        <!-- Commentaire -->
        <div v-if="selectedIngredient?.comment">
          <p class="text-xs text-dimmed mb-1">Commentaire</p>
          <p class="text-sm text-muted">{{ selectedIngredient.comment }}</p>
        </div>
      </div>
    </template>
  </USlideover>

  <IngredientFormSlideover v-model:open="formSlideoverOpen" :ingredient="formIngredient" />

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
