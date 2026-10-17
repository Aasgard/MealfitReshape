<script setup lang="ts">
import type { TodayThawDish } from '~/types/today'

defineProps<{
  /** Plats dont des repas du foyer sont encore au congélateur, à sortir la veille. */
  dishes: TodayThawDish[]
}>()

const emit = defineEmits<{
  /** Clic sur un plat issu d'une recette : ouvre sa fiche, quantités calculées pour ses parts. */
  open: [recipeId: string, parts: number]
  /** « Sorti » : confirmer le passage au frigo. */
  thaw: [dish: TodayThawDish]
}>()

const formatNumber = (parts: number) => parts.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

const formatParts = (parts: number) => `${formatNumber(parts)} part${parts > 1 ? 's' : ''}`
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-default bg-default">
    <ul class="divide-y divide-default">
      <!-- Le bouton « Sorti » est à côté de la zone cliquable, pas dedans : un <button> ne peut pas en contenir un autre. -->
      <li v-for="dish in dishes" :key="dish.dishId" class="flex items-center">
        <component
          :is="dish.recipeId ? 'button' : 'div'"
          :type="dish.recipeId ? 'button' : undefined"
          class="flex min-w-0 flex-1 items-center gap-3 p-4 pe-2 text-start"
          :class="dish.recipeId && 'cursor-pointer transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'"
          @click="dish.recipeId && emit('open', dish.recipeId, dish.parts)"
        >
          <img
            v-if="dish.imageUrl"
            :src="dish.imageUrl"
            alt=""
            loading="lazy"
            class="size-10 shrink-0 rounded-full bg-accented object-cover"
          >
          <div v-else class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
            <UIcon name="i-lucide-snowflake" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-highlighted">
              {{ dish.title }}
            </p>
            <!-- Même écriture que « Cuisiner » : un bloc insécable par jour, le « · » d'un début de ligne masqué. -->
            <span class="mt-0.5 block overflow-hidden text-xs text-dimmed">
              <span class="-ms-3 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span
                  v-for="day in dish.days"
                  :key="day.key"
                  class="inline-flex items-center gap-1 whitespace-nowrap"
                  :class="day.isLate && 'text-warning'"
                >
                  <span class="w-2 text-center" :class="day.isLate && 'text-dimmed'" aria-hidden="true">·</span>
                  <span>{{ day.label }}</span>
                  <span
                    v-for="portion in day.portions"
                    :key="portion.key"
                    class="inline-flex items-center gap-0.5"
                  >
                    <UIcon
                      v-if="portion.meal"
                      :name="portion.meal.icon"
                      class="size-3.5 shrink-0"
                      :title="portion.meal.label"
                      aria-hidden="true"
                    />
                    <span v-if="portion.meal" class="sr-only">{{ portion.meal.label }}</span>
                    <span class="font-semibold tabular-nums" :class="day.isLate ? 'text-warning' : 'text-muted'">{{ formatNumber(portion.parts) }}</span>
                  </span>
                </span>
              </span>
            </span>
          </div>
          <!-- En retard, comme l'alerte de « Cuisiner » : un repas d'aujourd'hui est encore congelé. -->
          <div v-if="dish.isLate" class="flex shrink-0 flex-col items-end text-warning">
            <p class="flex items-center gap-1 text-sm font-semibold tabular-nums">
              <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" aria-hidden="true" />
              {{ formatParts(dish.parts) }}
            </p>
            <p class="text-xs">
              Pas sorti hier ?
            </p>
          </div>
          <p v-else class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">
            {{ formatParts(dish.parts) }}
          </p>
        </component>
        <UButton
          label="Sorti"
          icon="i-lucide-refrigerator"
          :color="dish.isLate ? 'warning' : 'neutral'"
          variant="outline"
          size="sm"
          class="me-3 shrink-0"
          :aria-label="`Sorti du congélateur : ${dish.title}`"
          @click="emit('thaw', dish)"
        />
      </li>
    </ul>
  </div>
</template>
