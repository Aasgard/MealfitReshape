<script setup lang="ts">
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, orderBy } from 'firebase/firestore'
import type { IngredientCategory } from '~/types/ingredientCategory'

const db = useFirestore()

const categories = useCollection<IngredientCategory>(
  () => query(
    collection(db, 'ingredientCategories'),
    orderBy('order', 'asc')
  ), 
  { once: true }
)

const selectedCategory = ref<any>(undefined)
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
        <h1 class="text-2xl font-bold">Catégories d'ingrédients</h1>
        
        <div class="max-w-xs">
          <USelectMenu
            v-model="selectedCategory"
            :items="categories"
            placeholder="Choisir une catégorie..."
            :icon="selectedCategory?.icon ? `i-lucide-${selectedCategory.icon}` : 'i-lucide-list'"
          >
            <template #item-leading="{ item }">
              <UIcon :name="`i-lucide-${item.icon}`" class="size-4" />
            </template>
          </USelectMenu>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
