<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Exercise, ExerciseKind, WorkoutExercise, WorkoutSet } from '~/types/workout'
import type { ExerciseInput } from '~/composables/useExercises'

useSeoMeta({
  title: 'Dashboard - Exercices - Mealfit',
  description: 'Dashboard - Exercices - Mealfit',
})

const toast = useToast()

const { exercises, isOwned, createExercise, updateExercise, deleteExercise, promise: exercisesLoaded, error } = useExercises()
const { workouts, promise: workoutsLoaded } = useWorkouts()
const { templates } = useWorkoutTemplates()

watch(error, (e) => {
  if (e) toast.add({ title: 'Erreur', description: `Impossible de charger les exercices : ${e.message}`, color: 'error' })
})

await Promise.all([exercisesLoaded.value, workoutsLoaded.value.catch(() => undefined)])

const search = ref('')
const kind = ref<ExerciseKind | 'ALL'>('ALL')
const ownOnly = ref(false)

const kindItems = [
  { label: 'Tous', value: 'ALL' },
  { label: 'Muscu', value: 'STRENGTH' },
  { label: 'Cardio', value: 'CARDIO' },
] as const

/** Ce que l'historique dit de chaque exercice : nombre de séances, dernière fois et meilleure marque. */
const history = computed(() => {
  const map = new Map<string, { count: number, last: string, best: string | null }>()
  for (const exercise of exercises.value) {
    const done = workouts.value.filter(w => w.status === 'DONE')
      .flatMap(w => w.exercises.filter(e => e.exerciseId === exercise.id))
    if (!done.length) continue
    const last = lastPerformance(workouts.value, exercise.id)
    map.set(exercise.id, {
      count: done.length,
      last: last ? (exercise.metric === 'CARDIO' ? formatCardio(last.exercise) : formatSets(last.exercise.sets, exercise.metric)) : '—',
      best: bestMark(exercise, done.flatMap(e => e.metric === 'CARDIO' ? [] : e.sets), done),
    })
  }
  return map
})

function bestMark(exercise: Exercise, sets: WorkoutSet[], done: WorkoutExercise[]): string | null {
  if (exercise.metric === 'CARDIO') {
    const km = Math.max(0, ...done.map(e => e.cardio?.distanceKm ?? 0))
    return km ? `${formatDecimal(km, 2)} km` : null
  }
  const filled = sets.filter(s => isSetFilled(s, exercise.metric))
  if (!filled.length) return null
  if (exercise.metric === 'WEIGHT_REPS') {
    const top = filled.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) || ((b.weightKg ?? 0) === (a.weightKg ?? 0) && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a))
    return formatSet(top, exercise.metric)
  }
  if (exercise.metric === 'DURATION') return `${Math.max(...filled.map(s => s.durationSec ?? 0))} s`
  return `${Math.max(...filled.map(s => s.reps ?? 0))} rép.`
}

const sections = computed(() => {
  const visible = exercises.value.filter(e =>
    (kind.value === 'ALL' || e.kind === kind.value)
    && (!ownOnly.value || isOwned(e))
    && matchesSearch(e.label, search.value))
  return EXERCISE_GROUPS
    .map(group => ({ group, items: visible.filter(e => e.group === group.key) }))
    .filter(section => section.items.length)
})
const resultCount = computed(() => sections.value.reduce((total, s) => total + s.items.length, 0))

const metricLabel = (exercise: Exercise) => METRIC_OPTIONS.find(m => m.value === exercise.metric)?.label ?? ''

// --- Création, modification, suppression (exercices perso seulement) ---

const formOpen = ref(false)
const editing = ref<Exercise | null>(null)
const saving = ref(false)

function openForm(exercise: Exercise | null = null) {
  editing.value = exercise
  formOpen.value = true
}

