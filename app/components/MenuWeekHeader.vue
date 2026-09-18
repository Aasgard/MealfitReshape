<script setup lang="ts">
withDefaults(defineProps<{
  weekLabel: string
  weekStatusLabel?: string
}>(), {
  weekStatusLabel: undefined,
})

const emit = defineEmits<{
  previous: []
  next: []
  'this-week': []
  'copy-previous': []
  clear: []
  'shopping-list': []
}>()
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="flex items-start gap-3">
      <div class="flex items-center rounded-sm border border-default overflow-hidden shrink-0 mt-0.5">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :ui="{ base: 'rounded-none' }"
          aria-label="Semaine précédente"
          @click="emit('previous')"
        />
        <div class="w-px h-5 bg-default" />
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :ui="{ base: 'rounded-none' }"
          aria-label="Semaine suivante"
          @click="emit('next')"
        />
      </div>

      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2 flex-wrap">
          <h1 class="text-2xl font-bold text-highlighted tracking-tight">
            {{ weekLabel }}
          </h1>
          <UButton
            label="Cette semaine"
            color="primary"
            variant="subtle"
            size="xs"
            @click="emit('this-week')"
          />
        </div>
        <p v-if="weekStatusLabel" class="text-xs text-dimmed">
          {{ weekStatusLabel }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        label="Copier la semaine précédente"
        icon="i-lucide-copy"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('copy-previous')"
      />
      <UButton
        label="Vider"
        icon="i-lucide-eraser"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('clear')"
      />
      <UButton
        label="Liste de courses"
        icon="i-lucide-shopping-cart"
        color="primary"
        size="sm"
        @click="emit('shopping-list')"
      />
    </div>
  </div>
</template>
