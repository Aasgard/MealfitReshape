<script setup lang="ts">
import type { KitchenTimer } from '~/composables/useKitchenTimers'

useSeoMeta({
  title: 'Dashboard - Minuteurs - Mealfit',
  description: 'Dashboard - Minuteurs - Mealfit',
})

/** Minuteurs de cuisine hors recette : les mêmes que ceux de la fiche et de la pastille, qui est masquée ici. */
const { timers } = useKitchenTimers()

const recipeRequest = ref<{ id: string, parts?: number | null, at: number } | null>(null)
function openRecipe(recipe: NonNullable<KitchenTimer['recipe']>) {
  recipeRequest.value = { id: recipe.id, parts: recipe.parts, at: Date.now() }
}
</script>

<template>
  <UDashboardPanel id="minuteurs" :ui="{ body: 'min-h-0' }">
    <template #header>
      <UDashboardNavbar title="Minuteurs">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col p-4 sm:p-6 overflow-auto">
        <div class="w-full max-w-2xl flex flex-col gap-8 text-default">
          <section aria-labelledby="minuteurs-en-cours" :class="!timers.length && 'hidden'">
            <h2 id="minuteurs-en-cours" class="mb-3 text-base font-semibold text-highlighted">
              En cours
            </h2>
            <TransitionGroup
              tag="ul"
              class="overflow-hidden rounded-lg border border-default divide-y divide-default"
              enter-active-class="motion-safe:transition motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
              enter-from-class="opacity-0 -translate-y-1"
            >
              <li v-for="timer in timers" :key="timer.id">
                <KitchenTimerRow :timer="timer" show-recipe @open-recipe="openRecipe" />
              </li>
            </TransitionGroup>
          </section>

          <section aria-labelledby="nouveau-minuteur">
            <h2 id="nouveau-minuteur" class="mb-3 text-base font-semibold text-highlighted">Nouveau minuteur</h2>
            <KitchenTimerLauncher wide />
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <KitchenTimerRecipeReturn v-if="recipeRequest" :request="recipeRequest" />
</template>
