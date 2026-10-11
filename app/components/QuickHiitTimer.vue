<script setup lang="ts">
import type { WorkoutCircuit } from '~/types/workout'

/**
 * Minuteur HIIT rapide, sans séance : on règle le nombre d'exercices, l'effort, les repos et les tours, puis on lance le
 * minuteur plein écran. Rien n'est enregistré (ni séance, ni répétitions) ; les exercices s'appellent « Exercice 1, 2… ».
 * Les derniers réglages sont retenus dans ce navigateur pour la fois suivante.
 */
const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

type QuickSettings = {
  exercises: number
  workSec: number
  restBetweenExercisesSec: number
  rounds: number
  restBetweenRoundsSec: number
}

const STORAGE_KEY = 'mealfit:quick-hiit'
const DEFAULTS: QuickSettings = { exercises: 5, workSec: 40, restBetweenExercisesSec: 20, rounds: 4, restBetweenRoundsSec: 60 }

function readSettings(): QuickSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<QuickSettings> | null
    return { ...DEFAULTS, ...(stored ?? {}) }
  }
  catch {
    // Stockage indisponible (navigation privée) : réglages par défaut.
    return { ...DEFAULTS }
  }
}

const settings = reactive<QuickSettings>(readSettings())

watch(open, (isOpen) => {
  if (isOpen) Object.assign(settings, readSettings())
})

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const step = (key: 'exercises' | 'rounds', delta: number) => {
  settings[key] = clamp(settings[key] + delta, 1, 20)
}

/** Circuit construit à partir des réglages : exercices numérotés, sans exercice du catalogue. */
const buildCircuit = (): WorkoutCircuit => ({
  key: newKey(),
  label: 'Minuteur HIIT',
  rounds: settings.rounds,
  restBetweenExercisesSec: settings.restBetweenExercisesSec,
  restBetweenRoundsSec: settings.restBetweenRoundsSec,
  roundsDone: 0,
  items: Array.from({ length: settings.exercises }, (_, i) => ({
    key: newKey(),
    exerciseId: `quick-${i + 1}`,
    label: `Exercice ${i + 1}`,
    group: 'full_body' as const,
    workSec: settings.workSec,
  })),
})

const totalSec = computed(() => circuitDurationSec(buildCircuit(), settings.rounds))

// --- Lancement ---

const circuit = ref<WorkoutCircuit | null>(null)
const timerOpen = ref(false)
/** Un nouveau minuteur à chaque lancement : rien ne reste d'un circuit précédent. */
const timerKey = ref(0)

/**
 * Ouvre le minuteur par-dessus les réglages, qui restent ouverts dessous : en quittant le minuteur, on les retrouve
 * pour relancer. (Fermer d'abord les réglages puis ouvrir le minuteur dépendait de la fin d'un retour d'historique.)
 */
function launch() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }
  catch {
    // Réglages non retenus, sans conséquence.
  }
  circuit.value = buildCircuit()
  timerKey.value++
  timerOpen.value = true
}
</script>

<template>
  <UModal v-model:open="open" title="Minuteur HIIT" description="Sans séance : rien n'est enregistré." :ui="{ content: 'sm:max-w-md', footer: 'justify-end' }">
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Exercices">
            <UInput
              :model-value="String(settings.exercises)"
              readonly
              size="lg"
              aria-label="Nombre d'exercices"
              class="w-full"
              :ui="{ base: 'px-8 text-center font-semibold tabular-nums', leading: 'ps-1', trailing: 'pe-1' }"
            >
              <template #leading>
                <UButton icon="i-lucide-minus" color="neutral" variant="ghost" size="xs" aria-label="Un exercice de moins" @click="step('exercises', -1)" />
              </template>
              <template #trailing>
                <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="xs" aria-label="Un exercice de plus" @click="step('exercises', 1)" />
              </template>
            </UInput>
          </UFormField>
          <UFormField label="Effort">
            <WorkoutNumberInput
              :model-value="settings.workSec"
              unit="s"
              integer
              label="Temps d'effort de chaque exercice, en secondes"
              @update:model-value="settings.workSec = clamp($event ?? DEFAULTS.workSec, 1, 3600)"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-3 gap-2 sm:gap-3">
          <UFormField label="Tours">
            <UInput
              :model-value="String(settings.rounds)"
              readonly
              size="lg"
              aria-label="Nombre de tours"
              class="w-full"
              :ui="{ base: 'px-8 text-center font-semibold tabular-nums', leading: 'ps-1', trailing: 'pe-1' }"
            >
              <template #leading>
                <UButton icon="i-lucide-minus" color="neutral" variant="ghost" size="xs" aria-label="Un tour de moins" @click="step('rounds', -1)" />
              </template>
              <template #trailing>
                <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="xs" aria-label="Un tour de plus" @click="step('rounds', 1)" />
              </template>
            </UInput>
          </UFormField>
          <UFormField label="Repos exo">
            <WorkoutNumberInput
              :model-value="settings.restBetweenExercisesSec"
              unit="s"
              integer
              label="Repos entre deux exercices, en secondes"
              @update:model-value="settings.restBetweenExercisesSec = $event ?? 0"
            />
          </UFormField>
          <UFormField label="Repos tours">
            <WorkoutNumberInput
              :model-value="settings.restBetweenRoundsSec"
              unit="s"
              integer
              label="Repos entre deux tours, en secondes"
              @update:model-value="settings.restBetweenRoundsSec = $event ?? 0"
            />
          </UFormField>
        </div>

        <p class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-timer" class="size-4 shrink-0" aria-hidden="true" />
          Durée totale <span class="font-semibold tabular-nums text-highlighted">{{ formatSeconds(totalSec) }}</span>
        </p>
      </div>
    </template>

    <template #footer>
      <!-- Comme la consultation d'une séance : la croix en haut, l'action principale à droite du pied. -->
      <UButton label="Lancer le minuteur" icon="i-lucide-play" @click="launch" />
    </template>
  </UModal>

  <CircuitTimer
    v-if="circuit"
    :key="timerKey"
    v-model:open="timerOpen"
    :circuit="circuit"
    quick
    @update="circuit = $event"
  />
</template>
