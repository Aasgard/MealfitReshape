<script setup lang="ts">
import { useCollection, useFirestore, useCurrentUser } from 'vuefire'
import { collection, or, query, where, orderBy } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import type { Recipe, RecipeIngredientLine } from '~/types/recipe'

useSeoMeta({
  title: 'Dashboard - Recettes - Mealfit',
  description: 'Dashboard - Recettes - Mealfit',
})

const { formatDate } = useDateFormat()
const db = useFirestore()
const user = useCurrentUser()

const recipeTypeLabels: Record<string, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
}

const recipes = useCollection<Recipe>(
  () => query(
    collection(db, 'recipes'),
    or(
      where('owner', '==', user.value!.uid),
      where('owner', '==', null)
    )
  )
)

const ingredients = useCollection<Ingredient>(
  () => query(
    collection(db, 'ingredients'),
    or(
      where('owner', '==', user.value!.uid),
      where('owner', '==', null)
    ),
    orderBy('label', 'asc')
  )
)

await Promise.all([recipes.promise.value, ingredients.promise.value])

const recipeList = computed(() => {
  const list = [...(recipes.value ?? [])]
  return list.sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() ?? 0
    const tb = b.updatedAt?.toMillis?.() ?? 0
    return tb - ta
  })
})

const selectedRecipeId = ref<string | undefined>(undefined)

watch(recipeList, (list) => {
  if (!list.length) {
    selectedRecipeId.value = undefined
    return
  }
  const id = selectedRecipeId.value
  if (!id || !list.some(r => r.id === id)) {
    selectedRecipeId.value = list[0]!.id
  }
}, { immediate: true })

const selectedRecipe = computed(() => {
  const id = selectedRecipeId.value
  if (!id) return null
  return recipeList.value.find(r => r.id === id) ?? null
})

/** Sans le champ `type` repas pour éviter le conflit avec SelectMenuItem.type */
const recipeSelectItems = computed(() =>
  recipeList.value.map(r => ({
    label: r.title,
    value: r.id,
  }))
)

const ingredientsById = computed(() => {
  const map = new Map<string, Ingredient>()
  for (const ing of ingredients.value ?? []) {
    map.set(ing.id, ing)
  }
  return map
})

const unitLabel = (unit: Ingredient['unit']) => unit ?? 'g'

/**
 * `quantity` = nombre de portions ; la variation indique la masse d’une portion (g ou ml).
 * Masse totale = quantity × variation.value, puis ratio sur valuesBy100 : × (masse / 100).
 * Sans variation valide, on traite `quantity` comme la masse totale déjà.
 */
function nutritionForRecipeLine(
  ing: Ingredient,
  line: RecipeIngredientLine,
  portionGrams: number | undefined,
) {
  const base = ing.valuesBy100
  if (!base) return null
  let effectiveGrams = line.quantity
  if (portionGrams != null && portionGrams > 0)
    effectiveGrams = line.quantity * portionGrams
  if (effectiveGrams <= 0) return null
  const factor = effectiveGrams / 100
  return {
    calories: Math.round(base.calories * factor),
    protein: Math.round(base.protein * factor),
    carbohydrates: Math.round(base.carbohydrates * factor),
    fat: Math.round(base.fat * factor),
  }
}

const resolvedRecipeIngredients = computed(() => {
  const recipe = selectedRecipe.value
  const lines = recipe?.ingredients ?? []
  return lines.map((line) => {
    const doc = ingredientsById.value.get(line.id)
    const varEntry = line.variation != null ? doc?.variations?.[line.variation] : undefined
    const nutrition = doc ? nutritionForRecipeLine(doc, line, varEntry?.value) : null
    return {
      refId: line.id,
      quantity: line.quantity,
      ingredientLabel: doc?.label,
      variationLabel: varEntry?.label,
      variationValue: varEntry?.value,
      unit: unitLabel(doc?.unit),
      nutrition,
    }
  })
})

const typeLabel = computed(() => {
  const t = selectedRecipe.value?.type
  if (!t) return '—'
  return recipeTypeLabels[t] ?? t
})

const totalMinutes = computed(() => {
  const r = selectedRecipe.value
  return (r?.prepTime ?? 0) + (r?.cookTime ?? 0)
})

const createdLabel = computed(() =>
  formatDate(selectedRecipe.value?.createdAt)
)

const updatedLabel = computed(() =>
  formatDate(selectedRecipe.value?.updatedAt)
)
</script>

