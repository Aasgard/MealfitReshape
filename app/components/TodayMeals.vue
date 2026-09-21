<script setup lang="ts">
import type { MealType } from '~/types/meal'
import type { TodayMealRow } from '~/types/today'

defineProps<{
  rows: TodayMealRow[]
}>()

const emit = defineEmits<{
  add: [mealType: MealType]
}>()

const RING_RADIUS = 16
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const isOverTarget = (row: TodayMealRow) => !!row.targetKcal && row.kcal > row.targetKcal
const ringLength = (row: TodayMealRow) =>
  row.targetKcal ? Math.min(1, row.kcal / row.targetKcal) * RING_CIRCUMFERENCE : 0
</script>

<template>
  <div class="divide-y divide-default overflow-hidden rounded-xl border border-default bg-default">
    <div v-for="row in rows" :key="row.mealType" class="flex items-start gap-3 p-4">
      <svg v-if="row.targetKcal" viewBox="0 0 40 40" class="size-10 shrink-0" fill="none" stroke-width="4" stroke-linecap="round" aria-hidden="true">
        <circle cx="20" cy="20" :r="RING_RADIUS" style="stroke: var(--ui-bg-accented)" />
        <circle
          v-if="ringLength(row) > 0"
          class="transition-[stroke-dasharray] duration-500"
          cx="20"
          cy="20"
          :r="RING_RADIUS"
          transform="rotate(-90 20 20)"
          :stroke-dasharray="`${ringLength(row)} ${RING_CIRCUMFERENCE}`"
          :style="{ stroke: isOverTarget(row) ? 'var(--ui-warning)' : 'var(--ui-primary)' }"
        />
      </svg>
      <div v-else class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
        <UIcon name="i-lucide-utensils" class="size-4" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-semibold text-highlighted">
              {{ row.label }}
            </p>
            <p class="text-xs tabular-nums text-dimmed">
              <template v-if="row.targetKcal">
                {{ row.kcal }} / {{ row.targetKcal }} kcal
              </template>
              <template v-else>
                {{ row.kcal }} kcal<template v-if="row.note"> · {{ row.note }}</template>
              </template>
            </p>
          </div>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="sm"
            class="shrink-0 rounded-full"
            :aria-label="`Ajouter un repas : ${row.label}`"
            @click="emit('add', row.mealType)"
          />
        </div>

        <ul v-if="row.entries.length" class="mt-3 flex flex-col gap-2">
          <li
            v-for="entry in row.entries"
            :key="entry.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-default bg-elevated/40 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ entry.label }}
              </p>
              <p v-if="entry.quantityLabel" class="truncate text-xs text-dimmed">
                {{ entry.quantityLabel }}
              </p>
            </div>
            <p class="shrink-0 text-sm font-medium tabular-nums text-muted">
              {{ entry.kcal }} kcal
            </p>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
