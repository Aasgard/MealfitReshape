<script setup lang="ts">
import type { MenuWeekOption } from '~/types/menu'

defineProps<{
  weeks: MenuWeekOption[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()
</script>

<template>
  <div class="grid grid-cols-7 gap-2">
    <button
      v-for="week in weeks"
      :key="week.id"
      type="button"
      class="flex items-center justify-center rounded-lg border px-3 py-2.5 text-center transition-colors min-w-0"
      :class="week.id === modelValue
        ? 'border-primary bg-primary/5'
        : 'border-default bg-default hover:border-primary/50'"
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
