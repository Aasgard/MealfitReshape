<script setup lang="ts">
import type { MenuWeekOption } from '~/types/menu'

const props = defineProps<{
  weeks: MenuWeekOption[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

/** Sur mobile, seules les 3 semaines centrales (précédente, choisie, suivante) restent visibles pour la lisibilité. */
const isOuterWeek = (index: number) => {
  const margin = Math.floor((props.weeks.length - 3) / 2)
  return index < margin || index >= props.weeks.length - margin
}
</script>

<template>
  <div class="grid grid-cols-3 sm:grid-cols-7 gap-2">
    <button
      v-for="(week, index) in weeks"
      :key="week.id"
      type="button"
      class="items-center justify-center rounded-lg border px-3 py-2.5 text-center transition-colors min-w-0"
      :class="[
        isOuterWeek(index) ? 'hidden sm:flex' : 'flex',
        week.id === modelValue
          ? 'border-primary bg-primary/5'
          : 'border-default bg-default hover:border-primary/50',
      ]"
      @click="emit('update:modelValue', week.id)"
    >
      <span
        class="text-sm font-semibold truncate w-full"
        :class="week.id === modelValue ? 'text-primary' : 'text-highlighted'"
      >
        {{ week.isCurrent ? 'Cette semaine' : week.rangeLabel }}
      </span>
    </button>
  </div>
</template>
