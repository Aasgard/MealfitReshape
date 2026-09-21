<script setup lang="ts">
import type { MealType } from '~/types/meal'
import type { MenuDayHeader, MenuEntry, MenuMealTypeRow } from '~/types/menu'
import { UNCOUNTED_MEAL_KEY } from '~/utils/menuEntries'

const props = withDefaults(defineProps<{
  days: MenuDayHeader[]
  mealTypes: MenuMealTypeRow[]
  /** Repas/aliments par jour puis par type de repas : entries[dayKey][mealTypeKey]. */
  entries?: Record<string, Record<string, MenuEntry[]>>
  /** Total kcal du jour, par dayKey. */
  dayTotals?: Record<string, number>
  /** Repas actuellement copié : mis en évidence, et les boutons "+" indiquent qu'ils vont le coller. */
  copiedEntryId?: string
}>(), {
  entries: () => ({}),
  dayTotals: () => ({}),
})

const emit = defineEmits<{
  add: [dayKey: string, mealTypeKey: MealType]
  'select-entry': [entryId: string]
  'copy-entry': [entryId: string]
  'delete-entry': [entryId: string]
  /** Carte déposée dans la case (jour, ligne) : à enregistrer côté données. */
  'move-entry': [entryId: string, dayKey: string, mealTypeKey: MealType]
}>()

/** Liste vide partagée : une identité stable évite de réinitialiser inutilement les cases vides à chaque rendu. */
const NO_ENTRIES: MenuEntry[] = []

const entriesFor = (dayKey: string, mealTypeKey: string): MenuEntry[] =>
  props.entries[dayKey]?.[mealTypeKey] ?? NO_ENTRIES

/** Macros du jour : somme des macros (déjà arrondies) des repas affichés (hors "Non compté"), comme `dayTotals` pour les kcal. */
const macrosFor = (dayKey: string) => {
  const total = { carbohydrates: 0, protein: 0, fat: 0 }
  for (const [mealKey, meals] of Object.entries(props.entries[dayKey] ?? {})) {
    if (mealKey === UNCOUNTED_MEAL_KEY) continue
    for (const entry of meals) {
      total.carbohydrates += entry.carbohydrates
      total.protein += entry.protein
      total.fat += entry.fat
    }
  }
  return total
}
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
          <MenuWeekCell
            v-for="day in days"
            :key="`${mealType.key}-${day.key}`"
            :entries="entriesFor(day.key, mealType.key)"
            :copied-entry-id="copiedEntryId"
            :is-highlighted="day.isSelected"
            @add="emit('add', day.key, mealType.key)"
            @select-entry="emit('select-entry', $event)"
            @copy-entry="emit('copy-entry', $event)"
            @delete-entry="emit('delete-entry', $event)"
            @move-entry="emit('move-entry', $event, day.key, mealType.key)"
          />
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
          <p class="text-xs text-dimmed">
            <MenuMacroLabels v-bind="macrosFor(day.key)" />
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
