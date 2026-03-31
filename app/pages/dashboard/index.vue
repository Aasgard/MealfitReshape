<script setup lang="ts">
import type { IngredientCategory } from '~/types/ingredientCategory'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { addDoc, collection, Timestamp } from 'firebase/firestore'
import fakeRecipe from '~/data/fakeRecipe.json'

useSeoMeta({
  title: 'Dashboard - Accueil - Mealfit',
  description: 'Dashboard - Accueil - Mealfit',
})

const selectedCategory = ref<IngredientCategory | undefined>(undefined)

const categoriesStore = useIngredientCategoriesStore()

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const seedingRecipe = ref(false)

async function seedFakeRecipe() {
  if (!user.value) {
    toast.add({
      title: 'Connexion requise',
      description: 'Connectez-vous pour ajouter une recette.',
      color: 'warning',
    })
    return
  }
  seedingRecipe.value = true
  try {
    const { id: _omitId, createdAt, updatedAt, ...rest } = fakeRecipe
    await addDoc(collection(db, 'recipes'), {
      ...rest,
      owner: user.value.uid,
      createdAt: Timestamp.fromDate(new Date(createdAt)),
      updatedAt: Timestamp.fromDate(new Date(updatedAt)),
    })
    toast.add({
      title: 'Recette ajoutée',
      description: `« ${fakeRecipe.title} » a été enregistrée dans Firestore.`,
      color: 'success',
    })
  }
  catch (e) {
    console.error(e)
    toast.add({
      title: 'Erreur',
      description: 'Impossible d’ajouter la recette de test.',
      color: 'error',
    })
  }
  finally {
    seedingRecipe.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Accueil">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="neutral" variant="ghost" square @click="null">
            <UChip color="error" inset>
              <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
            </UChip>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 flex flex-col gap-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-2xl font-bold">Catégories d'ingrédients</h1>
          <UButton
            icon="i-lucide-flask-conical"
            color="primary"
            variant="soft"
            :loading="seedingRecipe"
            @click="seedFakeRecipe"
          >
            Tester : ajouter la recette démo
          </UButton>
        </div>
        
        <div class="max-w-xs">
          <UFormField label="Choisir une catégorie" size="lg">
            <USelectMenu
              v-model="selectedCategory"
              :items="categoriesStore.categories"
              placeholder="Sélectionnez une catégorie"
              class="w-full"
              :icon="selectedCategory?.icon ? `i-lucide-${selectedCategory.icon}` : 'i-lucide-list'"
            >
              <template #item-leading="{ item }">
                <UIcon :name="`i-lucide-${item.icon}`" class="size-4" />
              </template>
            </USelectMenu>
          </UFormField>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
