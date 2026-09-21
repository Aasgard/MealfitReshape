<script setup lang="ts">
import type { TodayTrendDay } from '~/types/today'

const props = defineProps<{
  /** Les 7 derniers jours, du plus ancien à aujourd'hui. */
  days: TodayTrendDay[]
  /** Objectif kcal de référence : les jours au-dessus sont mis en évidence. */
  targetKcal: number
}>()

/** Moyenne des jours où quelque chose a été enregistré : un jour vide ne doit pas tirer la moyenne vers le bas. */
const averageKcal = computed(() => {
  const loggedDays = props.days.filter(day => day.kcal > 0)
  if (!loggedDays.length) return null
  return Math.round(loggedDays.reduce((total, day) => total + day.kcal, 0) / loggedDays.length)
})

/** Hauteur de la colonne la plus haute : l'objectif se place à 80 % tant qu'aucun jour ne le dépasse de plus de 25 %. */
const scaleMax = computed(() => Math.max(props.targetKcal * 1.25, ...props.days.map(day => day.kcal)))

const isAboveTarget = (day: TodayTrendDay) => day.kcal > props.targetKcal
const barHeight = (day: TodayTrendDay) => day.kcal > 0 ? `${Math.max(3, (day.kcal / scaleMax.value) * 100)}%` : '4px'
const targetBottom = computed(() => `${(props.targetKcal / scaleMax.value) * 100}%`)

/** Aujourd'hui en indigo (état courant), les jours au-dessus de l'objectif en ambre, les autres en neutre. */
const barClass = (day: TodayTrendDay) => day.isToday ? 'bg-primary' : isAboveTarget(day) ? 'bg-warning' : 'bg-accented'
const letterClass = (day: TodayTrendDay) => day.isToday ? 'text-primary' : isAboveTarget(day) ? 'text-warning' : 'text-dimmed'

const chartLabel = computed(() =>
  `Calories des 7 derniers jours : ${props.days.map(day => `${day.fullLabel} ${day.kcal} kcal`).join(', ')}`
)
</script>

<template>
  <div class="flex flex-col rounded-xl border border-default bg-default p-4 sm:p-5">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
        7 derniers jours
      </p>
      <p class="text-xs text-dimmed">
        Moy. <span class="tabular-nums">{{ averageKcal ?? '—' }}</span> kcal
      </p>
    </div>

    <div class="relative mt-5 min-h-32 flex-1" role="img" :aria-label="chartLabel">
      <div class="absolute inset-x-0 border-t border-dashed border-accented" :style="{ bottom: targetBottom }" />
      <div class="absolute inset-0 flex items-end gap-2 sm:gap-3">
        <div
          v-for="day in days"
          :key="day.key"
          class="flex-1 rounded-lg transition-[height] duration-500"
          :class="barClass(day)"
          :style="{ height: barHeight(day) }"
          :title="`${day.fullLabel} : ${day.kcal} kcal`"
        />
      </div>
    </div>

    <div class="mt-2 grid grid-cols-7 gap-2 sm:gap-3">
      <p
        v-for="day in days"
        :key="day.key"
        class="text-center text-xs font-semibold"
        :class="letterClass(day)"
      >
        {{ day.label }}
      </p>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-default pt-3 text-xs text-muted">
      <span class="flex items-center gap-2">
        <span class="size-2 rounded-sm bg-warning" />
        Jours au-dessus de l'objectif
      </span>
      <span class="flex items-center gap-2">
        <span class="w-3 border-t border-dashed border-accented" />
        Objectif {{ targetKcal }} kcal
      </span>
    </div>
  </div>
</template>
