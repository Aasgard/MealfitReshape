<script setup lang="ts">
import { toRaw } from 'vue'
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, addDoc, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import { macrosForVariation } from '~/utils/ingredientNutrition'

useSeoMeta({
  title: 'Dashboard - Ingrédients - Mealfit',
  description: 'Dashboard - Ingrédients - Mealfit',
})

const { formatDate } = useDateFormat()
const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()

const { generate: generateFirestoreId } = useFirestoreId()


const ingredients = useCollection<Ingredient>(
  () => query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', user.value!.uid),
      where('owner', '==', null)
    ),
    orderBy('label', 'asc')
  )
)
await ingredients.promise.value

console.log(ingredients.value)

const searchQuery = ref('')

const filteredIngredients = computed(() => {
  const list = [...(ingredients.value ?? [])]
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(i => i.label.toLowerCase().includes(q))
})

const ingredientListHeaderLabel = computed(() => {
  const n = filteredIngredients.value.length
  const q = searchQuery.value.trim()
  if (n === 0) return q ? 'Aucun résultat' : 'Aucun ingrédient'
  if (n === 1) return '1 Ingrédient'
  return `${n} Ingrédients`
})

const unitLabel = (unit: Ingredient['unit']) => unit ?? 'g'

const variationEntries = (ing: Ingredient | null) => {
  if (!ing?.variations) return []
  return Object.entries(ing.variations).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

const slideoverOpen = ref(false)
const selectedIngredient = ref<Ingredient | null>(null)

const selectedIngredientForDebug = computed(() => {
  const ing = selectedIngredient.value
  if (!ing) return null
  return { ...toRaw(ing), id: ing.id }
})

const selectedVariationRows = computed(() => {
  const ing = selectedIngredient.value
  if (!ing) return []
  return variationEntries(ing).map((v) => ({
    ...v,
    scaled: macrosForVariation(ing, v.id),
  }))
})

const editModalOpen = ref(false)
const editingIngredient = ref<Ingredient | null>(null)

const openEditModal = (ingredient: Ingredient) => {
  editingIngredient.value = ingredient
  editModalOpen.value = true
}

const selectIngredient = (ingredient: Ingredient) => {
  selectedIngredient.value = ingredient
  slideoverOpen.value = true
}

const deleteIngredient = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'ingredients', id))
    toast.add({
      title: 'Supprimé',
      description: 'L\'ingrédient a été supprimé',
      color: 'success'
    })
  } catch (error: any) {
    console.error('Erreur lors de la suppression:', error)
    toast.add({
      title: 'Erreur',
      description: error.message || 'Une erreur est survenue lors de la suppression',
      color: 'error'
    })
  }
}

