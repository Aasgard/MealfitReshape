<script setup lang="ts">
import type { MealType } from '~/types/meal'
import type { MealSlot } from '~/types/today'

defineProps<{
  /** Repas du plan encore vides aujourd'hui. */
  missing: MealSlot[]
  /** Nombre de repas du plan sur la journée. */
  plannedCount: number
}>()

const emit = defineEmits<{
  add: [mealType: MealType]
}>()
</script>

<template>
  <div class="rounded-xl border border-default bg-default p-4 sm:p-5">
    <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
      À compléter aujourd'hui
    </p>

    <p v-if="!missing.length" class="mt-4 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-green-700 dark:text-green-400">
      Journée complète — les {{ plannedCount }} repas sont enregistrés.
    </p>
    <ul v-else class="mt-4 flex flex-col divide-y divide-default">
      <li
        v-for="meal in missing"
        :key="meal.mealType"
        class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <p class="text-sm font-medium text-highlighted">
          {{ meal.label }}
        </p>
        <UButton label="Ajouter" color="primary" variant="subtle" size="xs" @click="emit('add', meal.mealType)" />
      </li>
    </ul>
  </div>
</template>
