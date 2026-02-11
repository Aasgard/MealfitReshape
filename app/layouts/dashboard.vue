<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { collection } from 'firebase/firestore'

const appConfig = useAppConfig()

const db = useFirestore()
const recipes = useCollection(collection(db, 'recipes'))
provide('recipes', recipes)

const links = [[{
  label: 'Accueil',
  icon: 'i-lucide-house',
  to: '/dashboard',
}, {
  label: 'Alimentation',
  icon: 'i-lucide-utensils',
  defaultOpen: true,
  children: [{
    label: 'Ingrédients',
    icon: 'i-lucide-carrot',
    to: '/dashboard/ingredients',
  }, {
    label: 'Recettes',
    icon: 'i-lucide-book-open',
  }, {
    label: 'Menus de la semaine',
    icon: 'i-lucide-calendar-days',
  }, {
    label: 'Liste de courses',
    icon: 'i-lucide-shopping-cart',
  }]
}, {
  label: 'Activité physique',
  icon: 'i-lucide-heart',
}, {
  label: 'Outils',
  icon: 'i-lucide-wrench',
  children: [{
    label: 'Calculateur de besoins journaliers',
    icon: 'i-lucide-calculator',
  }]
}], [{
  label: 'Feedback',
  icon: 'i-lucide-message-circle',
  to: 'https://github.com/nuxt-ui-templates/dashboard',
  target: '_blank'
}, {
  label: 'Help & Support',
  icon: 'i-lucide-info',
  to: 'https://github.com/nuxt-ui-templates/dashboard',
  target: '_blank'
}]] satisfies NavigationMenuItem[][]
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      id="default"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <UAvatar :src="appConfig.app.logoPath" v-if="collapsed" />
        <div class="flex items-center gap-3" v-else>
          <UAvatar :src="appConfig.app.logoPath" />
          <span class="text-highlighted font-semibold">{{ appConfig.app.name }}</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

  </UDashboardGroup>
</template>