const addRandomIngredient = async () => {
  if (!user.value) {
    toast.add({
      title: 'Erreur',
      description: 'Vous devez être connecté pour ajouter un ingrédient',
      color: 'error'
    })
    return
  }

  try {
    // Liste d'aliments aléatoires
    const randomFoods = [
      'Pomme', 'Banane', 'Orange', 'Fraise', 'Tomate', 'Carotte', 'Brocoli', 'Épinard',
      'Poulet', 'Saumon', 'Thon', 'Œuf', 'Riz', 'Pâtes', 'Pain', 'Fromage',
      'Yaourt', 'Lait', 'Avocat', 'Noix', 'Amande', 'Chocolat', 'Miel', 'Huile d\'olive'
    ]

    const randomVariations = ['Tranche', 'Slice', 'Pot', 'Bowl', 'Cup', 'Glass', 'Bottle', 'Jar', 'Bag', 'Box', 'Packet', 'Can', 'Carton', 'Bottle', 'Jar', 'Bag', 'Box', 'Packet', 'Can', 'Carton']
    
    // Sélectionner un aliment aléatoire
    const randomFood = randomFoods[Math.floor(Math.random() * randomFoods.length)]

    
    // Générer des mois actifs aléatoires (1-3 mois)
    const activeMonths: number[] = []
    const numMonths = Math.floor(Math.random() * 3) + 1
    for (let i = 0; i < numMonths; i++) {
      const month = Math.floor(Math.random() * 12) + 1
      if (!activeMonths.includes(month)) {
        activeMonths.push(month)
      }
    }

    // Créer une référence vers une catégorie par défaut (on utilise un ID fictif ou on crée une référence)
    // Pour simplifier, on crée une référence vers une catégorie "Autre"
    const categoryRef = doc(db, 'ingredientCategories', 'vegetables')

    const now = Timestamp.now()
    
    // Créer l'ingrédient
    await addDoc(collection(db, 'ingredients'), {
      label: randomFood,
      comment: `Ingrédient ajouté aléatoirement`,
      activeMonths,
      category: categoryRef,
      owner: user.value!.uid,
      createdAt: now,
      updatedAt: now,
      isPublic: false,
      unit: Math.random() > 0.5 ? 'g' : 'ml',
      valuesBy100: {
        calories: Math.floor(Math.random() * 250) + 100,
        protein: Math.floor(Math.random() * 100) + 10,
        carbohydrates: Math.floor(Math.random() * 100) + 10,
        fat: Math.floor(Math.random() * 100) + 10
      },
      variations: {
        [generateFirestoreId()]: {
          label: randomVariations[Math.floor(Math.random() * randomVariations.length)],
          value: Math.floor(Math.random() * 100) + 10
        }
      }
    })

    toast.add({
      title: 'Succès',
      description: `${randomFood} a été ajouté à vos ingrédients`,
      color: 'success'
    })
  } catch (error: any) {
    console.error('Erreur lors de l\'ajout de l\'ingrédient:', error)
    toast.add({
      title: 'Erreur',
      description: error.message || 'Une erreur est survenue lors de l\'ajout de l\'ingrédient',
      color: 'error'
    })
  }
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
          <UButton color="primary" @click="addRandomIngredient">
            <UIcon name="i-lucide-plus" class="size-5 shrink-0" />
            Ajouter un ingrédient
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 p-4 sm:p-6">
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium text-highlighted">
            {{ ingredientListHeaderLabel }}
          </p>
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            size="md"
            variant="outline"
            placeholder="Rechercher un ingrédient..."
            class="w-full"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <template v-if="ingredients.length === 0">
          <div
            v-for="i in 12"
            :key="`skeleton-${i}`"
            class="rounded-lg border border-default bg-card p-4"
          >
            <USkeleton class="h-48 w-full rounded-lg mb-4" />
            <USkeleton class="h-6 w-3/4 mb-2" />
            <USkeleton class="h-4 w-full mb-2" />
            <USkeleton class="h-4 w-2/3 mb-4" />
            <div class="flex items-center justify-between">
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-5 w-16 rounded-full" />
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
          <div
            v-for="ingredient in filteredIngredients"
            :key="ingredient.id"
            class="rounded-xl border border-default bg-default overflow-hidden flex flex-col cursor-pointer hover:border-primary/50 transition-colors"
            @click="selectIngredient(ingredient)"
          >
            <!-- Contenu de la carte -->
            <div class="p-4 flex flex-col gap-2 flex-1">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-highlighted truncate">
                    {{ ingredient.label }}
                  </p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <UBadge v-if="!ingredient.isPublic" label="Privé" variant="subtle" size="sm" />
                  <UDropdownMenu
                    v-if="!ingredient.isPublic"
                    :items="[[{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openEditModal(ingredient) }], [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => deleteIngredient(ingredient.id) }]]"
                    :ui="{ content: 'w-40' }"
                  >
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click.stop
                    />
                  </UDropdownMenu>
                </div>
              </div>
              <p v-if="ingredient.category?.label" class="text-sm text-muted">{{ ingredient.category.label }}</p>


            </div>
          </div>
        </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <USlideover
    v-model:open="slideoverOpen"
    :title="selectedIngredient?.label + ' (' + selectedIngredient?.id + ')'"
    :description="selectedIngredient ? `Modifié le ${formatDate(selectedIngredient.updatedAt)}` : undefined"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <!-- Catégorie -->
        <div v-if="selectedIngredient?.category?.label">
          <p class="text-xs text-dimmed mb-1">Catégorie</p>
          <p class="text-sm text-muted">{{ selectedIngredient.category.label }}</p>
        </div>

        <!-- Valeurs nutritionnelles -->
        <div v-if="selectedIngredient?.valuesBy100">
          <div class="flex items-baseline justify-between mb-4">
            <p class="text-xs text-dimmed">Pour 100{{ selectedIngredient.unit ?? 'g' }}</p>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-bold text-highlighted">{{ selectedIngredient.valuesBy100.calories }}</span>
              <span class="text-xs text-dimmed">kcal</span>
            </div>
          </div>
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 w-24 shrink-0">
                <UIcon name="i-lucide-wheat" class="size-3.5 text-muted shrink-0" />
                <span class="text-xs font-medium text-muted uppercase tracking-wide">Glucides</span>
              </div>
              <div class="flex-1 h-2 rounded-full bg-accented overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-500"
                  :style="{ width: `${Math.min(100, (selectedIngredient.valuesBy100.carbohydrates / 100) * 100)}%` }"
                />
              </div>
              <span class="text-sm font-semibold text-highlighted w-8 text-right">{{ selectedIngredient.valuesBy100.carbohydrates }}g</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 w-24 shrink-0">
                <UIcon name="i-lucide-dumbbell" class="size-3.5 text-muted shrink-0" />
                <span class="text-xs font-medium text-muted uppercase tracking-wide">Protéines</span>
              </div>
              <div class="flex-1 h-2 rounded-full bg-accented overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary/60 transition-all duration-500"
                  :style="{ width: `${Math.min(100, (selectedIngredient.valuesBy100.protein / 100) * 100)}%` }"
                />
              </div>
              <span class="text-sm font-semibold text-highlighted w-8 text-right">{{ selectedIngredient.valuesBy100.protein }}g</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 w-24 shrink-0">
                <UIcon name="i-lucide-droplets" class="size-3.5 text-muted shrink-0" />
                <span class="text-xs font-medium text-muted uppercase tracking-wide">Lipides</span>
              </div>
              <div class="flex-1 h-2 rounded-full bg-accented overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary/30 transition-all duration-500"
                  :style="{ width: `${Math.min(100, (selectedIngredient.valuesBy100.fat / 100) * 100)}%` }"
                />
              </div>
              <span class="text-sm font-semibold text-highlighted w-8 text-right">{{ selectedIngredient.valuesBy100.fat }}g</span>
            </div>
          </div>
        </div>

        <!-- Variations / équivalents -->
        <div v-if="selectedIngredient && variationEntries(selectedIngredient).length">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-git-branch" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Variations</p>
          </div>
          <p class="text-xs text-dimmed mb-3">
            Autres aliments équivalents pour des portions comparables ({{ unitLabel(selectedIngredient.unit) }}).
          </p>
          <ul class="flex flex-col gap-3">
            <li
              v-for="v in selectedVariationRows"
              :key="v.id"
              class="rounded-lg border border-default bg-elevated/30 overflow-hidden"
            >
              <div class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-default/60">
                <span class="text-sm font-medium text-highlighted truncate">{{ v.label }}</span>
                <span class="text-sm tabular-nums text-muted shrink-0">
                  {{ v.value }}&nbsp;{{ unitLabel(selectedIngredient!.unit) }}
                </span>
              </div>
              <div
                v-if="v.scaled"
                class="p-3"
              >
                <div class="flex items-baseline justify-between mb-3">
                  <p class="text-xs text-dimmed">
                    Pour {{ v.value }}{{ unitLabel(selectedIngredient!.unit) }}
                  </p>
                  <div class="flex items-baseline gap-1">
                    <span class="text-xl font-bold text-highlighted">{{ v.scaled.calories }}</span>
                    <span class="text-xs text-dimmed">kcal</span>
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <UIcon name="i-lucide-wheat" class="size-3.5 text-muted shrink-0" />
                      <span class="text-[10px] font-medium text-muted uppercase tracking-wide leading-tight">Glucides</span>
                    </div>
                    <span class="text-sm font-semibold text-highlighted tabular-nums shrink-0">{{ v.scaled.carbohydrates }}g</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <UIcon name="i-lucide-dumbbell" class="size-3.5 text-muted shrink-0" />
                      <span class="text-[10px] font-medium text-muted uppercase tracking-wide leading-tight">Protéines</span>
                    </div>
                    <span class="text-sm font-semibold text-highlighted tabular-nums shrink-0">{{ v.scaled.protein }}g</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <UIcon name="i-lucide-droplets" class="size-3.5 text-muted shrink-0" />
                      <span class="text-[10px] font-medium text-muted uppercase tracking-wide leading-tight">Lipides</span>
                    </div>
                    <span class="text-sm font-semibold text-highlighted tabular-nums shrink-0">{{ v.scaled.fat }}g</span>
                  </div>
                </div>
              </div>
              <div
                v-else
                class="px-3 py-2 text-xs text-dimmed"
              >
                Ajoutez des valeurs nutritionnelles sur l’ingrédient pour afficher l’équivalent pour cette variation.
              </div>
            </li>
          </ul>
        </div>

        <!-- Disponibilité par mois -->
        <div>
          <p class="text-xs text-dimmed mb-2">Disponibilité</p>
          <div class="grid grid-cols-12 gap-1">
            <div
              v-for="(label, idx) in ['J','F','M','A','M','J','J','A','S','O','N','D']"
              :key="idx"
              :title="['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][idx]"
              class="flex items-center justify-center rounded text-[10px] font-medium h-6 transition-colors"
              :class="selectedIngredient?.activeMonths?.includes(idx + 1)
                ? 'bg-primary text-white'
                : 'bg-accented text-dimmed'"
            >
              {{ label }}
            </div>
          </div>
        </div>

        <!-- Commentaire -->
        <div v-if="selectedIngredient?.comment">
          <p class="text-xs text-dimmed mb-1">Commentaire</p>
          <p class="text-sm text-muted">{{ selectedIngredient.comment }}</p>
        </div>

        <!-- Debug -->
        <UCollapsible>
          <UButton
            label="Debug"
            color="neutral"
            variant="ghost"
            size="xs"
            trailing-icon="i-lucide-chevron-down"
            class="w-full justify-between text-dimmed"
          />
          <template #content>
            <pre class="text-xs text-muted whitespace-pre-wrap break-all mt-2 p-3 rounded-lg">{{ JSON.stringify(selectedIngredientForDebug, null, 2) }}</pre>
          </template>
        </UCollapsible>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="editModalOpen" :title="`Modifier — ${editingIngredient?.label}`">
    <template #body>
      <p class="text-sm text-muted">Formulaire de modification à venir.</p>
    </template>
  </UModal>
</template>
