<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, addDoc, deleteDoc, doc, Timestamp, collectionGroup } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'

useSeoMeta({
  title: 'Dashboard - Ingrédients - Mealfit',
  description: 'Dashboard - Ingrédients - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()

const getPicsumImageUrl = (seed: string) => `https://picsum.photos/400/300?random=${seed}`

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

console.log(ingredients.value)

const { formatDate } = useDateFormat()

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
    activeMonths.sort((a, b) => a - b)

    // Créer une référence vers une catégorie par défaut (on utilise un ID fictif ou on crée une référence)
    // Pour simplifier, on crée une référence vers une catégorie "Autre"
    const categoryRef = doc(db, 'ingredientCategories', 'bS7sl5nSoubEWgWTVqMl')

    const now = Timestamp.now()
    
    // Créer l'ingrédient
    await addDoc(collection(db, 'ingredients'), {
      label: randomFood,
      comment: `Ingrédient ajouté aléatoirement`,
      activeMonths,
      category: categoryRef,
      owner: user.value.uid,
      createdAt: now,
      updatedAt: now,
      isPublic: false,
      unit: Math.random() > 0.5 ? 'g' : 'ml',
      valuesBy100: {
        calories: Math.floor(Math.random() * 100) + 100,
        protein: Math.floor(Math.random() * 10) + 10,
        carbohydrates: Math.floor(Math.random() * 10) + 10,
        fat: Math.floor(Math.random() * 10) + 10
      },
      sizes: [{
          label: 'Tranche',
          value: Math.floor(Math.random() * 10) + 1
        },
        {
          label: 'Pot',
          value: Math.floor(Math.random() * 10) + 1
        }],
      imageUrl: getPicsumImageUrl(Date.now().toString())
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
          class="rounded-xl border border-default bg-default overflow-hidden flex flex-col"
        >
          <!-- Image avec bouton supprimer -->
          <div class="relative">
            <img
              :src="ingredient.imageUrl || getPicsumImageUrl(ingredient.id)"
              :alt="ingredient.label"
              class="w-full h-48 object-cover"
            />
            <UButton
              color="error"
              variant="solid"
              size="xs"
              class="absolute top-2 right-2 opacity-80 hover:opacity-100 transition-opacity"
              icon="i-lucide-trash-2"
              @click.stop="deleteIngredient(ingredient.id)"
            />
          </div>

          <!-- Contenu de la carte -->
          <div class="p-4 flex flex-col gap-2 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="font-semibold text-highlighted truncate">{{ ingredient.label }}</p>
              <UBadge :label="ingredient.isPublic ? 'Public' : 'Privé'" variant="subtle" size="sm" class="shrink-0" />
            </div>
            <p v-if="ingredient.category?.label" class="text-sm text-muted">{{ ingredient.category.label }}</p>
            <p class="text-xs text-dimmed">{{ formatDate(ingredient.updatedAt) }}</p>

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

            <!-- Tailles -->
            <div v-if="ingredient.sizes?.length" class="mt-1 pt-2 border-t border-default">
              <p class="text-xs text-dimmed mb-1.5">Portions</p>
              <div class="flex flex-wrap gap-1">
                <UTooltip
                  v-for="size in ingredient.sizes"
                  :key="size.label"
                  :text="ingredient.valuesBy100
                    ? `${Math.round(size.value * ingredient.valuesBy100.calories / 100)} kcal`
                    : undefined"
                  :disabled="!ingredient.valuesBy100"
                >
                  <span class="inline-flex items-center gap-0.5 bg-accented rounded px-1.5 py-0.5 text-[10px] text-muted cursor-default">
                    <span>{{ size.label }}</span>
                    <span class="font-medium text-highlighted">{{ size.value }}{{ ingredient.unit ?? 'g' }}</span>
                  </span>
                </UTooltip>
              </div>
            </div>

            <!-- Valeurs nutritionnelles -->
            <div v-if="ingredient.valuesBy100" class="mt-1 pt-2 border-t border-default">
              <p class="text-xs text-dimmed mb-1.5">Pour 100{{ ingredient.unit ?? 'g' }}</p>
              <div class="grid grid-cols-4 gap-1 text-center">
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-semibold text-highlighted">{{ ingredient.valuesBy100.calories }}</span>
                  <span class="text-[10px] text-dimmed">kcal</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-semibold text-highlighted">{{ ingredient.valuesBy100.protein }}g</span>
                  <span class="text-[10px] text-dimmed">Prot.</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-semibold text-highlighted">{{ ingredient.valuesBy100.carbohydrates }}g</span>
                  <span class="text-[10px] text-dimmed">Gluc.</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-semibold text-highlighted">{{ ingredient.valuesBy100.fat }}g</span>
                  <span class="text-[10px] text-dimmed">Lip.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
