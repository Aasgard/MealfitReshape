<script setup lang="ts">
import type { MenuDayTotals } from '~/types/menu'

/**
 * Totaux d'un jour du compte connecté : kcal puis macros, chiffres colorés selon l'objectif (bleu, vert, orange). Dans
 * l'en-tête de colonne, ou dans la bande de son bloc quand le calendrier montre aussi le foyer (voir MenuWeekCalendar).
 */
defineProps<{ totals: MenuDayTotals }>()
</script>

<template>
  <div class="text-center">
    <p class="text-sm font-bold tabular-nums" :class="totals.kcal ? totals.statusClass : 'text-dimmed'">
      {{ totals.kcal }} <span class="text-xs font-normal text-muted">kcal</span>
    </p>
    <p class="text-xs tabular-nums text-dimmed">
      <template v-for="(macro, i) in totals.macroItems" :key="macro.letter">
        {{ i ? ' ' : '' }}{{ macro.letter }}<span class="font-semibold" :class="totals.kcal ? macro.statusClass : ''">{{ macro.value }}</span>
      </template>
    </p>
  </div>
</template>
