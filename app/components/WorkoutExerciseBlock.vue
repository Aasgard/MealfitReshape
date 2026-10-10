<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Workout, WorkoutCardio, WorkoutExercise, WorkoutSet } from '~/types/workout'

/**
 * Un exercice d'une séance, lu comme une fiche : une ligne par série (n°, la dernière fois, les valeurs), séparées par
 * des filets. En direct, chaque série se valide d'un tap ; après coup, toutes les séries remplies comptent.
 */
const props = defineProps<{
  exercise: WorkoutExercise
  /** Séance en direct : colonne de validation, retrait de la dernière série. */
  live: boolean
  /** Consultation : valeurs en texte, sans champ ni action. */
  readonly?: boolean
  /** La dernière fois que l'exercice a été fait, pour la colonne « Précédent ». */
  previous?: { workout: Workout, exercise: WorkoutExercise } | null
  canMoveUp?: boolean
  canMoveDown?: boolean
}>()

const emit = defineEmits<{
  update: [exercise: WorkoutExercise]
  remove: []
  move: [direction: -1 | 1]
  /** Une série vient d'être validée (lance le repos). */
  setDone: []
}>()

const metric = computed(() => props.exercise.metric)
const group = computed(() => GROUP_BY_KEY[props.exercise.group])

const previousDate = computed(() => props.previous ? format(props.previous.workout.date.toDate(), 'd MMM', { locale: fr }) : null)
const previousSets = computed(() => props.previous?.exercise.sets.filter(s => isSetFilled(s, metric.value)) ?? [])

const doneCount = computed(() => props.exercise.sets.filter(s => s.done).length)

function updateSet(index: number, patch: Partial<WorkoutSet>) {
  const sets = props.exercise.sets.map((s, i) => (i === index ? { ...s, ...patch } : s))
  emit('update', { ...props.exercise, sets })
}

/**
 * Valider une série vide reprend la précédente (ou la dernière fois) : en salle, on valide sans retaper ce qui n'a
 * pas changé.
 */
function toggleDone(index: number) {
  const set = props.exercise.sets[index]!
  if (set.done) return updateSet(index, { done: false })
  const fallback = previousSets.value[index] ?? props.exercise.sets[index - 1] ?? null
  // Champ par champ : une charge laissée vide reprend aussi celle de la dernière fois, même si les répétitions sont tapées.
  const filled = fallback
    ? { ...set, reps: set.reps ?? fallback.reps, weightKg: set.weightKg ?? fallback.weightKg, durationSec: set.durationSec ?? fallback.durationSec }
    : set
  updateSet(index, { ...filled, done: true })
  emit('setDone')
}

/** Recopie une série de la dernière fois dans la ligne. */
const copyPrevious = (index: number) => {
  const p = previousSets.value[index]
  if (p) updateSet(index, { reps: p.reps, weightKg: p.weightKg, durationSec: p.durationSec })
}

/** Une série ajoutée reprend les valeurs de la dernière ligne. */
function addSet() {
  const last = props.exercise.sets.at(-1)
  const next: WorkoutSet = last ? { ...last, done: false } : emptySet()
  emit('update', { ...props.exercise, sets: [...props.exercise.sets, next] })
}

function removeSet(index: number) {
  emit('update', { ...props.exercise, sets: props.exercise.sets.filter((_, i) => i !== index) })
}

function updateCardio(patch: Partial<WorkoutCardio>) {
  const cardio = props.exercise.cardio ?? { durationMin: null, distanceKm: null, elevationM: null }
  emit('update', { ...props.exercise, cardio: { ...cardio, ...patch } })
}

const pace = computed(() => formatPace(props.exercise))
const previousCardio = computed(() => props.previous?.exercise.cardio ?? null)

const actions = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Monter', icon: 'i-lucide-arrow-up', disabled: !props.canMoveUp, onSelect: () => emit('move', -1) },
    { label: 'Descendre', icon: 'i-lucide-arrow-down', disabled: !props.canMoveDown, onSelect: () => emit('move', 1) },
  ],
  [{ label: 'Retirer l\'exercice', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('remove') }],
])

/** Cellules d'une sortie en consultation : durée (h:mm au-delà d'une heure), distance, dénivelé, allure ou vitesse. */
const readonlyCardioCells = computed(() => {
  const c = props.exercise.cardio
  const isPace = props.exercise.group === 'running' || props.exercise.group === 'walking'
  return [
    { label: 'Durée', value: c?.durationMin ? formatMinutes(c.durationMin) : null, unit: null },
    { label: 'Distance', value: c?.distanceKm ? formatDecimal(c.distanceKm, 2) : null, unit: 'km' },
    ...(hasElevation(props.exercise.group)
      ? [{ label: 'Dénivelé +', value: c?.elevationM ? formatDecimal(c.elevationM, 0) : null, unit: 'm' }]
      : []),
    { label: isPace ? 'Allure' : 'Vitesse', value: pace.value, unit: null },
  ]
})

