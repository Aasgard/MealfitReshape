<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useCurrentUser } from 'vuefire'
import { collection } from 'firebase/firestore'

const appConfig = useAppConfig()

const db = useFirestore()
const recipes = useCollection(collection(db, 'recipes'))
provide('recipes', recipes)

const links = [{
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
    to: '/dashboard/recipes',
  }, {
    label: 'Menus',
    icon: 'i-lucide-calendar-days',
    to: '/dashboard/menus',
  }, {
    label: 'Stock',
    icon: 'i-lucide-archive',
    to: '/dashboard/stock',
  }, {
    label: 'Courses',
    icon: 'i-lucide-shopping-cart',
    to: '/dashboard/liste-courses',
  }, {
    label: 'Récipients',
    icon: 'i-lucide-cooking-pot',
    to: '/dashboard/recipients',
  }]
}, {
  label: 'Activité physique',
  icon: 'i-lucide-heart-pulse',
  defaultOpen: true,
  children: [{
    label: 'Séances',
    icon: 'i-lucide-dumbbell',
    to: '/dashboard/seances',
  }, {
    label: 'Programmes',
    icon: 'i-lucide-list-checks',
    to: '/dashboard/programmes',
  }, {
    label: 'Exercices',
    icon: 'i-lucide-library',
    to: '/dashboard/exercices',
  }]
}, {
  label: 'Suivi de mesures',
  icon: 'i-lucide-ruler',
  defaultOpen: true,
  children: [{
    label: 'Poids',
    icon: 'i-lucide-scale',
    to: '/dashboard/suivi-poids',
  }, {
    label: 'Mensurations',
    icon: 'i-lucide-ruler-dimension-line',
    to: '/dashboard/suivi-mensurations',
  }]
}, {
  label: 'Outils',
  icon: 'i-lucide-wrench',
  defaultOpen: true,
  children: [{
    label: 'Calculateur macros',
    icon: 'i-lucide-calculator',
    to: '/dashboard/besoins-journaliers',
  }, {
    label: 'Calculateur trail',
    icon: 'i-lucide-sport-shoe',
    to: '/dashboard/calculateur-allure',
  }, {
    label: 'Scanner produit',
    icon: 'i-lucide-scan-barcode',
    to: '/dashboard/scanner-produit',
  }]
}] satisfies NavigationMenuItem[]

// Placeholders du template Nuxt UI (pointent vers le repo du template, pas vers de vraies pages) : désactivés en attendant de vrais liens.
// const footerLinks = [{
//   label: 'Feedback',
//   icon: 'i-lucide-message-circle',
//   to: 'https://github.com/nuxt-ui-templates/dashboard',
//   target: '_blank'
// }, {
//   label: 'Help & Support',
//   icon: 'i-lucide-info',
//   to: 'https://github.com/nuxt-ui-templates/dashboard',
//   target: '_blank'
// }] satisfies NavigationMenuItem[]

/** Titres de groupe (entrées avec sous-menu) en gras ; leurs sous-entrées gardent la graisse normale. */
const navItems = links.map(item => ('children' in item ? { ...item, ui: { linkLabel: 'font-semibold' } } : item))
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
          :items="navItems"
          orientation="vertical"
          tooltip
          popover
          :ui="{ link: 'max-lg:text-[15px]' }"
        />

        <!-- <UNavigationMenu
          :collapsed="collapsed"
          :items="footerLinks"
          orientation="vertical"
          tooltip
          class="mt-auto"
        /> -->
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

  </UDashboardGroup>
</template>
