<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui'
import type { GroceryScenario } from '~/composables/useGroceryList'

useSeoMeta({
  title: 'Dashboard - Liste de courses - Mealfit',
  description: 'Dashboard - Liste de courses - Mealfit',
})

const list = useGroceryList()
provide(GROCERY_LIST_KEY, list)

// Maquette : plusieurs jeux de données fictives pour voir chaque état de la page.
const scenarioItems = computed<DropdownMenuItem[]>(() => [
  [{ type: 'label', label: 'Aperçu avec des données fictives' }],
  (Object.keys(GROCERY_SCENARIO_LABELS) as GroceryScenario[]).map(value => ({
    label: GROCERY_SCENARIO_LABELS[value],
    type: 'checkbox' as const,
    checked: list.scenario === value,
    onSelect: () => list.loadScenario(value),
  })),
])

const modeItems = computed<TabsItem[]>(() => [
  { label: 'Préparer', value: 'prepare', icon: 'i-lucide-list-checks' },
  {
    label: 'En magasin',
    value: 'store',
    icon: 'i-lucide-shopping-cart',
    badge: list.toBuy.length ? { label: `${list.doneCount}/${list.toBuy.length}`, color: 'neutral' as const, variant: 'subtle' as const } : undefined,
  },
])

function startShopping() {
  list.mode = 'store'
}
</script>

<template>
  <UDashboardPanel id="liste-courses">
    <template #header>
      <UDashboardNavbar title="Liste de courses">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UDropdownMenu :items="scenarioItems" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-flask-conical"
              trailing-icon="i-lucide-chevron-down"
              aria-label="Choisir un jeu de données d'exemple"
            >
              <span class="hidden sm:inline">Données d'exemple</span>
            </UButton>
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UTabs
            v-model="list.mode"
            :items="modeItems"
            :content="false"
            variant="pill"
            size="sm"
          />
        </template>
        <template #right>
          <template v-if="list.mode === 'prepare'">
            <UButton
              icon="i-lucide-clipboard-copy"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!list.toBuy.length"
              aria-label="Copier la liste pour Todoist"
              @click="list.copyForTodoist()"
            >
              <span class="hidden sm:inline">Copier pour Todoist</span>
            </UButton>
            <UButton
              icon="i-lucide-shopping-cart"
              size="sm"
              :disabled="!list.toBuy.length"
              aria-label="Faire les courses"
              @click="startShopping"
            >
              <span class="hidden sm:inline">Faire les courses</span>
            </UButton>
          </template>
          <UButton
            v-else-if="list.doneCount > 0"
            label="Vider les cochés"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="list.clearCart()"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl">
        <GroceryPrepareView v-if="list.mode === 'prepare'" />
        <GroceryStoreView v-else />
      </div>
    </template>
  </UDashboardPanel>
</template>
