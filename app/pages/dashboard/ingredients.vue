<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, addDoc, doc, Timestamp } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'

useSeoMeta({
  title: 'Dashboard - Ingrédients - Mealfit',
  description: 'Dashboard - Ingrédients - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()

/** Génère une URL Picsum différente selon la clé (évite la même image partout) */
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

const { formatDate } = useDateFormat()

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
        <UBlogPost
          v-for="ingredient in ingredients"
          :key="ingredient.id"
          :title="ingredient.label"
          :description="ingredient.category?.label"
          :date="formatDate(ingredient.updatedAt)"
          :badge="ingredient.isPublic ? 'Public' : 'Privé'"
          :image="ingredient.imageUrl || getPicsumImageUrl(ingredient.id)"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
