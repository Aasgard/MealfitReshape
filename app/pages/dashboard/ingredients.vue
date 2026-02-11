<script setup lang="ts">
import { collection } from 'firebase/firestore'
import { useCollection, useFirestore } from 'vuefire'
import type { Ingredient } from '~/types/ingredient'

const ingredientsRef = collection(useFirestore(), 'ingredients')
const ingredients = useCollection<Ingredient>(ingredientsRef)
</script>

<template>
  <UDashboardPanel id="ingredients">
    <template #header>
      <UDashboardNavbar title="Ingrédients">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="primary" @click="() => console.log('add ingredient')">
            <UIcon name="i-lucide-plus" class="size-5 shrink-0" />
            Ajouter un ingrédient
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="ingredients.length === 0"
        icon="i-lucide-carrot"
        title="Aucun ingrédient"
        description="Vous n'avez pas encore ajouté d'ingrédient. Ajoutez-en un pour commencer."
      />
      <pre v-else>{{ ingredients }}</pre>
    </template>
  </UDashboardPanel>
</template>
