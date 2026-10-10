<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { format, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Workout } from '~/types/workout'
import { isWorkoutEmpty } from '~/utils/workouts'

useSeoMeta({
  title: 'Dashboard - Séances - Mealfit',
  description: 'Dashboard - Séances - Mealfit',
})

const router = useRouter()
const toast = useToast()

const workoutsApi = useWorkouts()
const { workouts, inProgress, pending, error, promise: workoutsLoaded, deleteWorkout } = workoutsApi
const { starting, start } = useStartWorkout(workoutsApi)

watch(error, (e) => {
  if (e) toast.add({ title: 'Erreur', description: `Impossible de charger les séances : ${e.message}`, color: 'error' })
})

await workoutsLoaded.value.catch(() => undefined)

/** Au-delà de ce délai, une séance terminée restée vide est un reste (ancienne version de l'appli) : supprimée. */
const EMPTY_WORKOUT_GRACE_MS = 60 * 60 * 1000

// Retirées du journal et supprimées d'ici ; le délai épargne une séance vide qu'on serait en train d'ouvrir ailleurs.
const emptyWorkouts = computed(() => workouts.value.filter(w => w.status === 'DONE' && isWorkoutEmpty(w)
  && !!w.createdAt && Date.now() - w.createdAt.toMillis() > EMPTY_WORKOUT_GRACE_MS))
watch(emptyWorkouts, (list) => {
  for (const workout of list) void deleteWorkout(workout.id).catch(() => undefined)
}, { immediate: true })

const startItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Démarrer maintenant', description: 'Chrono, séries validées une à une', icon: 'i-lucide-play', onSelect: () => start({ live: true }) },
    { label: 'Saisir une séance passée', description: 'Tout remplir d\'un coup', icon: 'i-lucide-pencil-line', onSelect: () => start({ live: false }) },
  ],
])

// --- Séance en cours ---

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => { ticker = setInterval(() => (now.value = Date.now()), 1000) })
onBeforeUnmount(() => clearInterval(ticker))

/** Chrono de la séance en cours ; `null` tant qu'elle n'est pas démarrée. */
const inProgressElapsed = computed(() => {
  const start = inProgress.value ? workoutStartMillis(inProgress.value) : null
  return start === null ? null : (now.value - start) / 1000
})

// --- Actions d'une séance du journal ---

const deletingWorkout = ref<Workout | null>(null)
const deleteWorkoutOpen = ref(false)
const deletingWorkoutBusy = ref(false)

async function confirmDeleteWorkout() {
  if (!deletingWorkout.value) return
  deletingWorkoutBusy.value = true
  try {
    await deleteWorkout(deletingWorkout.value.id)
    deleteWorkoutOpen.value = false
    toast.add({ title: 'Séance supprimée', color: 'neutral', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    toast.add({ title: 'Séance non supprimée', description: (e as Error).message, color: 'error' })
  }
  finally {
    deletingWorkoutBusy.value = false
  }
}

const editWorkout = (workout: Workout) => router.push({ path: `/dashboard/seances/${workout.id}`, query: { modifier: null } })
const askDeleteWorkout = (workout: Workout) => {
  deletingWorkout.value = workout
  deleteWorkoutOpen.value = true
}

// --- Journal ---

const today = new Date()

const PAGE_WEEKS = 8
const visibleWeeks = ref(PAGE_WEEKS)

type WeekGroup = {
  key: string
  label: string
  workouts: Workout[]
  count: number
  minutes: number
  kcal: number | null
}

const weeks = computed<WeekGroup[]>(() => {
  const groups = new Map<string, WeekGroup>()
  const thisWeek = format(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }), 'yyyy-MM-dd')
  for (const workout of workouts.value) {
    if (workout.status !== 'DONE' || isWorkoutEmpty(workout)) continue
    const start = startOfWeek(workout.date.toDate(), { weekStartsOn: WEEK_STARTS_ON })
    const key = format(start, 'yyyy-MM-dd')
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: key === thisWeek ? 'Cette semaine' : `Semaine du ${format(start, 'd MMMM', { locale: fr })}`,
        workouts: [],
        count: 0,
        minutes: 0,
        kcal: null,
      }
      groups.set(key, group)
    }
    group.workouts.push(workout)
    group.count++
    group.minutes += workoutDuration(workout) ?? 0
    if (workout.kcal !== null) group.kcal = (group.kcal ?? 0) + workout.kcal
  }
  return [...groups.values()]
})

