<script setup lang="ts">
import type { MenuDayHeader, MenuDayTotals } from '~/types/menu'

/**
 * En-tête d'une colonne du calendrier : le jour, puis ses totaux colorés selon l'objectif (voir MenuWeekCalendar).
 * Sans `totals` : le jour seul (avec le foyer, les totaux passent dans la bande du bloc du compte connecté).
 */
defineProps<{
  day: MenuDayHeader
  totals?: MenuDayTotals
}>()
</script>

<template>
  <div
    class="px-2 py-2 text-center"
    :class="day.isSelected ? 'bg-[color-mix(in_oklch,var(--ui-primary)_5%,var(--ui-bg-elevated))]' : 'bg-elevated'"
  >
    <p
      class="text-xs font-semibold uppercase tracking-wide"
      :class="day.isSelected ? 'text-primary' : 'text-dimmed'"
    >
      {{ day.dayLabel }} <span class="tabular-nums" :class="day.isSelected ? 'text-primary' : 'text-highlighted'">{{ day.dateLabel }}</span>
    </p>
    <!-- Totaux du jour, sous les yeux pendant qu'on le remplit. -->
    <MenuWeekDayTotals v-if="totals" :totals="totals" class="mt-1" />
  </div>
</template>