async function onSave(input: ExerciseInput) {
  saving.value = true
  try {
    if (editing.value) await updateExercise(editing.value.id, input)
    else await createExercise(input)
    formOpen.value = false
    toast.add({ title: editing.value ? 'Exercice modifié' : 'Exercice créé', description: input.label, color: 'success', icon: 'i-lucide-check' })
  }
  catch (e) {
    toast.add({ title: 'Exercice non enregistré', description: (e as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const deleting = ref<Exercise | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)

/** Un exercice d'un programme ne se supprime pas : le programme perdrait une ligne sans prévenir. */
const usedInTemplates = (exercise: Exercise) => templates.value.filter(t => t.exercises.some(e => e.exerciseId === exercise.id))

function askDelete(exercise: Exercise) {
  const used = usedInTemplates(exercise)
  if (used.length) {
    toast.add({
      title: 'Exercice utilisé',
      description: `Retirez-le d'abord de : ${used.map(t => t.label).join(', ')}.`,
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    })
    return
  }
  deleting.value = exercise
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deleting.value) return
  deleteBusy.value = true
  try {
    await deleteExercise(deleting.value.id)
    deleteOpen.value = false
    toast.add({ title: 'Exercice supprimé', color: 'neutral', icon: 'i-lucide-trash-2' })
  }
  finally {
    deleteBusy.value = false
  }
}

const actions = (exercise: Exercise): DropdownMenuItem[][] => [
  [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openForm(exercise) }],
  [{ label: 'Supprimer', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(exercise) }],
]
</script>

<template>
  <UDashboardPanel id="exercices">
    <template #header>
      <UDashboardNavbar title="Exercices">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" aria-label="Nouvel exercice" @click="openForm()">
            <span class="hidden sm:inline">Nouvel exercice</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Rechercher un exercice..." name="exercise-search" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" data-form-type="other" data-lpignore="true" class="w-full sm:max-w-sm" />
          <div class="flex items-center gap-3">
            <div class="inline-flex rounded-lg bg-elevated p-1" role="radiogroup" aria-label="Famille d'exercices">
              <button
                v-for="item in kindItems"
                :key="item.value"
                type="button"
                role="radio"
                :aria-checked="kind === item.value"
                class="cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                :class="kind === item.value ? 'bg-default text-primary ring ring-default' : 'text-muted hover:text-highlighted'"
                @click="kind = item.value"
              >
                {{ item.label }}
              </button>
            </div>
            <UTooltip text="Mes exercices seulement">
              <UButton
                :color="ownOnly ? 'primary' : 'neutral'"
                :variant="ownOnly ? 'solid' : 'outline'"
                icon="i-lucide-lock"
                aria-label="Mes exercices seulement"
                :aria-pressed="ownOnly"
                @click="ownOnly = !ownOnly"
              />
            </UTooltip>
          </div>
          <p class="text-xs tabular-nums text-dimmed sm:ms-auto">
            {{ resultCount }} exercice{{ resultCount > 1 ? 's' : '' }}
          </p>
        </div>

        <UEmpty
          v-if="!sections.length"
          class="py-12"
          icon="i-lucide-search-x"
          title="Aucun exercice trouvé"
          :description="ownOnly ? 'Vous n\'avez pas encore créé d\'exercice.' : 'Essayez un autre terme ou créez l\'exercice.'"
          :actions="[{ label: search.trim() ? `Créer « ${search.trim()} »` : 'Nouvel exercice', icon: 'i-lucide-plus', onClick: () => openForm() }]"
        />

        <div v-else class="columns-1 gap-4 lg:columns-2 [&>section]:mb-4 [&>section]:break-inside-avoid">
          <section
            v-for="section in sections"
            :key="section.group.key"
            class="overflow-hidden rounded-xl border border-default bg-default"
            :aria-labelledby="`group-${section.group.key}`"
          >
            <header class="flex items-center gap-2 border-b border-default px-4 py-2.5 sm:px-5">
              <UIcon :name="section.group.icon" class="size-4 text-muted" aria-hidden="true" />
              <h2 :id="`group-${section.group.key}`" class="me-auto text-xs font-semibold uppercase tracking-wide text-dimmed">
                {{ section.group.label }}
              </h2>
              <span class="text-xs tabular-nums text-dimmed">{{ section.items.length }}</span>
            </header>
            <ul class="divide-y divide-default">
              <li v-for="exercise in section.items" :key="exercise.id" class="flex min-h-14 items-center gap-3 py-2 ps-4 pe-2 sm:ps-5">
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-highlighted">{{ exercise.label }}</span>
                    <ListPrivateBadge v-if="isOwned(exercise)" />
                  </p>
                  <p class="truncate text-xs text-dimmed">
                    <template v-if="history.get(exercise.id)">
                      <span class="tabular-nums">{{ history.get(exercise.id)!.count }}×</span>
                      · dernière fois <span class="tabular-nums text-muted">{{ history.get(exercise.id)!.last }}</span>
                    </template>
                    <template v-else>
                      {{ metricLabel(exercise) }}
                    </template>
                  </p>
                </div>
                <div v-if="history.get(exercise.id)?.best" class="shrink-0 text-end">
                  <p class="text-[10px] font-semibold uppercase tracking-wide text-dimmed">
                    Record
                  </p>
                  <p class="text-sm font-semibold tabular-nums text-highlighted">
                    {{ history.get(exercise.id)!.best }}
                  </p>
                </div>
                <UDropdownMenu v-if="isOwned(exercise)" :items="actions(exercise)" :content="{ align: 'end' }">
                  <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" :aria-label="`Actions pour ${exercise.label}`" />
                </UDropdownMenu>
                <span v-else class="w-8 shrink-0" aria-hidden="true" />
              </li>
            </ul>
          </section>
        </div>
      </div>

      <ExerciseFormSlideover
        v-model:open="formOpen"
        :exercise="editing"
        :initial-label="search.trim()"
        :initial-kind="kind === 'ALL' ? null : kind"
        :saving="saving"
        @save="onSave"
      />

      <ConfirmDialog
        v-model:open="deleteOpen"
        :title="deleting ? `Supprimer « ${deleting.label} » ?` : 'Supprimer l\'exercice ?'"
        description="Les séances où il apparaît le gardent sous son nom actuel."
        confirm-label="Supprimer"
        confirm-color="error"
        confirm-icon="i-lucide-trash-2"
        :loading="deleteBusy"
        @confirm="confirmDelete"
      />
    </template>
  </UDashboardPanel>
</template>
