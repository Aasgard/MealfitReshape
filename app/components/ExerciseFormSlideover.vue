<script setup lang="ts">
import type { Exercise, ExerciseGroup, ExerciseKind, ExerciseMetric } from '~/types/workout'
import type { ExerciseInput } from '~/composables/useExercises'

/** Création ou modification d'un exercice perso : nom, famille, groupe et ce qu'on note à chaque série. */
const props = defineProps<{
  /** Exercice à modifier ; absent pour une création. */
  exercise?: Exercise | null
  /** Nom proposé à la création (recherche sans résultat). */
  initialLabel?: string
  initialKind?: ExerciseKind | null
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [input: ExerciseInput]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const label = ref('')
const kind = ref<ExerciseKind>('STRENGTH')
const group = ref<ExerciseGroup>('chest')
const metric = ref<ExerciseMetric>('WEIGHT_REPS')
const submitted = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  submitted.value = false
  label.value = props.exercise?.label ?? props.initialLabel ?? ''
  kind.value = props.exercise?.kind ?? props.initialKind ?? 'STRENGTH'
  group.value = props.exercise?.group ?? (kind.value === 'CARDIO' ? 'running' : 'chest')
  metric.value = props.exercise?.metric ?? (kind.value === 'CARDIO' ? 'CARDIO' : 'WEIGHT_REPS')
})

/** Changer de famille remet un groupe et une mesure qui lui correspondent. */
function setKind(value: ExerciseKind) {
  if (kind.value === value) return
  kind.value = value
  group.value = value === 'CARDIO' ? 'running' : 'chest'
  metric.value = value === 'CARDIO' ? 'CARDIO' : 'WEIGHT_REPS'
}

const groupItems = computed(() => EXERCISE_GROUPS.filter(g => g.kind === kind.value).map(g => ({ label: g.label, value: g.key, icon: g.icon })))
const metricItems = computed(() => METRIC_OPTIONS.filter(m => m.kind === 'STRENGTH'))

const labelError = computed(() => submitted.value && !label.value.trim() ? 'Donnez un nom à l\'exercice' : undefined)

function onSubmit() {
  submitted.value = true
  if (labelError.value) return
  emit('save', { label: label.value.trim(), kind: kind.value, group: group.value, metric: metric.value })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="exercise ? 'Modifier l\'exercice' : 'Nouvel exercice'"
    description="Visible par vous seul pour l'instant."
    :ui="{ content: 'sm:max-w-md', footer: 'justify-end' }"
  >
    <template #body>
      <form id="exercise-form" class="flex flex-col gap-5" novalidate @submit.prevent="onSubmit">
        <UFormField label="Nom" :error="labelError" required>
          <UInput v-model="label" placeholder="Ex. Développé couché prise large" name="exercise-label" type="search" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" spellcheck="false" data-form-type="other" data-lpignore="true" :ui="{ base: NAME_FIELD_BASE }" autofocus class="w-full" />
        </UFormField>

        <UFormField label="Famille">
          <div class="inline-flex rounded-lg bg-elevated p-1" role="radiogroup" aria-label="Famille">
            <button
              v-for="value in (['STRENGTH', 'CARDIO'] as const)"
              :key="value"
              type="button"
              role="radio"
              :aria-checked="kind === value"
              class="cursor-pointer rounded-md px-4 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              :class="kind === value ? 'bg-default text-primary ring ring-default' : 'text-muted hover:text-highlighted'"
              @click="setKind(value)"
            >
              {{ KIND_LABELS[value] }}
            </button>
          </div>
        </UFormField>

        <UFormField :label="kind === 'CARDIO' ? 'Discipline' : 'Groupe musculaire'">
          <USelect v-model="group" :items="groupItems" class="w-full" />
        </UFormField>

        <UFormField v-if="kind === 'STRENGTH'" label="À chaque série, je note">
          <URadioGroup
            v-model="metric"
            :items="metricItems"
            value-key="value"
            variant="table"
            class="w-full"
          />
        </UFormField>
        <p v-else class="text-sm text-muted">
          Une sortie se note en durée, distance<template v-if="hasElevation(group)"> et dénivelé</template>.
        </p>
      </form>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" @click="open = false" />
      <UButton
        type="submit"
        form="exercise-form"
        :label="exercise ? 'Enregistrer' : 'Créer l\'exercice'"
        icon="i-lucide-check"
        :loading="saving"
      />
    </template>
  </USlideover>
</template>
