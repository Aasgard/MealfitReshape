<script setup lang="ts">
import type { MealType } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { TodayMealRow } from '~/types/today'

const props = defineProps<{
  /** Repas principaux, toujours visibles. */
  rows: TodayMealRow[]
  /** Repas secondaires (collation ou "En plus" vides, "Non compté"), regroupés dans un panneau fermé par défaut. */
  secondaryRows: TodayMealRow[]
}>()

const emit = defineEmits<{
  add: [mealType: MealType]
  /** Clic sur un repas issu d'une recette ou d'un aliment : ouvre sa fiche. */
  open: [entry: MenuEntry]
}>()

/** "Collation · En plus · Non compté" */
const secondaryLabels = computed(() => props.secondaryRows.map(row => row.label).join(' · '))
const secondaryCount = computed(() => props.secondaryRows.reduce((total, row) => total + row.entries.length, 0))
</script>

<template>
  <div class="divide-y divide-default overflow-hidden rounded-xl border border-default bg-default">
    <TodayMealSection
      v-for="row in rows"
      :key="row.mealType"
      :row="row"
      @add="emit('add', $event)"
      @open="emit('open', $event)"
    />

    <UCollapsible v-if="secondaryRows.length" :ui="{ content: 'divide-y divide-default border-t border-default' }">
      <template #default="{ open }">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 p-4 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
            <UIcon name="i-lucide-ellipsis" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-highlighted">
              Autres repas
            </p>
            <p class="truncate text-xs text-dimmed">
              {{ secondaryLabels }}<template v-if="secondaryCount">
                · {{ secondaryCount }} enregistré{{ secondaryCount > 1 ? 's' : '' }}
              </template>
            </p>
          </div>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-5 shrink-0 text-muted transition-transform duration-200"
            :class="open && 'rotate-180'"
          />
        </button>
      </template>

      <template #content>
        <TodayMealSection
          v-for="row in secondaryRows"
          :key="row.mealType"
          :row="row"
          @add="emit('add', $event)"
          @open="emit('open', $event)"
        />
      </template>
    </UCollapsible>
  </div>
</template>
