<script setup lang="ts">
import type { MealType } from '~/types/meal'
import type { MenuEntry } from '~/types/menu'
import type { TodayMealRow } from '~/types/today'
import { MEAL_TARGET_TOLERANCE, TARGET_STATUS_COLOR, targetStatus } from '~/utils/dailyTargets'
import { MENU_MEAL_TYPES } from '~/utils/menuEntries'

/** Un repas de la liste "Alimentation" : anneau d'objectif et icône, total, bouton d'ajout et ce qui a été enregistré. */
const props = defineProps<{
  row: TodayMealRow
}>()

const emit = defineEmits<{
  add: [mealType: MealType]
  /** Clic sur un repas issu d'une recette ou d'un aliment : ouvre sa fiche. */
  open: [entry: MenuEntry]
}>()

const isOpenable = (entry: MenuEntry) => !!(entry.recipeId || entry.ingredientId)

/** Même icône que la ligne du calendrier des menus de la semaine. */
const icon = computed(() => MENU_MEAL_TYPES.find(type => type.key === props.row.mealType)?.icon ?? 'i-lucide-utensils')

const RING_RADIUS = 16
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** Bleu tant que l'objectif n'est pas atteint, vert à ± 10 %, orange au-delà. */
const ringColor = computed(() =>
  props.row.targetKcal ? TARGET_STATUS_COLOR[targetStatus(props.row.kcal, props.row.targetKcal, MEAL_TARGET_TOLERANCE)] : undefined
)
const ringLength = computed(() =>
  props.row.targetKcal ? Math.min(1, props.row.kcal / props.row.targetKcal) * RING_CIRCUMFERENCE : 0
)
</script>

<template>
  <div class="p-4">
    <div class="flex items-start gap-3">
      <!-- Anneau d'objectif (repas du plan) avec l'icône du repas au centre ; pastille simple pour les lignes hors plan. -->
      <div v-if="row.targetKcal" class="relative size-10 shrink-0" aria-hidden="true">
        <svg viewBox="0 0 40 40" class="size-full" fill="none" stroke-width="4" stroke-linecap="round">
          <circle cx="20" cy="20" :r="RING_RADIUS" style="stroke: var(--ui-bg-accented)" />
          <circle
            v-if="ringLength > 0"
            class="transition-[stroke-dasharray] duration-500"
            cx="20"
            cy="20"
            :r="RING_RADIUS"
            transform="rotate(-90 20 20)"
            :stroke-dasharray="`${ringLength} ${RING_CIRCUMFERENCE}`"
            :style="{ stroke: ringColor }"
          />
        </svg>
        <UIcon :name="icon" class="absolute inset-0 m-auto size-4 text-muted" />
      </div>
      <div v-else class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
        <UIcon :name="icon" class="size-4" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-semibold text-highlighted">
              {{ row.label }}
            </p>
            <p class="text-xs tabular-nums text-dimmed">
              <template v-if="row.targetKcal">
                {{ row.kcal }} / {{ row.targetKcal }} kcal
              </template>
              <template v-else>
                {{ row.kcal }} kcal<template v-if="row.note"> · {{ row.note }}</template>
              </template>
            </p>
          </div>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="sm"
            class="shrink-0 rounded-full"
            :aria-label="`Ajouter un repas : ${row.label}`"
            @click="emit('add', row.mealType)"
          />
        </div>
      </div>
    </div>

    <ul v-if="row.entries.length" class="mt-3 flex flex-col gap-2">
      <li v-for="entry in row.entries" :key="entry.id">
        <component
          :is="isOpenable(entry) ? 'button' : 'div'"
          :type="isOpenable(entry) ? 'button' : undefined"
          class="flex w-full items-center justify-between gap-3 rounded-lg border border-default bg-elevated/40 px-3 py-2 text-start"
          :class="isOpenable(entry) && 'cursor-pointer transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary'"
          @click="isOpenable(entry) && emit('open', entry)"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ entry.label }}
            </p>
            <!-- « 1 part · 153 kcal · G20 P5 L3 » (sans quantité pour des macros saisies à la main). -->
            <p class="truncate text-xs tabular-nums text-dimmed">
              <template v-if="entry.quantityLabel">
                {{ entry.quantityLabel }} ·
              </template>
              {{ entry.kcal }} kcal ·
              <MenuMacroLabels :carbohydrates="entry.carbohydrates" :protein="entry.protein" :fat="entry.fat" />
            </p>
          </div>
        </component>
      </li>
    </ul>
  </div>
</template>
