<script setup lang="ts">
import type { IngredientCategory } from '~/types/ingredientCategory'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'



const selectedCategory = ref<IngredientCategory | undefined>(undefined)

const categoriesStore = useIngredientCategoriesStore()
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
