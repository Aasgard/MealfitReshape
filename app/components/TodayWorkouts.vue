<script setup lang="ts">
import type { Workout } from '~/types/workout'

/** Séances du jour affiché sur l'accueil : une ligne par séance, la séance en cours en tête avec son chrono. */
const props = defineProps<{
  workouts: Workout[]
}>()

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
const hasLive = computed(() => props.workouts.some(w => w.status === 'IN_PROGRESS'))
watch(hasLive, (live) => {
  clearInterval(ticker)
  if (live) ticker = setInterval(() => (now.value = Date.now()), 1000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(ticker))
</script>

<template>
  <ul class="divide-y divide-default overflow-hidden rounded-xl border border-default bg-default">
    <li v-for="workout in workouts" :key="workout.id">
      <NuxtLink
        :to="`/dashboard/seances/${workout.id}`"
        class="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        :class="workout.status === 'IN_PROGRESS' && 'bg-primary/5'"
      >
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-full"
          :class="workout.status === 'IN_PROGRESS' ? 'bg-primary/10 text-primary' : 'bg-accented text-muted'"
          aria-hidden="true"
        >
          <UIcon :name="isCardioWorkout(workout) ? GROUP_BY_KEY[workout.exercises[0]!.group]?.icon ?? 'i-lucide-heart-pulse' : 'i-lucide-dumbbell'" class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-highlighted">
            {{ workoutTitle(workout) }}
          </p>
          <p class="truncate text-xs tabular-nums text-dimmed">
            <template v-if="workout.status === 'IN_PROGRESS'">
              <span class="font-semibold text-primary">En cours</span> · {{ workoutMeta(workout) }}
            </template>
            <template v-else>
              {{ workoutMeta(workout) }}
            </template>
          </p>
        </div>
        <p v-if="workout.status === 'IN_PROGRESS'" class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">
          {{ workoutStartMillis(workout) === null ? 'À démarrer' : formatClock((now - workoutStartMillis(workout)!) / 1000) }}
        </p>
        <p v-else class="shrink-0 text-sm tabular-nums">
          <span class="font-semibold" :class="workout.kcal !== null ? 'text-highlighted' : 'text-dimmed'">{{ workout.kcal !== null ? formatDecimal(workout.kcal, 0) : '—' }}</span>
          <span class="text-xs text-dimmed"> kcal</span>
        </p>
      </NuxtLink>
    </li>
  </ul>
</template>
