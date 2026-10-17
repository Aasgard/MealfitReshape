<script setup lang="ts">
import type { TodayThawDish } from '~/types/today'
import { formatParts, PARTS_EPSILON, STOCK_PARTS_STEP } from '~/utils/preparedDishes'

/**
 * Confirmation de « Sorti » dans « Décongeler » : les repas cochés passent au frigo, et des parts encore au congélateur
 * peuvent sortir avec eux (elles forment un plat au frigo, décongelé aujourd'hui).
 */
const props = defineProps<{
  dish: TodayThawDish | null
  /** Parts du plat encore au congélateur, hors repas ; 0 quand il n'y en a plus (ou que le plat a quitté le stock). */
  frozenParts: number
  saving?: boolean
}>()

const emit = defineEmits<{
  confirm: [value: { mealIds: string[], extraParts: number }]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const selectedIds = ref<string[]>([])
const extraParts = ref(0)

watch(open, (isOpen) => {
  if (!isOpen) return
  selectedIds.value = props.dish?.meals.map(meal => meal.mealId) ?? []
  extraParts.value = 0
})

const toggleMeal = (mealId: string, checked: boolean | 'indeterminate') => {
  selectedIds.value = checked === true
    ? [...selectedIds.value, mealId]
    : selectedIds.value.filter(id => id !== mealId)
}

const stepExtra = (direction: 1 | -1) => {
  extraParts.value = Math.min(props.frozenParts, Math.max(0, extraParts.value + direction * STOCK_PARTS_STEP))
}

const selectedParts = computed(() => (props.dish?.meals ?? [])
  .filter(meal => selectedIds.value.includes(meal.mealId))
  .reduce((total, meal) => total + meal.parts, 0))
const totalParts = computed(() => selectedParts.value + extraParts.value)

const submit = () => {
  emit('confirm', { mealIds: selectedIds.value, extraParts: extraParts.value })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Passer au frigo"
    :description="dish?.title"
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-sm', footer: 'justify-end' }"
  >
    <template #body>
      <form id="thaw-dish-form" class="flex flex-col gap-5" novalidate @submit.prevent="submit">
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium text-highlighted">
            Repas
          </legend>
          <div
            v-for="meal in dish?.meals ?? []"
            :key="meal.mealId"
            class="flex items-center justify-between gap-3"
          >
            <UCheckbox
              :model-value="selectedIds.includes(meal.mealId)"
              :label="meal.label"
              :description="meal.memberName"
              @update:model-value="toggleMeal(meal.mealId, $event)"
            />
            <span class="shrink-0 text-sm font-semibold tabular-nums text-muted">{{ formatParts(meal.parts) }}</span>
          </div>
        </fieldset>

        <UFormField
          v-if="frozenParts > PARTS_EPSILON"
          label="Sortir aussi des parts en plus"
          :help="`${formatParts(frozenParts)} encore au congélateur, hors repas.`"
        >
          <div role="group" aria-label="Parts en plus" class="flex w-fit items-center gap-1 rounded-md ring ring-inset ring-accented">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="link"
              size="lg"
              aria-label="Retirer une demi-part"
              :disabled="extraParts < PARTS_EPSILON"
              @click="stepExtra(-1)"
            />
            <span class="min-w-20 text-center text-base font-semibold text-highlighted tabular-nums" aria-live="polite">
              {{ formatParts(extraParts) }}
            </span>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="link"
              size="lg"
              aria-label="Ajouter une demi-part"
              :disabled="extraParts > frozenParts - PARTS_EPSILON"
              @click="stepExtra(1)"
            />
          </div>
        </UFormField>

        <p class="flex items-start gap-2 text-xs text-muted">
          <UIcon name="i-lucide-info" class="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Décongelé aujourd'hui : à consommer d'ici demain soir.
        </p>
      </form>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton
        type="submit"
        form="thaw-dish-form"
        :label="totalParts > PARTS_EPSILON ? `Passer ${formatParts(totalParts)} au frigo` : 'Passer au frigo'"
        icon="i-lucide-refrigerator"
        :disabled="totalParts < PARTS_EPSILON"
        :loading="saving"
      />
    </template>
  </UModal>
</template>
