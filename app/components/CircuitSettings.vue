<script setup lang="ts">
import type { CircuitItem, WorkoutCircuit } from '~/types/workout'

/**
 * Réglages d'un circuit (HIIT) : nom, nombre de tours, repos entre exercices et entre tours, et les exercices avec leur
 * temps d'effort. La durée totale se recalcule à chaque changement. Sert dans un programme et dans une séance.
 */
const props = defineProps<{
  circuit: WorkoutCircuit
}>()

const emit = defineEmits<{
  update: [circuit: WorkoutCircuit]
  /** Ouvrir le choix d'exercices pour ce circuit. */
  addExercises: []
}>()

const patch = (value: Partial<WorkoutCircuit>) => emit('update', { ...props.circuit, ...value })

const setRounds = (delta: number) => patch({ rounds: Math.min(20, Math.max(1, props.circuit.rounds + delta)) })

const updateItem = (index: number, value: Partial<CircuitItem>) =>
  patch({ items: props.circuit.items.map((item, i) => (i === index ? { ...item, ...value } : item)) })

const removeItem = (index: number) => patch({ items: props.circuit.items.filter((_, i) => i !== index) })

function moveItem(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= props.circuit.items.length) return
  const items = [...props.circuit.items]
  const [item] = items.splice(index, 1)
  items.splice(target, 0, item!)
  patch({ items })
}

/** Même temps d'effort pour tous les exercices (celui du premier). */
const applyWorkToAll = () => {
  const workSec = props.circuit.items[0]?.workSec
  if (workSec) patch({ items: props.circuit.items.map(item => ({ ...item, workSec })) })
}
const sameWork = computed(() => props.circuit.items.every(item => item.workSec === props.circuit.items[0]?.workSec))

const totalSec = computed(() => circuitDurationSec(props.circuit, props.circuit.rounds))
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField label="Nom">
      <UInput :model-value="circuit.label" placeholder="HIIT" name="circuit-label" type="search" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" spellcheck="false" data-form-type="other" data-lpignore="true" :ui="{ base: NAME_FIELD_BASE }" class="w-full" @update:model-value="patch({ label: String($event) })" />
    </UFormField>

    <!-- Tours et repos sur une même ligne, à toutes les largeurs. -->
    <div class="grid grid-cols-3 gap-2 sm:gap-3">
      <UFormField label="Tours">
        <!-- Même champ que les repos (hauteur, bordure) ; lecture seule, réglé par − / + (pas de clavier). -->
        <UInput
          :model-value="String(circuit.rounds)"
          readonly
          size="lg"
          aria-label="Nombre de tours"
          class="w-full"
          :ui="{ base: 'px-8 text-center font-semibold tabular-nums', leading: 'ps-1', trailing: 'pe-1' }"
        >
          <template #leading>
            <UButton icon="i-lucide-minus" color="neutral" variant="ghost" size="xs" aria-label="Un tour de moins" @click="setRounds(-1)" />
          </template>
          <template #trailing>
            <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="xs" aria-label="Un tour de plus" @click="setRounds(1)" />
          </template>
        </UInput>
      </UFormField>
      <UFormField label="Repos exo">
        <WorkoutNumberInput
          :model-value="circuit.restBetweenExercisesSec"
          unit="s"
          integer
          label="Repos entre deux exercices, en secondes"
          @update:model-value="patch({ restBetweenExercisesSec: $event ?? 0 })"
        />
      </UFormField>
      <UFormField label="Repos tours">
        <WorkoutNumberInput
          :model-value="circuit.restBetweenRoundsSec"
          unit="s"
          integer
          label="Repos entre deux tours, en secondes"
          @update:model-value="patch({ restBetweenRoundsSec: $event ?? 0 })"
        />
      </UFormField>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-sm font-medium text-highlighted">
          Exercices <span class="text-xs font-normal text-dimmed">· temps d'effort</span>
        </p>
        <UButton
          v-if="circuit.items.length > 1 && !sameWork"
          label="Même temps pour tous"
          variant="link"
          size="xs"
          class="p-0"
          @click="applyWorkToAll"
        />
      </div>

      <ol v-if="circuit.items.length" class="divide-y divide-default overflow-hidden rounded-lg border border-default">
        <li v-for="(item, index) in circuit.items" :key="item.key" class="flex items-center gap-2 py-1.5 ps-3 pe-1.5">
          <span class="w-5 text-xs font-semibold tabular-nums text-dimmed">{{ index + 1 }}</span>
          <p class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
            {{ item.label }}
          </p>
          <div class="w-24">
            <WorkoutNumberInput
              :model-value="item.workSec"
              unit="s"
              integer
              size="md"
              :label="`Temps d'effort de ${item.label}, en secondes`"
              @update:model-value="updateItem(index, { workSec: $event ?? DEFAULT_CIRCUIT_WORK_SEC })"
            />
          </div>
          <div class="flex">
            <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" :aria-label="`Monter ${item.label}`" @click="moveItem(index, -1)" />
            <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :disabled="index === circuit.items.length - 1" :aria-label="`Descendre ${item.label}`" @click="moveItem(index, 1)" />
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :aria-label="`Retirer ${item.label}`" @click="removeItem(index)" />
        </li>
      </ol>

      <UButton
        label="Ajouter des exercices au circuit"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        block
        @click="emit('addExercises')"
      />
    </div>

    <p class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-timer" class="size-4 shrink-0" aria-hidden="true" />
      <template v-if="totalSec">
        Durée totale <span class="font-semibold tabular-nums text-highlighted">{{ formatSeconds(totalSec) }}</span>
      </template>
      <template v-else>
        Ajoutez des exercices pour calculer la durée.
      </template>
    </p>
  </div>
</template>
