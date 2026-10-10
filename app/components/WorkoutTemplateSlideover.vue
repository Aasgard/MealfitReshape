<script setup lang="ts">
import type { Exercise, WorkoutCircuit, WorkoutTemplate, WorkoutTemplateExercise } from '~/types/workout'
import type { WorkoutTemplateInput } from '~/composables/useWorkoutTemplates'

/**
 * Création ou modification d'un programme : un nom et des exercices avec leurs séries prévues. Les charges ne sont
 * pas fixées ici : au lancement, chaque exercice reprend la dernière fois qu'il a été fait.
 */
const props = defineProps<{
  template?: WorkoutTemplate | null
  exercises: Exercise[]
  hints?: Map<string, string>
  isOwned?: (exercise: Exercise) => boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [input: WorkoutTemplateInput]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const label = ref('')
const items = ref<WorkoutTemplateExercise[]>([])
const circuits = ref<WorkoutCircuit[]>([])
/** Circuit qui reçoit les exercices choisis ; `null` = exercices classiques. */
const pickerCircuitKey = ref<string | null>(null)
const submitted = ref(false)
const pickerOpen = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  submitted.value = false
  label.value = props.template?.label ?? ''
  items.value = (props.template?.exercises ?? []).map(e => ({ ...e }))
  circuits.value = (props.template?.circuits ?? []).map(c => ({ ...c, items: c.items.map(item => ({ ...item })) }))
})

const labelError = computed(() => submitted.value && !label.value.trim() ? 'Donnez un nom au programme, par ex. « Push » ou « Jambes »' : undefined)
const itemsError = computed(() => submitted.value && !items.value.length && !circuits.value.some(c => c.items.length)
  ? 'Ajoutez au moins un exercice ou un circuit'
  : undefined)

const openPicker = (circuitKey: string | null = null) => {
  pickerCircuitKey.value = circuitKey
  pickerOpen.value = true
}

function addCircuit() {
  const circuit = newCircuit()
  circuits.value = [...circuits.value, circuit]
  openPicker(circuit.key)
}

const updateCircuit = (key: string, value: WorkoutCircuit) => {
  circuits.value = circuits.value.map(c => (c.key === key ? value : c))
}
const removeCircuit = (key: string) => {
  circuits.value = circuits.value.filter(c => c.key !== key)
}

const addExercises = (list: Exercise[]) => {
  const circuit = circuits.value.find(c => c.key === pickerCircuitKey.value)
  if (circuit) {
    const workSec = circuit.items.at(-1)?.workSec
    return updateCircuit(circuit.key, { ...circuit, items: [...circuit.items, ...list.map(e => circuitItemFrom(e, workSec))] })
  }
  items.value = [...items.value, ...list.map(templateExerciseFrom)]
}

const move = (index: number, direction: -1 | 1) => {
  const target = index + direction
  if (target < 0 || target >= items.value.length) return
  const [item] = items.value.splice(index, 1)
  items.value.splice(target, 0, item!)
}

const setCount = (item: WorkoutTemplateExercise, delta: number) => {
  item.sets = Math.min(10, Math.max(1, item.sets + delta))
}

