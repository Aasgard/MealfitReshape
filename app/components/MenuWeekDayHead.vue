<script setup lang="ts">
import type { MenuDayHeader } from '~/types/menu'

/** En-tête d'une colonne du calendrier : le jour, puis ses totaux colorés selon l'objectif (voir MenuWeekCalendar). */
defineProps<{
  day: MenuDayHeader
  totals: {
    kcal: number
    statusClass: string
    macroItems: { letter: string, value: number, statusClass: string }[]
  }
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
    <!-- Totaux du jour, sous les yeux pendant qu'on le remplit : chiffres colorés selon l'objectif (bleu, vert, orange). -->
    <p class="mt-1 text-sm font-bold tabular-nums" :class="totals.kcal ? totals.statusClass : 'text-dimmed'">
      {{ totals.kcal }} <span class="text-xs font-normal text-muted">kcal</span>
    </p>
    <p class="text-xs tabular-nums text-dimmed">
      <template v-for="(macro, i) in totals.macroItems" :key="macro.letter">
        {{ i ? ' ' : '' }}{{ macro.letter }}<span class="font-semibold" :class="totals.kcal ? macro.statusClass : ''">{{ macro.value }}</span>
      </template>
    </p>
  </div>
</template>
