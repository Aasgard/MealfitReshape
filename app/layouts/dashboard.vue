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
  }, {
    label: 'Minuteurs',
    icon: 'i-lucide-timer',
    to: '/dashboard/minuteurs',
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

// Tiroir mobile (sous lg) : les entrées sans groupe en lignes, chaque groupe en grille de tuiles à 3 colonnes.
const TILE_COLUMNS = 3
const mobileTopLinks = links.filter(item => !('children' in item))
const mobileGroups = links.filter(item => 'children' in item).map(group => ({
  label: group.label,
  children: group.children,
  // Cases vides qui complètent la dernière rangée : la grille garde ses filets et des tuiles de même largeur.
  fillers: (TILE_COLUMNS - (group.children.length % TILE_COLUMNS)) % TILE_COLUMNS,
}))

const route = useRoute()
/** L'accueil n'est actif que sur sa propre page ; les autres entrées le restent sur leurs sous-pages (ex. une séance). */
function isActive(to: string) {
  return to === '/dashboard' ? route.path === to : route.path === to || route.path.startsWith(`${to}/`)
}
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
          class="max-lg:hidden"
        />

        <!-- Sous lg (tiroir) : tout tient sur un écran, chaque destination est une grande cible. -->
        <nav aria-label="Navigation principale" class="flex flex-col gap-4 lg:hidden">
          <NuxtLink
            v-for="item in mobileTopLinks"
            :key="item.to"
            :to="item.to"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            class="flex min-h-12 items-center gap-3 rounded-xl border border-default px-4 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="isActive(item.to) ? 'bg-primary/10 text-primary' : 'bg-default text-highlighted active:bg-elevated'"
          >
            <UIcon :name="item.icon" class="size-5 shrink-0" :class="!isActive(item.to) && 'text-muted'" aria-hidden="true" />
            {{ item.label }}
          </NuxtLink>

          <section v-for="group in mobileGroups" :key="group.label" class="flex flex-col gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              {{ group.label }}
            </h2>
            <ul class="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-default bg-border">
              <li v-for="child in group.children" :key="child.to" class="flex">
                <NuxtLink
                  :to="child.to"
                  :aria-current="isActive(child.to) ? 'page' : undefined"
                  class="flex min-h-16 flex-1 flex-col items-center justify-center gap-1.5 px-1 py-2.5 text-center text-xs leading-tight font-medium text-balance transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :class="isActive(child.to) ? 'bg-[color-mix(in_oklab,var(--ui-primary)_10%,var(--ui-bg))] text-primary' : 'bg-default text-default active:bg-elevated'"
                >
                  <UIcon :name="child.icon" class="size-5 shrink-0" :class="!isActive(child.to) && 'text-muted'" aria-hidden="true" />
                  {{ child.label }}
                </NuxtLink>
              </li>
              <li v-for="n in group.fillers" :key="`vide-${n}`" class="bg-default" aria-hidden="true" />
            </ul>
          </section>
        </nav>

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

    <KitchenTimerDock />
  </UDashboardGroup>
</template>
