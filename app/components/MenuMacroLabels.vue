<script setup lang="ts">
defineProps<{
  carbohydrates: number
  protein: number
  fat: number
}>()
</script>

<template>
  <!-- Couleurs G/P/L identiques à la barre de composition (IngredientMacroSummary, MenuWeekStats). -->
  <span class="tabular-nums">
    <span class="text-green-500">G{{ carbohydrates }}</span>
    <span class="text-red-700"> P{{ protein }}</span>
    <span class="text-amber-500"> L{{ fat }}</span>
  </span>
</template>
