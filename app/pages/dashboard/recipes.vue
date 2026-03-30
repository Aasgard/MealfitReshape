<script setup lang="ts">
import fakeRecipe from '~/data/fakeRecipe.json'

useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

const { formatDate } = useDateFormat()

const recipeTypeLabels: Record<string, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
}

const recipe = fakeRecipe

const typeLabel = computed(() => recipeTypeLabels[recipe.type] ?? recipe.type)

const totalMinutes = computed(() => recipe.prepTime + recipe.cookTime)

const createdLabel = computed(() =>
  formatDate(new Date(recipe.createdAt))
)

const updatedLabel = computed(() =>
  formatDate(new Date(recipe.updatedAt))
)
</script>

<template>
  <UDashboardPanel id="recipes">
    <template #header>
      <UDashboardNavbar title="Recettes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6 p-4 sm:p-6 max-w-3xl">
        <p class="text-sm font-medium text-highlighted">
          Recette (données de démonstration)
        </p>

        <UCard :ui="{ body: { padding: 'p-0 sm:p-0' } }">
          <div class="flex flex-col sm:flex-row gap-0 sm:gap-6">
            <div class="shrink-0 sm:w-48 aspect-video sm:aspect-square bg-muted">
              <img
                :src="recipe.imageUrl"
                :alt="recipe.title"
                class="h-full w-full object-cover rounded-t-lg sm:rounded-l-lg sm:rounded-tr-none"
              >
            </div>
            <div class="flex flex-col gap-3 p-4 sm:py-4 sm:pr-4 sm:pl-0 flex-1 min-w-0">
              <div class="flex flex-wrap items-start gap-2 justify-between">
                <h1 class="text-xl font-semibold text-highlighted">
                  {{ recipe.title }}
                </h1>
                <UIcon
                  :name="recipe.isFavorite ? 'i-lucide-star' : 'i-lucide-star-off'"
                  class="size-5 shrink-0 text-muted"
                  :class="{ 'text-amber-500': recipe.isFavorite }"
                />
              </div>
              <p class="text-sm text-muted">
                {{ recipe.description }}
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge color="neutral" variant="subtle">
                  {{ typeLabel }}
                </UBadge>
                <UBadge
                  :color="recipe.isPublic ? 'success' : 'neutral'"
                  variant="subtle"
                >
                  {{ recipe.isPublic ? 'Publique' : 'Privée' }}
                </UBadge>
              </div>
              <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <dt class="text-muted">
                    Préparation
                  </dt>
                  <dd class="font-medium text-highlighted">
                    {{ recipe.prepTime }} min
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Cuisson
                  </dt>
                  <dd class="font-medium text-highlighted">
                    {{ recipe.cookTime }} min
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Total
                  </dt>
                  <dd class="font-medium text-highlighted">
                    {{ totalMinutes }} min
                  </dd>
                </div>
                <div class="col-span-2 sm:col-span-1">
                  <dt class="text-muted">
                    Source
                  </dt>
                  <dd class="font-medium text-highlighted truncate" :title="recipe.source">
                    {{ recipe.source }}
                  </dd>
                </div>
              </dl>
              <p class="text-xs text-muted">
                Créée le {{ createdLabel }} · Mise à jour {{ updatedLabel }}
              </p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-base font-semibold text-highlighted">
              Ingrédients
            </h2>
          </template>
          <ul class="flex flex-col gap-2">
            <li
              v-for="(ing, index) in recipe.ingredients"
              :key="`${ing.id}-${index}`"
              class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm border-b border-default pb-2 last:border-0 last:pb-0"
            >
              <span class="font-medium text-highlighted tabular-nums">{{ ing.quantity }}×</span>
              <span class="text-muted">réf. ingrédient</span>
              <code class="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{{ ing.id }}</code>
              <span class="text-muted">· variation</span>
              <code class="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{{ ing.variation }}</code>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
