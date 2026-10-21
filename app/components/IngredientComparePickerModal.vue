<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { useCurrentUser } from 'vuefire'
import type { Ingredient } from '~/types/ingredient'

/**
 * Choix d'un ingrédient du catalogue (publics et les miens) à comparer à un produit scanné.
 * Ceux sans valeurs pour 100 g restent listés en fin de résultats, grisés : on comprend pourquoi ils manquent au duel.
 */
defineProps<{
  /** Ingrédient déjà dans le duel, signalé dans la liste. */
  currentId?: string
}>()

const emit = defineEmits<{
  pick: [ingredient: Ingredient]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const isTouch = useMediaQuery('(pointer: coarse)')
useKeyboardInset(() => open.value && isTouch.value)

const user = useCurrentUser()
const { ingredients } = useFoodCatalog()
const search = ref('')

watch(open, (isOpen) => {
  if (isOpen) search.value = ''
})

const byLabel = (a: Ingredient, b: Ingredient) => a.label.localeCompare(b.label, 'fr')

const matching = computed(() => ingredients.value.filter(i => matchesSearch(i.label, search.value)))
const comparable = computed(() => matching.value.filter(i => i.valuesBy100).sort(byLabel))
const withoutValues = computed(() => matching.value.filter(i => !i.valuesBy100).sort(byLabel))

function pick(ingredient: Ingredient) {
  emit('pick', ingredient)
  open.value = false
}

const formatKcal = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} kcal`
</script>

<template>
  <UModal
    v-model:open="open"
    title="Comparer à un ingrédient"
    description="Valeurs du catalogue pour 100 g"
    :ui="{
      content: 'top-4 -translate-y-0 max-h-[calc(100dvh-var(--keyboard-inset,0px)-2rem)] sm:top-1/2 sm:-translate-y-1/2 sm:max-w-lg',
      body: 'p-0 sm:p-0',
    }"
  >
    <template #body>
      <div class="sticky top-0 z-10 border-b border-default bg-default p-4 sm:px-6">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Rechercher un ingrédient..."
          name="compare-ingredient-search"
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

      <p v-if="!matching.length" class="px-6 py-10 text-center text-sm text-muted">
        <template v-if="search.trim()">
          Aucun ingrédient ne correspond à « {{ search }} ».
        </template>
        <template v-else>
          Le catalogue est vide.
        </template>
      </p>

      <ul v-else class="divide-y divide-default pb-2">
        <li v-for="ingredient in comparable" :key="ingredient.id">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-6"
            @click="pick(ingredient)"
          >
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <span class="truncate text-sm font-medium text-highlighted">{{ ingredient.label }}</span>
              <ListPrivateBadge v-if="ingredient.owner && ingredient.owner === user?.uid" />
              <span v-if="ingredient.id === currentId" class="shrink-0 text-xs text-dimmed">Dans le duel</span>
            </span>
            <span class="shrink-0 text-xs tabular-nums text-dimmed">{{ formatKcal(ingredient.valuesBy100!.calories) }}</span>
            <MacroPie
              :carbohydrates="ingredient.valuesBy100!.carbohydrates"
              :protein="ingredient.valuesBy100!.protein"
              :fat="ingredient.valuesBy100!.fat"
            />
          </button>
        </li>
        <li v-for="ingredient in withoutValues" :key="ingredient.id" class="flex items-center gap-3 px-4 py-2.5 sm:px-6" aria-disabled="true">
          <span class="min-w-0 flex-1 truncate text-sm text-dimmed">{{ ingredient.label }}</span>
          <span class="shrink-0 text-xs text-dimmed">Sans valeurs nutritionnelles</span>
        </li>
      </ul>
    </template>
  </UModal>
</template>
