<script setup lang="ts">
import type { WorkoutCircuit } from '~/types/workout'

/**
 * Un circuit (HIIT) dans une séance : ses réglages (repliés une fois réglés), un tableau des répétitions par exercice
 * et par tour, et en direct le bouton qui lance le minuteur. En consultation, tout est en texte.
 */
const props = defineProps<{
  circuit: WorkoutCircuit
  live: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  update: [circuit: WorkoutCircuit]
  remove: []
  addExercises: []
  startTimer: []
}>()

/** Réglages ouverts d'emblée tant que le circuit n'a pas d'exercice. */
const settingsOpen = ref(!props.circuit.items.length)

const rounds = computed(() => Array.from({ length: props.circuit.rounds }, (_, i) => i))
const roundsDone = computed(() => props.circuit.roundsDone ?? 0)
const totalSec = computed(() => circuitDurationSec(props.circuit, props.circuit.rounds))

const repsOf = (itemIndex: number, round: number) => props.circuit.items[itemIndex]?.reps?.[round] ?? null

function setReps(itemIndex: number, round: number, value: number | null) {
  emit('update', {
    ...props.circuit,
    items: props.circuit.items.map((item, i) => {
      if (i !== itemIndex) return item
      const reps = itemReps(item, props.circuit.rounds)
      reps[round] = value
      return { ...item, reps }
    }),
  })
}

const setRoundsDone = (value: number) =>
  emit('update', { ...props.circuit, roundsDone: Math.min(props.circuit.rounds, Math.max(0, value)) })

/** Total des répétitions d'un exercice sur les tours. */
const itemTotal = (itemIndex: number) =>
  rounds.value.reduce((total, round) => total + (repsOf(itemIndex, round) ?? 0), 0)
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default" :aria-label="circuit.label || 'Circuit'">
    <header class="flex items-start gap-3 p-4 pb-3 sm:px-5">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
        <UIcon name="i-lucide-repeat" class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-highlighted">
          {{ circuit.label || 'Circuit' }}
        </h3>
        <p class="mt-0.5 truncate text-xs tabular-nums text-dimmed">
          {{ circuit.items.length }} exo{{ circuit.items.length > 1 ? 's' : '' }} · {{ circuit.rounds }} tour{{ circuit.rounds > 1 ? 's' : '' }}
          · repos {{ formatSeconds(circuit.restBetweenExercisesSec) }} / {{ formatSeconds(circuit.restBetweenRoundsSec) }}
          <template v-if="totalSec">
            · {{ formatSeconds(totalSec) }}
          </template>
        </p>
      </div>
      <template v-if="!readonly">
        <UTooltip :text="settingsOpen ? 'Replier les réglages' : 'Régler le circuit'">
          <UButton
            icon="i-lucide-settings-2"
            :color="settingsOpen ? 'primary' : 'neutral'"
            variant="ghost"
            size="sm"
            :aria-pressed="settingsOpen"
            aria-label="Réglages du circuit"
            @click="settingsOpen = !settingsOpen"
          />
        </UTooltip>
        <UTooltip text="Retirer le circuit">
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" class="-me-2" aria-label="Retirer le circuit" @click="emit('remove')" />
        </UTooltip>
      </template>
    </header>

    <div v-if="settingsOpen && !readonly" class="border-t border-default p-4 sm:px-5">
      <CircuitSettings :circuit="circuit" @update="emit('update', $event)" @add-exercises="emit('addExercises')" />
    </div>

    <!-- En direct : le minuteur guide le circuit et reporte ici les répétitions notées. -->
    <div v-if="live && circuit.items.length" class="flex items-center gap-3 border-t border-default px-4 py-3 sm:px-5">
      <p class="flex-1 text-sm text-muted">
        <span class="font-semibold tabular-nums text-highlighted">{{ roundsDone }}</span>/{{ circuit.rounds }} tours faits
      </p>
      <UButton
        :label="roundsDone ? 'Relancer le minuteur' : 'Lancer le circuit'"
        icon="i-lucide-timer"
        @click="emit('startTimer')"
      />
    </div>

    <!--
      Répétitions : un exercice par ligne, un tour par colonne, total à droite. Largeurs fixes (`table-fixed`) : les tours
      se partagent la place restante, le tableau tient toujours dans la largeur, sans défilement horizontal.
    -->
    <div v-if="circuit.items.length" class="border-t border-default">
      <table class="w-full table-fixed border-collapse text-sm tabular-nums">
        <colgroup>
          <col class="w-28 sm:w-44">
          <col v-for="round in rounds" :key="round">
          <col class="w-12 sm:w-16">
        </colgroup>
        <thead>
          <tr class="border-b border-default">
            <th scope="col" class="py-2 ps-4 pe-2 text-start text-xs font-semibold uppercase tracking-wide text-dimmed sm:ps-5">
              Rép.
            </th>
            <th v-for="round in rounds" :key="round" scope="col" class="px-0.5 py-2 text-center text-xs font-semibold uppercase tracking-wide" :class="round < roundsDone ? 'text-muted' : 'text-dimmed'">
              T{{ round + 1 }}
            </th>
            <th scope="col" class="py-2 ps-1 pe-4 text-end text-xs font-semibold uppercase tracking-wide text-dimmed sm:pe-5">
              Total
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="(item, itemIndex) in circuit.items" :key="item.key">
            <th scope="row" class="py-2 ps-4 pe-2 text-start font-normal sm:ps-5">
              <span class="block truncate font-medium text-highlighted">{{ item.label }}</span>
              <span class="block text-xs text-dimmed">{{ formatSeconds(item.workSec) }}</span>
            </th>
            <td v-for="round in rounds" :key="round" class="px-0.5 py-1.5 text-center">
              <span v-if="readonly" :class="repsOf(itemIndex, round) !== null ? 'font-semibold text-highlighted' : 'text-dimmed'">
                {{ repsOf(itemIndex, round) ?? '—' }}
              </span>
              <div v-else class="mx-auto max-w-14">
                <NumberPadInput
                  :model-value="repsOf(itemIndex, round)"
                  :label="`${item.label} · tour ${round + 1}`"
                  @update:model-value="setReps(itemIndex, round, $event)"
                />
              </div>
            </td>
            <td class="py-2 ps-1 pe-4 text-end font-semibold sm:pe-5" :class="itemTotal(itemIndex) ? 'text-highlighted' : 'text-dimmed'">
              {{ itemTotal(itemIndex) || '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Séance passée : tours faits saisis à la main (le minuteur les compte en direct). -->
    <div v-if="!live && !readonly && circuit.items.length" class="flex items-center justify-between gap-3 border-t border-default px-4 py-2.5 sm:px-5">
      <p class="text-sm text-muted">
        Tours faits
      </p>
      <div class="flex items-center rounded-md border border-default" role="group" aria-label="Tours faits">
        <UButton icon="i-lucide-minus" color="neutral" variant="ghost" size="sm" aria-label="Un tour de moins" @click="setRoundsDone(roundsDone - 1)" />
        <span class="w-14 text-center text-sm tabular-nums"><span class="font-semibold text-highlighted">{{ roundsDone }}</span>/{{ circuit.rounds }}</span>
        <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" aria-label="Un tour de plus" @click="setRoundsDone(roundsDone + 1)" />
      </div>
    </div>
    <p v-else-if="readonly" class="border-t border-default px-4 py-2.5 text-sm text-muted sm:px-5">
      <span class="font-semibold tabular-nums text-highlighted">{{ roundsDone }}</span>/{{ circuit.rounds }} tours faits
    </p>
  </section>
</template>
