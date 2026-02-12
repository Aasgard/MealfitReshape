<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'

const db = useFirestore()
const user = useCurrentUser()

const ingredients = useCollection<Ingredient>(
  () => query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', user.value!.uid),
      where('owner', '==', null)
    )
  )
)
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
      <UEmpty v-if="ingredients.length === 0" icon="i-lucide-carrot" title="Aucun ingrédient"
        description="Vous n'avez pas encore ajouté d'ingrédient. Ajoutez-en un pour commencer." />
      <UList>
        <UCard v-for="ingredient in ingredients" :key="ingredient.id">
          <template #header>{{ ingredient.label }} - {{ ingredient.owner }}</template>
        </UCard>
      </UList>
    </template>
  </UDashboardPanel>
</template>
