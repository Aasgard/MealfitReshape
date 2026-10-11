<script setup lang="ts">
import type { WorkoutTemplate, WorkoutTemplateExercise } from '~/types/workout'

/**
 * Consultation d'un programme, en panneau latéral : ses exercices (séries prévues, répétitions ou durée visées, la
 * dernière fois) et ses circuits (réglages, exercices et temps d'effort). « Modifier » ouvre l'éditeur, « Lancer »
 * démarre une séance en direct.
 */
const props = defineProps<{
  template: WorkoutTemplate | null
  /** Dernière performance par exercice (« 3 × 10 × 40 kg »). */
  hints?: Map<string, string>
  /** « fait hier », « le 3 oct. »… */
  lastRun?: string | null
  starting?: boolean
}>()

const emit = defineEmits<{
  edit: [template: WorkoutTemplate]
  delete: [template: WorkoutTemplate]
  launch: [template: WorkoutTemplate]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const description = computed(() => {
  const t = props.template
  if (!t) return ''
  const n = t.exercises.length
  const c = t.circuits?.length ?? 0
  return [
    n ? `${n} exercice${n > 1 ? 's' : ''}` : null,
    c ? `${c} circuit${c > 1 ? 's' : ''}` : null,
    props.lastRun ? `fait ${props.lastRun}` : null,
  ].filter(Boolean).join(' · ')
})

/** « 3 × 10 rép. », « 3 × 30 s », « 3 séries » sans objectif ; une sortie cardio n'a pas de séries. */
function plan(e: WorkoutTemplateExercise) {
  if (e.metric === 'CARDIO') return 'Sortie'
  if (e.target === null) return `${e.sets} série${e.sets > 1 ? 's' : ''}`
  return `${e.sets} × ${e.target} ${e.metric === 'DURATION' ? 's' : 'rép.'}`
}

function act(event: 'edit' | 'delete' | 'launch') {
  if (!props.template) return
  if (event === 'edit') emit('edit', props.template)
  else if (event === 'delete') emit('delete', props.template)
  else emit('launch', props.template)
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="template?.label ?? 'Programme'"
    :description="description"
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-between' }"
  >
    <template #body>
      <div v-if="template" class="flex flex-col gap-5">
        <section v-if="template.exercises.length" class="flex flex-col gap-2" aria-labelledby="template-exercises">
          <h3 id="template-exercises" class="text-xs font-semibold uppercase tracking-wide text-dimmed">
            Exercices
          </h3>
          <ol class="divide-y divide-default overflow-hidden rounded-xl border border-default">
            <li v-for="(exercise, index) in template.exercises" :key="exercise.key" class="flex items-center gap-3 px-4 py-3">
              <span class="w-5 text-sm font-semibold tabular-nums text-muted">{{ index + 1 }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-highlighted">{{ exercise.label }}</span>
                <span class="block truncate text-xs text-dimmed">
                  {{ GROUP_BY_KEY[exercise.group]?.label ?? 'Autre' }}
                  <template v-if="hints?.get(exercise.exerciseId)">
                    · dernière fois <span class="tabular-nums text-muted">{{ hints.get(exercise.exerciseId) }}</span>
                  </template>
                </span>
              </span>
              <span class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">{{ plan(exercise) }}</span>
            </li>
          </ol>
        </section>

        <section v-for="circuit in template.circuits ?? []" :key="circuit.key" class="flex flex-col gap-2" :aria-label="circuit.label || 'Circuit'">
          <h3 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
            <UIcon name="i-lucide-repeat" class="size-4" aria-hidden="true" />
            {{ circuit.label || 'Circuit' }}
          </h3>
          <div class="overflow-hidden rounded-xl border border-default">
            <p class="border-b border-default px-4 py-2.5 text-sm tabular-nums text-muted">
              <span class="font-semibold text-highlighted">{{ circuit.rounds }}</span> tour{{ circuit.rounds > 1 ? 's' : '' }}
              · repos {{ formatSeconds(circuit.restBetweenExercisesSec) }} / {{ formatSeconds(circuit.restBetweenRoundsSec) }}
              · <span class="font-semibold text-highlighted">{{ formatSeconds(circuitDurationSec(circuit, circuit.rounds)) }}</span>
            </p>
            <ol class="divide-y divide-default">
              <li v-for="(item, index) in circuit.items" :key="item.key" class="flex items-center gap-3 px-4 py-2.5">
                <span class="w-5 text-sm font-semibold tabular-nums text-muted">{{ index + 1 }}</span>
                <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{ item.label }}</span>
                <span class="shrink-0 text-sm font-semibold tabular-nums text-highlighted">{{ formatSeconds(item.workSec) }}</span>
              </li>
            </ol>
          </div>
        </section>

        <p v-if="!template.exercises.length && !template.circuits?.length" class="rounded-xl border border-dashed border-default p-4 text-sm text-muted">
          Ce programme est vide.
        </p>
      </div>
    </template>

    <template #footer>
      <UTooltip text="Supprimer le programme">
        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Supprimer le programme" @click="act('delete')" />
      </UTooltip>
      <div class="flex items-center gap-2">
        <UButton label="Modifier" icon="i-lucide-pencil" color="neutral" variant="outline" @click="act('edit')" />
        <UButton label="Lancer" icon="i-lucide-play" :loading="starting" @click="act('launch')" />
      </div>
    </template>
  </USlideover>
</template>