const shownWeeks = computed(() => weeks.value.slice(0, visibleWeeks.value))
const doneCount = computed(() => workouts.value.filter(w => w.status === 'DONE' && !isWorkoutEmpty(w)).length)

const dayLabel = (workout: Workout) => {
  const date = workout.date.toDate()
  return { weekday: format(date, 'EEE', { locale: fr }).replace('.', ''), day: format(date, 'd') }
}
</script>

<template>
  <UDashboardPanel id="seances">
    <template #header>
      <UDashboardNavbar title="Séances">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UDropdownMenu :items="startItems" :content="{ align: 'end' }" :ui="{ content: 'w-72' }">
            <UButton icon="i-lucide-plus" trailing-icon="i-lucide-chevron-down" :loading="starting" aria-label="Nouvelle séance">
              <span class="hidden sm:inline">Nouvelle séance</span>
            </UButton>
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <!-- Séance en cours : on la reprend d'ici, d'un autre appareil ou après avoir fermé l'appli. -->
        <NuxtLink
          v-if="inProgress"
          :to="`/dashboard/seances/${inProgress.id}`"
          class="group flex items-center gap-4 rounded-xl border border-primary/50 bg-primary/5 p-4 transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary sm:px-5"
        >
          <span class="relative flex size-2.5 shrink-0" aria-hidden="true">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
            <span class="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-wide text-primary">
              Séance en cours
            </p>
            <p class="truncate font-semibold text-highlighted">
              {{ workoutTitle(inProgress) }}
            </p>
          </div>
          <p class="text-xl font-bold tabular-nums text-highlighted">
            {{ inProgressElapsed === null ? 'À démarrer' : formatClock(inProgressElapsed) }}
          </p>
          <span class="hidden items-center gap-1 text-sm font-medium text-primary sm:flex">
            Reprendre
            <UIcon name="i-lucide-arrow-right" class="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </NuxtLink>

        <!-- Journal -->
        <section aria-labelledby="journal-title" class="flex flex-col gap-3">
            <div class="flex items-baseline justify-between gap-3">
              <h2 id="journal-title" class="text-lg font-bold tracking-tight text-highlighted">
                Journal
              </h2>
              <p v-if="doneCount" class="text-xs tabular-nums text-dimmed">
                {{ doneCount }} séance{{ doneCount > 1 ? 's' : '' }}
              </p>
            </div>

            <div v-if="pending && !workouts.length" class="flex flex-col gap-2">
              <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
            </div>

            <div
              v-else-if="!weeks.length"
              class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-default px-6 py-12 text-center"
            >
              <UIcon name="i-lucide-dumbbell" class="size-6 text-dimmed" aria-hidden="true" />
              <p class="text-sm font-semibold text-highlighted">
                Aucune séance pour l'instant
              </p>
              <p class="max-w-sm text-sm text-muted">
                Démarrez une séance à la salle pour valider vos séries en direct, ou notez une sortie déjà faite.
              </p>
              <!-- Deux colonnes égales à partir de sm (empilées sur téléphone, pour ne pas couper les libellés), boutons hauts. -->
              <div class="mt-1 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                <UButton label="Démarrer maintenant" icon="i-lucide-play" size="xl" block :loading="starting" @click="start({ live: true })" />
                <UButton label="Saisir une séance passée" icon="i-lucide-pencil-line" color="neutral" variant="outline" size="xl" block @click="start({ live: false })" />
              </div>
            </div>

            <template v-else>
              <section
                v-for="week in shownWeeks"
                :key="week.key"
                class="overflow-hidden rounded-xl border border-default bg-default"
                :aria-label="week.label"
              >
                <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-default px-4 py-2.5 sm:px-5">
                  <h3 class="me-auto text-xs font-semibold uppercase tracking-wide text-dimmed">
                    {{ week.label }}
                  </h3>
                  <p class="flex items-baseline gap-3 text-xs text-dimmed tabular-nums">
                    <span><span class="font-semibold text-highlighted">{{ week.count }}</span> séance{{ week.count > 1 ? 's' : '' }}</span>
                    <span v-if="week.minutes"><span class="font-semibold text-highlighted">{{ formatMinutes(week.minutes) }}</span></span>
                    <span><span class="font-semibold" :class="week.kcal !== null ? 'text-highlighted' : 'text-dimmed'">{{ week.kcal !== null ? formatDecimal(week.kcal, 0) : '—' }}</span> kcal</span>
                  </p>
                </header>
                <ul class="divide-y divide-default">
                  <li v-for="workout in week.workouts" :key="workout.id" class="flex items-center transition-colors hover:bg-elevated/50">
                    <NuxtLink
                      :to="`/dashboard/seances/${workout.id}`"
                      class="flex min-w-0 flex-1 items-center gap-4 py-3 ps-4 pe-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:ps-5"
                    >
                      <div class="flex w-9 shrink-0 flex-col items-center leading-tight" aria-hidden="true">
                        <span class="text-[10px] font-semibold uppercase tracking-wide text-dimmed">{{ dayLabel(workout).weekday }}</span>
                        <span class="text-lg font-bold tabular-nums text-highlighted">{{ dayLabel(workout).day }}</span>
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-semibold text-highlighted">
                          <span class="sr-only">{{ format(workout.date.toDate(), 'EEEE d MMMM', { locale: fr }) }} : </span>
                          {{ workoutTitle(workout) }}
                        </p>
                        <p class="truncate text-xs tabular-nums text-dimmed">
                          {{ workoutMeta(workout) }}
                        </p>
                      </div>
                      <div class="shrink-0 text-end tabular-nums">
                        <p class="text-sm">
                          <span class="font-semibold" :class="workout.kcal !== null ? 'text-highlighted' : 'text-dimmed'">{{ workout.kcal !== null ? formatDecimal(workout.kcal, 0) : '—' }}</span>
                          <span class="text-xs text-dimmed"> kcal</span>
                        </p>
                        <p class="text-xs text-dimmed">
                          {{ workoutDuration(workout) ? formatMinutes(workoutDuration(workout)!) : '—' }}
                        </p>
                      </div>
                    </NuxtLink>
                    <!-- Actions en icônes, à portée directe (pas de menu). -->
                    <div class="flex shrink-0 items-center pe-2 sm:pe-3">
                      <UTooltip text="Modifier">
                        <UButton
                          icon="i-lucide-pencil"
                          color="neutral"
                          variant="ghost"
                          size="sm"
                          :aria-label="`Modifier ${workoutTitle(workout)}`"
                          @click="editWorkout(workout)"
                        />
                      </UTooltip>
                      <UTooltip text="Supprimer">
                        <UButton
                          icon="i-lucide-trash-2"
                          color="error"
                          variant="ghost"
                          size="sm"
                          :aria-label="`Supprimer ${workoutTitle(workout)}`"
                          @click="askDeleteWorkout(workout)"
                        />
                      </UTooltip>
                    </div>
                  </li>
                </ul>
              </section>

              <UButton
                v-if="weeks.length > visibleWeeks"
                label="Semaines précédentes"
                icon="i-lucide-chevron-down"
                color="neutral"
                variant="ghost"
                class="self-center"
                @click="visibleWeeks += PAGE_WEEKS"
              />
            </template>
          </section>
      </div>

      <ConfirmDialog
        v-model:open="deleteWorkoutOpen"
        :title="deletingWorkout ? `Supprimer « ${workoutTitle(deletingWorkout)} » ?` : 'Supprimer la séance ?'"
        description="Ses exercices et ses séries seront supprimés définitivement."
        confirm-label="Supprimer"
        confirm-color="error"
        confirm-icon="i-lucide-trash-2"
        :loading="deletingWorkoutBusy"
        @confirm="confirmDeleteWorkout"
      />
    </template>
  </UDashboardPanel>
</template>