const valueColumns = computed(() => metric.value === 'WEIGHT_REPS' ? 2 : 1)
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default" :aria-label="exercise.label">
    <header class="flex items-start gap-3 p-4 pb-3 sm:px-5">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-highlighted">
          {{ exercise.label }}
        </h3>
        <p class="mt-0.5 truncate text-xs text-dimmed">
          {{ group?.label ?? 'Autre' }}
          <template v-if="previous && previousDate">
            · le {{ previousDate }}
            <span class="tabular-nums text-muted">
              {{ metric === 'CARDIO' ? formatCardio(previous.exercise) : formatSets(previous.exercise.sets, metric) }}
            </span>
          </template>
          <template v-else>
            · première fois
          </template>
        </p>
      </div>
      <p v-if="live && metric !== 'CARDIO'" class="shrink-0 pt-0.5 text-xs tabular-nums text-dimmed">
        <span class="font-semibold" :class="doneCount === exercise.sets.length && doneCount ? 'text-primary' : 'text-highlighted'">{{ doneCount }}</span>/{{ exercise.sets.length }}
      </p>
      <UDropdownMenu v-if="!readonly" :items="actions" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="ghost"
          size="sm"
          class="-me-2 -mt-1"
          :aria-label="`Actions pour ${exercise.label}`"
        />
      </UDropdownMenu>
    </header>

    <!-- Consultation d'une sortie : les mêmes cellules, en texte. -->
    <dl
      v-if="metric === 'CARDIO' && readonly"
      class="grid grid-cols-2 gap-px border-t border-default bg-(--ui-border)"
      :class="readonlyCardioCells.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'"
    >
      <div
        v-for="(cell, i) in readonlyCardioCells"
        :key="cell.label"
        class="flex flex-col gap-1 bg-default p-3 sm:px-4"
        :class="readonlyCardioCells.length === 3 && i === 2 && 'col-span-2 sm:col-span-1'"
      >
        <dt class="text-xs font-semibold uppercase tracking-wide text-dimmed">
          {{ cell.label }}
        </dt>
        <dd class="flex items-baseline gap-1">
          <span class="text-lg font-bold tabular-nums" :class="cell.value ? 'text-highlighted' : 'text-dimmed'">{{ cell.value ?? '—' }}</span>
          <span v-if="cell.value && cell.unit" class="text-xs text-muted">{{ cell.unit }}</span>
        </dd>
      </div>
    </dl>

    <!-- Consultation des séries : une ligne par série, la dernière fois en regard. -->
    <ol v-else-if="readonly && metric !== 'CARDIO'" class="divide-y divide-default border-t border-default">
      <li
        v-for="(set, index) in exercise.sets"
        :key="index"
        class="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-2.5 sm:px-5"
      >
        <span class="text-sm font-semibold tabular-nums text-muted">{{ index + 1 }}</span>
        <span class="truncate text-xs tabular-nums text-dimmed">
          <template v-if="previousSets[index]">Précédent {{ formatSet(previousSets[index]!, metric) }}</template>
        </span>
        <span class="text-sm font-semibold tabular-nums text-highlighted">{{ formatSet(set, metric) }}</span>
      </li>
    </ol>

    <!-- Endurance : une seule sortie, trois valeurs et l'allure qui en découle. -->
    <div v-else-if="metric === 'CARDIO'" class="grid grid-cols-2 gap-px border-t border-default bg-(--ui-border) sm:grid-cols-4">
      <label class="flex flex-col gap-1.5 bg-default p-3 sm:px-4">
        <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">Durée</span>
        <!-- Marche et rando durent souvent des heures : saisie en heures et minutes. -->
        <WorkoutDurationInput
          v-if="exercise.group === 'walking'"
          :model-value="exercise.cardio?.durationMin ?? null"
          :placeholder="previousCardio?.durationMin"
          label="Durée"
          @update:model-value="updateCardio({ durationMin: $event })"
        />
        <WorkoutNumberInput
          v-else
          :model-value="exercise.cardio?.durationMin ?? null"
          :placeholder="previousCardio?.durationMin ? formatDecimal(previousCardio.durationMin, 0) : '—'"
          unit="min"
          integer
          label="Durée en minutes"
          @update:model-value="updateCardio({ durationMin: $event })"
        />
      </label>
      <label class="flex flex-col gap-1.5 bg-default p-3 sm:px-4">
        <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">Distance</span>
        <WorkoutNumberInput
          :model-value="exercise.cardio?.distanceKm ?? null"
          :placeholder="previousCardio?.distanceKm ? formatDecimal(previousCardio.distanceKm, 2) : '—'"
          unit="km"
          label="Distance en kilomètres"
          @update:model-value="updateCardio({ distanceKm: $event })"
        />
      </label>
      <label v-if="hasElevation(exercise.group)" class="flex flex-col gap-1.5 bg-default p-3 sm:px-4">
        <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">Dénivelé +</span>
        <WorkoutNumberInput
          :model-value="exercise.cardio?.elevationM ?? null"
          :placeholder="previousCardio?.elevationM ? formatDecimal(previousCardio.elevationM, 0) : '—'"
          unit="m"
          integer
          label="Dénivelé positif en mètres"
          @update:model-value="updateCardio({ elevationM: $event })"
        />
      </label>
      <div class="flex flex-col gap-1.5 bg-default p-3 sm:px-4" :class="!hasElevation(exercise.group) && 'col-span-2 sm:col-span-2'">
        <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">{{ exercise.group === 'running' || exercise.group === 'walking' ? 'Allure' : 'Vitesse' }}</span>
        <p class="flex h-10 items-center text-lg font-bold tabular-nums" :class="pace ? 'text-highlighted' : 'text-dimmed'">
          {{ pace ?? '—' }}
        </p>
      </div>
    </div>

    <!-- Séries : grille réglée, colonnes alignées d'une ligne à l'autre. -->
    <template v-else>
      <div
        class="grid items-center gap-x-2 border-t border-default px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-dimmed sm:gap-x-3 sm:px-5"
        :class="valueColumns === 2 ? 'grid-cols-[1.5rem_minmax(0,1fr)_5.25rem_4.25rem_2.5rem]' : 'grid-cols-[1.5rem_minmax(0,1fr)_5.25rem_2.5rem]'"
        aria-hidden="true"
      >
        <span>N°</span>
        <span>Précédent</span>
        <span v-if="metric === 'WEIGHT_REPS'" class="text-end">kg</span>
        <span class="text-end">{{ metric === 'DURATION' ? 'Sec.' : 'Rép.' }}</span>
        <span />
      </div>
      <ol class="divide-y divide-default border-t border-default">
        <li
          v-for="(set, index) in exercise.sets"
          :key="index"
          class="grid items-center gap-x-2 px-4 py-2 transition-colors sm:gap-x-3 sm:px-5"
          :class="[
            valueColumns === 2 ? 'grid-cols-[1.5rem_minmax(0,1fr)_5.25rem_4.25rem_2.5rem]' : 'grid-cols-[1.5rem_minmax(0,1fr)_5.25rem_2.5rem]',
            live && set.done && 'bg-primary/5',
          ]"
        >
          <span class="text-sm font-semibold tabular-nums" :class="live && set.done ? 'text-primary' : 'text-muted'">{{ index + 1 }}</span>
          <button
            v-if="previousSets[index]"
            type="button"
            class="cursor-pointer truncate rounded-sm text-start text-xs tabular-nums text-dimmed hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
            :title="`Reprendre ${formatSet(previousSets[index]!, metric)}`"
            @click="copyPrevious(index)"
          >
            {{ formatSet(previousSets[index]!, metric) }}
          </button>
          <span v-else class="text-xs text-dimmed">—</span>
          <WorkoutNumberInput
            v-if="metric === 'WEIGHT_REPS'"
            :model-value="set.weightKg"
            :placeholder="previousSets[index]?.weightKg ? formatDecimal(previousSets[index]!.weightKg!, 2) : '—'"
            :label="`Charge de la série ${index + 1}, en kg`"
            @update:model-value="updateSet(index, { weightKg: $event })"
          />
          <WorkoutNumberInput
            v-if="metric === 'DURATION'"
            :model-value="set.durationSec"
            :placeholder="previousSets[index]?.durationSec ? String(previousSets[index]!.durationSec) : '—'"
            integer
            :label="`Durée de la série ${index + 1}, en secondes`"
            @update:model-value="updateSet(index, { durationSec: $event })"
          />
          <WorkoutNumberInput
            v-else
            :model-value="set.reps"
            :placeholder="previousSets[index]?.reps ? String(previousSets[index]!.reps) : '—'"
            integer
            :label="`Répétitions de la série ${index + 1}`"
            @update:model-value="updateSet(index, { reps: $event })"
          />
          <button
            v-if="live"
            type="button"
            class="flex size-10 cursor-pointer items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="set.done ? 'border-primary bg-primary text-inverted' : 'border-accented text-dimmed hover:border-primary hover:text-primary'"
            :aria-pressed="set.done"
            :aria-label="set.done ? `Série ${index + 1} validée, annuler` : `Valider la série ${index + 1}`"
            @click="toggleDone(index)"
          >
            <UIcon name="i-lucide-check" class="size-5" />
          </button>
          <UButton
            v-else
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            class="justify-self-center"
            :aria-label="`Supprimer la série ${index + 1}`"
            @click="removeSet(index)"
          />
        </li>
      </ol>
      <div class="flex items-center gap-1 border-t border-default px-2 py-1.5 sm:px-3">
        <UButton
          label="Ajouter une série"
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="addSet"
        />
        <UButton
          v-if="live && exercise.sets.length > 1"
          icon="i-lucide-minus"
          color="neutral"
          variant="ghost"
          size="sm"
          class="ms-auto"
          aria-label="Retirer la dernière série"
          @click="removeSet(exercise.sets.length - 1)"
        />
      </div>
    </template>
  </section>
</template>