<template>
  <UDashboardPanel
    id="recipes"
    :ui="{ body: 'min-h-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Recettes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="!recipeList.length"
        class="flex flex-1 flex-col items-center justify-center min-h-0 w-full"
      >
        <UEmpty
          class="max-w-md"
          icon="i-lucide-book-open"
          title="Aucune recette"
          description="Ajoutez une recette depuis l’accueil (bouton de test) ou créez-en une dans Firestore."
        />
      </div>

      <div
        v-else
        class="flex flex-col gap-6 max-w-3xl w-full"
      >
        <div
          v-if="recipeList.length > 1"
          class="max-w-md"
        >
            <UFormField label="Recette">
              <USelectMenu
                v-model="selectedRecipeId"
                :items="recipeSelectItems"
                value-key="value"
                placeholder="Choisir une recette"
                class="w-full"
              />
            </UFormField>
        </div>

        <UCard
          v-if="selectedRecipe"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <div class="flex flex-col sm:flex-row gap-0 sm:gap-6">
            <div class="shrink-0 sm:w-48 aspect-video sm:aspect-square bg-muted">
              <img
                v-if="selectedRecipe.imageUrl"
                :src="selectedRecipe.imageUrl"
                :alt="selectedRecipe.title"
                class="h-full w-full object-cover rounded-t-lg sm:rounded-l-lg sm:rounded-tr-none"
              >
              <div
                v-else
                class="h-full w-full flex items-center justify-center rounded-t-lg sm:rounded-l-lg sm:rounded-tr-none"
              >
                <UIcon name="i-lucide-image-off" class="size-12 text-muted" />
              </div>
            </div>
            <div class="flex flex-col gap-3 p-4 sm:py-4 sm:pr-4 sm:pl-0 flex-1 min-w-0">
              <div class="flex flex-wrap items-start gap-2 justify-between">
                <h1 class="text-xl font-semibold text-highlighted">
                  {{ selectedRecipe.title }}
                </h1>
                <UIcon
                  :name="selectedRecipe.isFavorite ? 'i-lucide-star' : 'i-lucide-star-off'"
                  class="size-5 shrink-0 text-muted"
                  :class="{ 'text-amber-500': selectedRecipe.isFavorite }"
                />
              </div>
              <p
                v-if="selectedRecipe.description"
                class="text-sm text-muted"
              >
                {{ selectedRecipe.description }}
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge color="neutral" variant="subtle">
                  {{ typeLabel }}
                </UBadge>
                <UBadge
                  :color="selectedRecipe.isPublic ? 'success' : 'neutral'"
                  variant="subtle"
                >
                  {{ selectedRecipe.isPublic ? 'Publique' : 'Privée' }}
                </UBadge>
              </div>
              <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <dt class="text-muted">
                    Préparation
                  </dt>
                  <dd class="font-medium text-highlighted">
                    {{ selectedRecipe.prepTime ?? 0 }} min
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Cuisson
                  </dt>
                  <dd class="font-medium text-highlighted">
                    {{ selectedRecipe.cookTime ?? 0 }} min
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
                  <dd
                    class="font-medium text-highlighted truncate"
                    :title="selectedRecipe.source ?? ''"
                  >
                    {{ selectedRecipe.source ?? '—' }}
                  </dd>
                </div>
              </dl>
              <p class="text-xs text-muted">
                Créée le {{ createdLabel }} · Mise à jour {{ updatedLabel }}
              </p>
            </div>
          </div>
        </UCard>

        <UCard v-if="selectedRecipe">
          <template #header>
            <h2 class="text-base font-semibold text-highlighted">
              Ingrédients
            </h2>
          </template>
          <div
            v-if="resolvedRecipeIngredients.length"
            class="overflow-x-auto -mx-1 px-1"
          >
            <table class="w-full border-collapse text-sm table-fixed">
              <colgroup>
                <col class="min-w-0">
                <col class="w-19">
                <col class="w-19">
                <col class="w-19">
                <col class="w-19">
              </colgroup>
              <tbody>
                <tr
                  v-for="(row, index) in resolvedRecipeIngredients"
                  :key="`${row.refId}-${index}`"
                  class="border-b border-default last:border-0"
                >
                  <td class="py-2 pr-3 align-baseline min-w-0">
                    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span class="font-medium text-highlighted tabular-nums">{{ row.quantity }}×</span>
                      <span class="font-medium text-highlighted">{{ row.ingredientLabel ?? 'Ingrédient introuvable' }}</span>
                      <template v-if="row.variationLabel">
                        <span class="text-muted">·</span>
                        <span class="text-muted">{{ row.variationLabel }}</span>
                        <span
                          v-if="row.variationValue != null"
                          class="text-muted tabular-nums"
                        >
                          ({{ row.variationValue }}&nbsp;{{ row.unit }})
                        </span>
                      </template>
                    </div>
                  </td>
                  <td class="py-2 pl-1 align-baseline text-right text-xs tabular-nums text-muted">
                    <span
                      v-if="row.nutrition"
                      class="inline-flex w-full min-w-0 items-center justify-end gap-0.5"
                    >
                      <UIcon name="i-lucide-flame" class="size-3.5 shrink-0 opacity-80" />
                      <span>{{ row.nutrition.calories }}</span>
                    </span>
                  </td>
                  <td class="py-2 pl-1 align-baseline text-right text-xs tabular-nums text-muted">
                    <span
                      v-if="row.nutrition"
                      class="inline-flex w-full min-w-0 items-center justify-end gap-0.5"
                    >
                      <UIcon name="i-lucide-wheat" class="size-3.5 shrink-0 opacity-80" />
                      <span>{{ row.nutrition.carbohydrates }}g</span>
                    </span>
                  </td>
                  <td class="py-2 pl-1 align-baseline text-right text-xs tabular-nums text-muted">
                    <span
                      v-if="row.nutrition"
                      class="inline-flex w-full min-w-0 items-center justify-end gap-0.5"
                    >
                      <UIcon name="i-lucide-dumbbell" class="size-3.5 shrink-0 opacity-80" />
                      <span>{{ row.nutrition.protein }}g</span>
                    </span>
                  </td>
                  <td class="py-2 pl-1 align-baseline text-right text-xs tabular-nums text-muted">
                    <span
                      v-if="row.nutrition"
                      class="inline-flex w-full min-w-0 items-center justify-end gap-0.5"
                    >
                      <UIcon name="i-lucide-droplets" class="size-3.5 shrink-0 opacity-80" />
                      <span>{{ row.nutrition.fat }}g</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            v-else
            class="text-sm text-muted"
          >
            Aucun ingrédient renseigné pour cette recette.
          </p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
