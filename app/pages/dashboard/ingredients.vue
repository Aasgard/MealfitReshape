<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, addDoc, deleteDoc, doc, Timestamp, collectionGroup } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'

useSeoMeta({
  title: 'Dashboard - Ingrédients - Mealfit',
  description: 'Dashboard - Ingrédients - Mealfit',
})

const db = useFirestore()
const { formatDate } = useDateFormat()
const user = useCurrentUser()
const toast = useToast()

const ingredients = useCollection<Ingredient>(
  () => query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', user.value!.uid),
      where('owner', '==', null)
    )
  )
)
await ingredients.promise.value

const slideoverOpen = ref(false)
const selectedIngredient = ref<Ingredient | null>(null)

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
    // activeMonths.sort((a, b) => a - b)

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
      owner: null,
      createdAt: now,
      updatedAt: now,
      isPublic: true,
      unit: Math.random() > 0.5 ? 'g' : 'ml',
      valuesBy100: {
        calories: Math.floor(Math.random() * 100) + 100,
        protein: Math.floor(Math.random() * 10) + 10,
        carbohydrates: Math.floor(Math.random() * 10) + 10,
        fat: Math.floor(Math.random() * 10) + 10
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
        <div
          v-for="ingredient in ingredients"
          :key="ingredient.id"
          class="rounded-xl border border-default bg-default overflow-hidden flex flex-col cursor-pointer hover:border-primary/50 transition-colors"
          @click="selectIngredient(ingredient)"
        >
          <!-- Contenu de la carte -->
          <div class="p-4 flex flex-col gap-2 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="font-semibold text-highlighted truncate">{{ ingredient.label }}</p>
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

            <!-- Disponibilité par mois -->
            <div class="mt-1">
              <p class="text-xs text-dimmed mb-1.5">Disponibilité</p>
              <div class="grid grid-cols-12 gap-0.5">
                <div
                  v-for="(label, idx) in ['J','F','M','A','M','J','J','A','S','O','N','D']"
                  :key="idx"
                  :title="['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][idx]"
                  class="flex items-center justify-center rounded text-[10px] font-medium h-5 transition-colors"
                  :class="ingredient.activeMonths?.includes(idx + 1)
                    ? 'bg-primary text-white'
                    : 'bg-accented text-dimmed'"
                >
                  {{ label }}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <USlideover
    v-model:open="slideoverOpen"
    :title="selectedIngredient?.label"
    :description="selectedIngredient ? `Modifié le ${formatDate(selectedIngredient.updatedAt)}` : undefined"
  >
    <template #body>
      <pre class="text-xs text-muted whitespace-pre-wrap break-all">{{ JSON.stringify(selectedIngredient, null, 2) }}</pre>
    </template>
  </USlideover>

  <UModal v-model:open="editModalOpen" :title="`Modifier — ${editingIngredient?.label}`">
    <template #body>
      <p class="text-sm text-muted">Formulaire de modification à venir.</p>
    </template>
  </UModal>
</template>
