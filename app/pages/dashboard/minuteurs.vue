<script setup lang="ts">
import type { KitchenTimer } from '~/composables/useKitchenTimers'

useSeoMeta({
  title: 'Dashboard - Minuteurs - Mealfit',
  description: 'Dashboard - Minuteurs - Mealfit',
})

/** Minuteurs de cuisine hors recette : les mêmes que ceux de la fiche et de la pastille, qui est masquée ici. */
const { timers, start } = useKitchenTimers()

/** Cuissons d'œufs : un toucher lance le minuteur, nommé d'après la cuisson. */
const startEgg = (egg: EggCooking) => start({ durationMs: egg.minutes * 60_000, label: eggTimerLabel(egg) })

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

          <section aria-labelledby="minuteurs-oeufs">
            <h2 id="minuteurs-oeufs" class="mb-3 text-base font-semibold text-highlighted">Œufs</h2>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <UButton
                v-for="egg in EGG_COOKINGS"
                :key="egg.label"
                color="neutral"
                variant="outline"
                size="lg"
                class="h-12 justify-between px-3"
                :aria-label="`Lancer œuf ${egg.label.toLowerCase()}, ${egg.minutes} minutes`"
                @click="startEgg(egg)"
              >
                <span class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
                  <UIcon name="i-lucide-egg" class="size-4 shrink-0 text-muted" />
                  {{ egg.label }}
                </span>
                <span class="text-base font-bold tabular-nums text-highlighted">{{ egg.minutes }}<span class="ms-0.5 text-xs font-normal text-muted">min</span></span>
              </UButton>
            </div>
            <div class="mt-3 flex flex-col gap-1 text-sm text-muted">
              <p>
                Coque, mollet, dur : œuf moyen sorti du réfrigérateur, plongé dans l'eau déjà bouillante. Lancez le
                minuteur dès qu'il est dans l'eau.
              </p>
              <p>
                Poché : œuf cassé dans un ramequin puis glissé dans l'eau frémissante, non bouillante, avec un filet de
                vinaigre. Lancez le minuteur dès qu'il est dans l'eau.
              </p>
            </div>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <KitchenTimerRecipeReturn v-if="recipeRequest" :request="recipeRequest" />
</template>
