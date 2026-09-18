<script setup lang="ts">
import type { MenuDayHeader, MenuEntry, MenuMealTypeRow } from '~/types/menu'

const props = withDefaults(defineProps<{
  days: MenuDayHeader[]
  mealTypes: MenuMealTypeRow[]
  /** Repas/aliments par jour puis par type de repas : entries[dayKey][mealTypeKey]. */
  entries?: Record<string, Record<string, MenuEntry[]>>
  /** Total kcal du jour, par dayKey. */
  dayTotals?: Record<string, number>
}>(), {
  entries: () => ({}),
  dayTotals: () => ({}),
})

const emit = defineEmits<{
  add: [dayKey: string, mealTypeKey: string]
  'select-entry': [entryId: string]
}>()

const entriesFor = (dayKey: string, mealTypeKey: string): MenuEntry[] =>
  props.entries[dayKey]?.[mealTypeKey] ?? []
</script>

<template>
  <div class="rounded-xl border border-default bg-default overflow-hidden">
    <div class="overflow-x-auto">
      <div class="min-w-220 grid grid-cols-[110px_repeat(7,minmax(0,1fr))]">
        <div class="border-b border-r border-default bg-elevated" />
        <div
          v-for="day in days"
          :key="`head-${day.key}`"
          class="border-b border-r border-default last:border-r-0 px-2 py-2 text-center"
          :class="day.isSelected ? 'bg-primary/5' : 'bg-elevated'"
        >
          <p
            class="text-xs font-semibold uppercase tracking-wide"
            :class="day.isSelected ? 'text-primary' : 'text-dimmed'"
          >
            {{ day.dayLabel }}
          </p>
          <p
            class="text-sm font-semibold tabular-nums"
            :class="day.isSelected ? 'text-primary' : 'text-highlighted'"
          >
            {{ day.dateLabel }}
          </p>
        </div>

        <template v-for="mealType in mealTypes" :key="mealType.key">
          <div class="border-b border-r border-default px-2 py-2 flex flex-col justify-center gap-0.5 bg-elevated">
            <p class="text-xs font-semibold text-highlighted truncate">
              {{ mealType.label }}
            </p>
            <p v-if="mealType.avgLabel" class="text-xs text-dimmed truncate">
              {{ mealType.avgLabel }}
            </p>
          </div>
          <div
            v-for="day in days"
            :key="`${mealType.key}-${day.key}`"
            class="border-b border-r border-default last:border-r-0 p-1.5 flex flex-col gap-1 min-h-20"
            :class="day.isSelected ? 'bg-primary/5' : ''"
          >
            <button
              v-for="entry in entriesFor(day.key, mealType.key)"
              :key="entry.id"
              type="button"
              class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-left hover:border-primary/50 transition-colors"
              @click="emit('select-entry', entry.id)"
            >
              <p class="text-xs font-medium text-highlighted truncate">
                {{ entry.label }}
              </p>
              <p class="text-xs text-dimmed tabular-nums">
                {{ entry.kcal }} kcal
              </p>
            </button>
            <button
              type="button"
              class="flex items-center justify-center gap-1 rounded-md border border-dashed border-default px-2 py-1.5 text-xs text-dimmed hover:text-primary hover:border-primary/50 transition-colors"
              @click="emit('add', day.key, mealType.key)"
            >
              <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
              <span>Ajouter</span>
            </button>
          </div>
        </template>

        <div class="px-2 py-2 flex items-center bg-elevated">
          <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
            Total
          </p>
        </div>
        <div
          v-for="day in days"
          :key="`total-${day.key}`"
          class="last:border-r-0 px-2 py-2 flex flex-col items-center gap-1"
          :class="day.isSelected ? 'bg-primary/5' : 'bg-elevated'"
        >
          <p class="text-sm font-bold text-highlighted tabular-nums">
            {{ dayTotals[day.key] ?? 0 }} kcal
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