function onSubmit() {
  submitted.value = true
  if (labelError.value || itemsError.value) return
  // Un circuit resté sans exercice n'est pas gardé.
  emit('save', { label: label.value.trim(), exercises: items.value, circuits: circuits.value.filter(c => c.items.length) })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="template ? 'Modifier le programme' : 'Nouveau programme'"
    description="Au lancement, chaque exercice reprend vos charges de la dernière fois."
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <form id="workout-template-form" class="flex flex-col gap-5" novalidate @submit.prevent="onSubmit">
        <UFormField label="Nom" :error="labelError" required>
          <UInput v-model="label" placeholder="Ex. Push, Jambes, Haut du corps" name="template-label" type="search" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" spellcheck="false" data-form-type="other" data-lpignore="true" :ui="{ base: NAME_FIELD_BASE }" class="w-full" />
        </UFormField>

        <div class="flex flex-col gap-2">
          <div class="flex items-baseline justify-between">
            <p class="text-sm font-medium text-highlighted">
              Exercices
            </p>
            <p class="text-xs tabular-nums text-dimmed">
              {{ items.length }} exercice{{ items.length > 1 ? 's' : '' }}
            </p>
          </div>

          <ol v-if="items.length" class="divide-y divide-default overflow-hidden rounded-lg border border-default">
            <li v-for="(item, index) in items" :key="item.key" class="flex items-center gap-2 py-2 ps-3 pe-1.5">
              <div class="flex flex-col">
                <UButton
                  icon="i-lucide-chevron-up"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="index === 0"
                  :aria-label="`Monter ${item.label}`"
                  @click="move(index, -1)"
                />
                <UButton
                  icon="i-lucide-chevron-down"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="index === items.length - 1"
                  :aria-label="`Descendre ${item.label}`"
                  @click="move(index, 1)"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ item.label }}
                </p>
                <p class="truncate text-xs text-dimmed">
                  {{ GROUP_BY_KEY[item.group]?.label }}
                  <template v-if="hints?.get(item.exerciseId)">
                    · <span class="tabular-nums">{{ hints.get(item.exerciseId) }}</span>
                  </template>
                </p>
              </div>
              <template v-if="item.metric !== 'CARDIO'">
                <div class="flex items-center rounded-md border border-default" role="group" :aria-label="`Séries de ${item.label}`">
                  <UButton icon="i-lucide-minus" color="neutral" variant="ghost" size="xs" aria-label="Une série de moins" @click="setCount(item, -1)" />
                  <span class="w-12 text-center text-xs tabular-nums text-highlighted"><span class="font-semibold">{{ item.sets }}</span> sér.</span>
                  <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="xs" aria-label="Une série de plus" @click="setCount(item, 1)" />
                </div>
                <div class="w-20">
                  <WorkoutNumberInput
                    v-model="item.target"
                    :unit="item.metric === 'DURATION' ? 's' : 'rép.'"
                    integer
                    size="md"
                    :label="item.metric === 'DURATION' ? `Secondes visées pour ${item.label}` : `Répétitions visées pour ${item.label}`"
                  />
                </div>
              </template>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Retirer ${item.label}`"
                @click="items.splice(index, 1)"
              />
            </li>
          </ol>

          <UButton
            label="Ajouter des exercices"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            block
            @click="openPicker()"
          />
        </div>

        <!-- Circuits (HIIT) : ils suivent les exercices dans la séance lancée. -->
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium text-highlighted">
            Circuits
          </p>
          <div
            v-for="circuit in circuits"
            :key="circuit.key"
            class="flex flex-col gap-3 rounded-lg border border-default p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="flex items-center gap-2 text-sm font-semibold text-highlighted">
                <UIcon name="i-lucide-repeat" class="size-4 text-muted" aria-hidden="true" />
                {{ circuit.label || 'Circuit' }}
              </p>
              <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" aria-label="Retirer le circuit" @click="removeCircuit(circuit.key)" />
            </div>
            <CircuitSettings :circuit="circuit" @update="updateCircuit(circuit.key, $event)" @add-exercises="openPicker(circuit.key)" />
          </div>
          <UButton
            label="Ajouter un circuit"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            block
            @click="addCircuit"
          />
        </div>

        <p v-if="itemsError" class="text-sm text-error">
          {{ itemsError }}
        </p>
      </form>

      <ExercisePickerModal
        v-model:open="pickerOpen"
        :exercises="exercises"
        :hints="hints"
        :is-owned="isOwned"
        :title="pickerCircuitKey ? 'Exercices du circuit' : undefined"
        :initial-kind="pickerCircuitKey ? 'STRENGTH' : null"
        :allow-create="false"
        @pick="addExercises"
      />
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" @click="open = false" />
      <UButton
        type="submit"
        form="workout-template-form"
        :label="template ? 'Enregistrer' : 'Créer le programme'"
        icon="i-lucide-check"
        :loading="saving"
      />
    </template>
  </USlideover>
</template>
