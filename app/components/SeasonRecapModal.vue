<script setup lang="ts">
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Ingredient } from '~/types/ingredient'
import { seasonChanges } from '~/utils/ingredientSeason'

/**
 * Récapitulatif de saison, monté une fois dans le layout du dashboard : fruits et légumes qui arrivent ce mois-ci,
 * ceux qui s'en vont, et les recettes redevenues de saison. Ouvert d'office à la première visite du mois s'il y a
 * quelque chose à dire, ou à la demande (bouton de la page Ingrédients).
 */
const { open, isDue, markSeen } = useSeasonRecap()
useOverlayBackClose(open)

const { ingredients, recipes, ingredientsById } = useFoodCatalog()

const changes = computed(() => seasonChanges(ingredients.value, recipes.value, ingredientsById.value))
/** Légumes puis fruits, chacun sous son intitulé ; un groupe vide n'apparaît pas. */
const PRODUCE_GROUPS = [
  { id: 'vegetables', label: 'Légumes' },
  { id: 'fruits', label: 'Fruits' },
]
const byProduceGroup = (list: Ingredient[]) => PRODUCE_GROUPS
  .map(group => ({ ...group, items: list.filter(ingredient => ingredient.category?.id === group.id) }))
  .filter(group => group.items.length)
const arrivingGroups = computed(() => byProduceGroup(changes.value.arriving))
const leavingGroups = computed(() => byProduceGroup(changes.value.leaving))

const hasChanges = computed(() => changes.value.arriving.length + changes.value.leaving.length > 0)

/** Au-delà, la liste des recettes se résume à « et N autres ». */
const RECIPES_SHOWN = 6
const shownRecipes = computed(() => changes.value.returningRecipes.slice(0, RECIPES_SHOWN))
const hiddenRecipeCount = computed(() => changes.value.returningRecipes.length - shownRecipes.value.length)

const monthLabel = computed(() => {
  const month = format(new Date(), 'LLLL', { locale: fr })
  return month.charAt(0).toUpperCase() + month.slice(1)
})

onMounted(async () => {
  if (!(await isDue())) return
  try {
    await Promise.all([ingredients.promise.value, recipes.promise.value])
  }
  catch (error) {
    console.error('Chargement du catalogue impossible pour le récapitulatif de saison', error)
    return
  }
  // Vu dès qu'il est montré (ou qu'il n'y a rien à montrer) : un autre appareil ne le rouvre pas.
  markSeen()
  if (hasChanges.value) open.value = true
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`${monthLabel} : la saison change`"
    description="Fruits et légumes qui arrivent sur les étals et ceux qui les quittent."
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <p v-if="!hasChanges" class="text-sm text-muted">
          Aucun fruit ni légume n'arrive ou ne s'en va ce mois-ci.
        </p>

        <section v-if="changes.arriving.length" aria-labelledby="season-arriving" class="flex flex-col gap-2.5">
          <h3 id="season-arriving" class="flex items-center gap-2 text-sm font-semibold text-highlighted">
            <span class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
              <UIcon name="i-lucide-leaf" class="size-3 text-primary" />
            </span>
            Arrivent
            <span class="font-normal tabular-nums text-dimmed">{{ changes.arriving.length }}</span>
          </h3>
          <div v-for="group in arrivingGroups" :key="group.id" class="flex flex-col gap-1.5">
            <h4 class="text-xs text-dimmed">
              {{ group.label }}
            </h4>
            <ul class="flex flex-wrap gap-1.5">
              <li
                v-for="ingredient in group.items"
                :key="ingredient.id"
                class="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-highlighted"
              >
                {{ ingredient.label }}
              </li>
            </ul>
          </div>
        </section>

        <section v-if="changes.leaving.length" aria-labelledby="season-leaving" class="flex flex-col gap-2.5">
          <h3 id="season-leaving" class="flex items-center gap-2 text-sm font-semibold text-highlighted">
            <span class="inline-flex size-5 items-center justify-center rounded-full bg-elevated" aria-hidden="true">
              <UIcon name="i-lucide-hourglass" class="size-3 text-muted" />
            </span>
            S'en vont
            <span class="font-normal tabular-nums text-dimmed">{{ changes.leaving.length }}</span>
          </h3>
          <div v-for="group in leavingGroups" :key="group.id" class="flex flex-col gap-1.5">
            <h4 class="text-xs text-dimmed">
              {{ group.label }}
            </h4>
            <ul class="flex flex-wrap gap-1.5">
              <li
                v-for="ingredient in group.items"
                :key="ingredient.id"
                class="rounded-full px-2.5 py-1 text-sm text-muted ring ring-inset ring-default"
              >
                {{ ingredient.label }}
              </li>
            </ul>
          </div>
          <p class="text-xs text-dimmed">
            Dernières occasions d'en profiter avant l'an prochain.
          </p>
        </section>

        <section
          v-if="changes.returningRecipes.length"
          aria-labelledby="season-recipes"
          class="flex flex-col gap-2.5 border-t border-default pt-5"
        >
          <h3 id="season-recipes" class="flex items-center gap-2 text-sm font-semibold text-highlighted">
            <UIcon name="i-lucide-book-open" class="size-4 text-muted" aria-hidden="true" />
            De retour au menu
            <span class="font-normal tabular-nums text-dimmed">{{ changes.returningRecipes.length }}</span>
          </h3>
          <ul class="flex flex-col divide-y divide-default">
            <li v-for="recipe in shownRecipes" :key="recipe.id" class="truncate py-1.5 text-sm text-default">
              {{ recipe.title }}
            </li>
          </ul>
          <p v-if="hiddenRecipeCount > 0" class="text-xs text-dimmed">
            Et {{ hiddenRecipeCount }} {{ hiddenRecipeCount > 1 ? 'autres' : 'autre' }}.
          </p>
        </section>
      </div>
    </template>

    <template #footer>
      <UButton label="Compris" @click="open = false" />
    </template>
  </UModal>
</template>
