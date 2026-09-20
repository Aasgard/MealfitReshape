<script setup lang="ts">
import type { MenuDayHeader, MenuEntry, MenuMealTypeRow } from '~/types/menu'

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
  add: [dayKey: string, mealTypeKey: string]
  'select-entry': [entryId: string]
  'copy-entry': [entryId: string]
}>()

const entriesFor = (dayKey: string, mealTypeKey: string): MenuEntry[] =>
  props.entries[dayKey]?.[mealTypeKey] ?? []

/** Macros du jour : somme des macros (déjà arrondies) des repas affichés, comme `dayTotals` pour les kcal. */
const macrosFor = (dayKey: string) => {
  const total = { carbohydrates: 0, protein: 0, fat: 0 }
  for (const meals of Object.values(props.entries[dayKey] ?? {})) {
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
          <div
            v-for="day in days"
            :key="`${mealType.key}-${day.key}`"
            class="border-b border-r border-default last:border-r-0 p-1.5 flex flex-col gap-1 min-h-20"
            :class="day.isSelected ? 'bg-primary/5' : ''"
          >
            <div
              v-for="entry in entriesFor(day.key, mealType.key)"
              :key="entry.id"
              class="relative rounded-md border bg-default transition-colors"
              :class="entry.id === copiedEntryId ? 'border-primary' : 'border-default hover:border-primary/50'"
            >
              <button
                type="button"
                class="w-full px-2 py-1.5 pr-7 text-left"
                @click="emit('select-entry', entry.id)"
              >
                <p class="text-xs font-medium text-highlighted truncate">
                  {{ entry.label }}
                </p>
                <!-- Deux lignes sur mobile, une seule ligne à partir de la tablette. -->
                <p class="text-xs text-dimmed tabular-nums sm:truncate">
                  {{ entry.kcal }} kcal<span class="hidden sm:inline"> - </span><br class="sm:hidden">
                  <MenuMacroLabels :carbohydrates="entry.carbohydrates" :protein="entry.protein" :fat="entry.fat" />
                </p>
              </button>
              <button
                type="button"
                data-copy-control
                :aria-label="entry.id === copiedEntryId ? 'Annuler la copie' : 'Copier'"
                :aria-pressed="entry.id === copiedEntryId"
                class="absolute top-1 right-1 rounded p-0.5 transition-colors"
                :class="entry.id === copiedEntryId ? 'text-primary bg-primary/10' : 'text-dimmed hover:text-primary'"
                @click="emit('copy-entry', entry.id)"
              >
                <UIcon name="i-lucide-copy" class="size-3.5 block" />
              </button>
            </div>
            <button
              type="button"
              data-copy-control
              aria-label="Ajouter"
              class="flex-1 flex items-center justify-center rounded-md border border-dashed px-2 py-1.5 transition-colors"
              :class="copiedEntryId ? 'border-primary/50 text-primary bg-primary/5' : 'border-default text-dimmed hover:text-primary hover:border-primary/50'"
              @click="emit('add', day.key, mealType.key)"
            >
              <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
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
          <p class="text-xs text-dimmed">
            <MenuMacroLabels v-bind="macrosFor(day.key)" />
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
