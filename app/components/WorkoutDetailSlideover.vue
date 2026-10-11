<script setup lang="ts">
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Workout, WorkoutExercise } from '~/types/workout'

/**
 * Consultation d'une séance terminée, en panneau latéral (comme le détail d'un programme) : relevé, exercices et
 * circuits en texte, note. « Modifier » ouvre la page de la séance en modification.
 */
const props = defineProps<{
  workout: Workout | null
  /** Toutes les séances, pour la colonne « Précédent » des exercices. */
  workouts: Workout[]
}>()

const emit = defineEmits<{
  edit: [workout: Workout]
  delete: [workout: Workout]
  saveAsTemplate: [workout: Workout]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const title = computed(() => (props.workout ? workoutTitle(props.workout) : 'Séance'))
const dateLabel = computed(() => (props.workout ? format(props.workout.date.toDate(), 'EEEE d MMMM yyyy', { locale: fr }) : ''))

const stats = computed(() => (props.workout ? workoutStats(props.workout) : null))
const volume = computed(() => (stats.value?.volumeKg ? formatVolume(stats.value.volumeKg) : null))
const duration = computed(() => (props.workout ? workoutDuration(props.workout) : null))
const hasContent = computed(() => !!props.workout && (props.workout.exercises.length > 0 || props.workout.circuits.length > 0))

const previousFor = (exercise: WorkoutExercise) => props.workout
  ? lastPerformance(props.workouts, exercise.exerciseId, { before: props.workout.date.toMillis(), excludeId: props.workout.id })
  : null

type Cell = { icon: string, label: string, value: string | number | null, unit: string }

/**
 * Les quatre cases du relevé (2 × 2), libellé visible : durée et calories, puis selon la séance séries et volume
 * (muscu), distance et dénivelé (cardio seul), ou tours et répétitions (circuits seuls).
 */
const cells = computed<Cell[]>(() => {
  const w = props.workout
  const st = stats.value
  if (!w || !st) return []
  const first: Cell[] = [
    { icon: 'i-lucide-timer', label: 'Durée', value: duration.value ? formatMinutes(duration.value) : null, unit: '' },
    { icon: 'i-lucide-flame', label: 'Calories', value: w.kcal, unit: 'kcal' },
  ]
  if (isCardioWorkout(w) && !w.circuits.length) {
    return [...first,
      { icon: 'i-lucide-route', label: 'Distance', value: st.distanceKm ? formatDecimal(st.distanceKm, 2) : null, unit: 'km' },
      { icon: 'i-lucide-mountain', label: 'Dénivelé', value: st.elevationM ? formatDecimal(st.elevationM, 0) : null, unit: 'm' },
    ]
  }
  if (!w.exercises.length && w.circuits.length) {
    const reps = w.circuits.reduce((total, c) => total + c.items.reduce((sum, item) => sum + (item.reps ?? []).reduce<number>((r, v) => r + (v ?? 0), 0), 0), 0)
    return [...first,
      { icon: 'i-lucide-repeat', label: 'Tours', value: st.rounds || null, unit: 'tours' },
      { icon: 'i-lucide-hash', label: 'Répétitions', value: reps || null, unit: 'rép.' },
    ]
  }
  return [...first,
    { icon: 'i-lucide-layers', label: 'Séries', value: st.sets || null, unit: 'séries' },
    { icon: 'i-lucide-weight', label: 'Volume', value: volume.value?.value ?? null, unit: volume.value?.unit ?? 'kg' },
  ]
})

function act(event: 'edit' | 'delete' | 'saveAsTemplate') {
  if (!props.workout) return
  // Émis tel quel : le parent ferme le panneau s'il navigue (modifier) ou garde sa place (supprimer, programme).
  if (event === 'edit') emit('edit', props.workout)
  else if (event === 'delete') emit('delete', props.workout)
  else emit('saveAsTemplate', props.workout)
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="dateLabel"
    :ui="{ content: 'sm:max-w-lg', description: 'first-letter:uppercase', footer: 'justify-between' }"
  >
    <template #body>
      <div v-if="workout" class="flex flex-col gap-5">
        <!-- Relevé : quatre cases (2 × 2), chacune sur une ligne : icône et libellé à gauche, valeur et unité à droite. -->
        <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-default bg-(--ui-border)">
          <div v-for="cell in cells" :key="cell.label" class="flex items-center justify-between gap-2 bg-default p-3">
            <dt class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
              <UIcon :name="cell.icon" class="size-4 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ cell.label }}</span>
            </dt>
            <dd class="flex shrink-0 items-baseline gap-1">
              <span class="text-lg font-bold tabular-nums" :class="cell.value !== null ? 'text-highlighted' : 'text-dimmed'">{{ cell.value ?? '—' }}</span>
              <span v-if="cell.value !== null && cell.unit" class="text-xs text-muted">{{ cell.unit }}</span>
            </dd>
          </div>
        </dl>

        <p v-if="!hasContent" class="rounded-xl border border-dashed border-default p-4 text-sm text-muted">
          Aucun exercice dans cette séance.
        </p>

        <WorkoutExerciseBlock
          v-for="exercise in workout.exercises"
          :key="exercise.key"
          :exercise="exercise"
          :live="false"
          readonly
          :previous="previousFor(exercise)"
        />

        <CircuitBlock
          v-for="circuit in workout.circuits"
          :key="circuit.key"
          :circuit="circuit"
          :live="false"
          readonly
        />

        <section v-if="workout.note.trim()" class="flex flex-col gap-1.5">
          <h3 class="text-sm font-medium text-highlighted">
            Note
          </h3>
          <p class="whitespace-pre-line text-sm text-muted">
            {{ workout.note }}
          </p>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center gap-1">
        <UTooltip text="Supprimer la séance">
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Supprimer la séance" @click="act('delete')" />
        </UTooltip>
        <UTooltip text="Enregistrer comme programme">
          <UButton
            icon="i-lucide-list-plus"
            color="neutral"
            variant="ghost"
            :disabled="!hasContent"
            aria-label="Enregistrer comme programme"
            @click="act('saveAsTemplate')"
          />
        </UTooltip>
      </div>
      <UButton label="Modifier" icon="i-lucide-pencil" @click="act('edit')" />
    </template>
  </USlideover>
</template>
