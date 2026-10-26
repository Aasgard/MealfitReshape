<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { useCurrentUser } from 'vuefire'
import type { Ingredient } from '~/types/ingredient'
import type { RecipeIngredientLine } from '~/types/recipe'
import { describeRecipeLine } from '~/utils/recipeNutrition'
import {
  canReplaceWith,
  formatKitchenGrams,
  gramsForRecipeLine,
  swapForLine,
  swapSourceIssue,
} from '~/utils/ingredientSwap'

/**
 * Choix d'un remplaçant pour une ligne de la fiche recette, chacun pesé pour apporter les mêmes kcal. Les ingrédients de
 * la même catégorie passent en tête ; dans chaque groupe, les macros les plus proches de l'original d'abord. Ceux sans
 * kcal restent listés en fin, grisés, pour qu'on comprenne leur absence.
 */
const props = defineProps<{
  line: Pick<RecipeIngredientLine, 'ingredientRef' | 'unit' | 'quantity'> | null
  ingredientsById: Map<string, Ingredient>
  /** Parts affichées ÷ parts de la recette : les poids proposés sont ceux à peser. */
  factor: number
  /** Remplaçant déjà choisi pour cette ligne, signalé dans la liste. */
  currentId?: string
}>()

const emit = defineEmits<{
  pick: [ingredientId: string]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const isTouch = useMediaQuery('(pointer: coarse)')
useKeyboardInset(() => open.value && isTouch.value)

const user = useCurrentUser()
const search = ref('')
watch(open, (isOpen) => {
  if (isOpen) search.value = ''
})

const original = computed(() => (props.line?.ingredientRef ? props.ingredientsById.get(props.line.ingredientRef.id) : undefined))
const sourceIssue = computed(() => (props.line ? swapSourceIssue(props.line, original.value) : null))

const originalSummary = computed(() => {
  const line = props.line
  const ingredient = original.value
  if (!line || !ingredient) return undefined
  const quantity = describeRecipeLine(line, props.ingredientsById, props.factor)?.quantityLabel
  const grams = gramsForRecipeLine(line, ingredient)
  const kcal = grams != null && ingredient.valuesBy100 ? (ingredient.valuesBy100.calories * grams * props.factor) / 100 : null
  return [quantity, kcal != null ? `${Math.round(kcal).toLocaleString('fr-FR')} kcal` : null].filter(Boolean).join(' · ')
})

const byLabel = (a: { ingredient: Ingredient }, b: { ingredient: Ingredient }) =>
  a.ingredient.label.localeCompare(b.ingredient.label, 'fr')

/** Candidats pesés, hors ingrédient d'origine, filtrés par la recherche. */
const candidates = computed(() => {
  const line = props.line
  if (!line || sourceIssue.value) return []
  return [...props.ingredientsById.values()]
    .filter(i => i.id !== original.value?.id && matchesSearch(i.label, search.value))
    .map((ingredient) => {
      const swap = canReplaceWith(ingredient) ? swapForLine(line, original.value, ingredient) : null
      return {
        ingredient,
        grams: swap ? swap.grams * props.factor : null,
        delta: swap
          ? {
              carbohydrates: swap.delta.carbohydrates * props.factor,
              protein: swap.delta.protein * props.factor,
              fat: swap.delta.fat * props.factor,
            }
          : null,
      }
    })
})

/** Écart total de macros (g) : à kcal égales, le remplaçant le plus fidèle en tête de son groupe. */
type Candidate = (typeof candidates.value)[number]
const macroGap = (c: Candidate) => (c.delta ? Math.abs(c.delta.carbohydrates) + Math.abs(c.delta.protein) + Math.abs(c.delta.fat) : Infinity)
const byMacroGap = (a: Candidate, b: Candidate) => macroGap(a) - macroGap(b) || byLabel(a, b)

const categoryId = computed(() => original.value?.category?.id)
const categoryLabel = computed(() => original.value?.category?.label)
const sameCategory = computed(() =>
  categoryId.value ? candidates.value.filter(c => c.grams != null && c.ingredient.category?.id === categoryId.value).sort(byMacroGap) : []
)
const others = computed(() =>
  candidates.value.filter(c => c.grams != null && (!categoryId.value || c.ingredient.category?.id !== categoryId.value)).sort(byMacroGap)
)
const withoutKcal = computed(() => candidates.value.filter(c => c.grams == null).sort(byLabel))

const groups = computed(() =>
  [
    { key: 'same', title: categoryLabel.value ? `Même catégorie · ${categoryLabel.value}` : 'Même catégorie', items: sameCategory.value },
    { key: 'others', title: sameCategory.value.length ? 'Autres ingrédients' : null, items: others.value },
  ].filter(group => group.items.length)
)

function pick(ingredientId: string) {
  emit('pick', ingredientId)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="original ? `Remplacer ${original.label}` : 'Remplacer un ingrédient'"
    :description="originalSummary ? `${originalSummary} · poids à kcal égales` : 'Poids à kcal égales'"
    :ui="{
      content: 'top-4 -translate-y-0 max-h-[calc(100dvh-var(--keyboard-inset,0px)-2rem)] sm:top-1/2 sm:-translate-y-1/2 sm:max-w-lg',
      body: 'p-0 sm:p-0',
    }"
  >
    <template #body>
      <p v-if="sourceIssue" class="flex items-start gap-2 px-4 py-8 text-sm text-muted sm:px-6">
        <UIcon name="i-lucide-circle-slash" class="mt-0.5 size-4 shrink-0 text-dimmed" />
        {{ sourceIssue }}
      </p>

      <template v-else>
        <div class="sticky top-0 z-10 border-b border-default bg-default p-4 sm:px-6">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Rechercher un ingrédient..."
            name="swap-ingredient-search"
            type="search"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
            data-form-type="other"
            data-lpignore="true"
            :autofocus="!isTouch"
            class="w-full"
          />
        </div>

        <p v-if="!candidates.length" class="px-6 py-10 text-center text-sm text-muted">
          <template v-if="search.trim()">
            Aucun ingrédient ne correspond à « {{ search }} ».
          </template>
          <template v-else>
            Le catalogue ne contient pas d'autre ingrédient.
          </template>
        </p>

        <div v-else class="pb-2">
          <section v-for="group in groups" :key="group.key" :aria-label="group.title ?? undefined">
            <h3
              v-if="group.title"
              class="border-b border-default bg-elevated/60 px-4 py-1.5 text-xs font-medium text-dimmed sm:px-6"
            >
              {{ group.title }}
            </h3>
            <ul class="divide-y divide-default border-b border-default">
              <li v-for="candidate in group.items" :key="candidate.ingredient.id">
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-6"
                  @click="pick(candidate.ingredient.id)"
                >
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="flex min-w-0 items-center gap-2">
                      <span class="truncate text-sm font-medium text-highlighted">{{ candidate.ingredient.label }}</span>
                      <ListPrivateBadge v-if="candidate.ingredient.owner && candidate.ingredient.owner === user?.uid" />
                      <span v-if="candidate.ingredient.id === currentId" class="shrink-0 text-xs text-primary">Choisi</span>
                    </span>
                    <MacroDeltaLabels :delta="candidate.delta!" class="text-xs" />
                  </span>
                  <span class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">{{ formatKitchenGrams(candidate.grams!) }}</span>
                </button>
              </li>
            </ul>
          </section>

          <ul v-if="withoutKcal.length" class="divide-y divide-default">
            <li
              v-for="candidate in withoutKcal"
              :key="candidate.ingredient.id"
              class="flex items-center gap-3 px-4 py-2.5 sm:px-6"
              aria-disabled="true"
            >
              <span class="min-w-0 flex-1 truncate text-sm text-dimmed">{{ candidate.ingredient.label }}</span>
              <span class="shrink-0 text-xs text-dimmed">
                {{ candidate.ingredient.valuesBy100 ? '0 kcal' : 'Valeurs non renseignées' }}
              </span>
            </li>
          </ul>
        </div>
      </template>
    </template>
  </UModal>
</template>
