<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { WeighIn } from '~/utils/weightTrend'

const props = defineProps<{
  /** Pesée à modifier ; absente pour un ajout. */
  weighIn?: WeighIn | null
  /** Pesées existantes, pour signaler qu'une date est déjà prise. */
  existing: WeighIn[]
}>()

const emit = defineEmits<{
  save: [value: Omit<WeighIn, 'id'>]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const today = toIsoDay(new Date())
const weight = ref('')
const date = ref(today)
const note = ref('')
const submitted = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  submitted.value = false
  weight.value = props.weighIn ? formatWeight(props.weighIn.weightKg) : ''
  date.value = props.weighIn?.date ?? today
  note.value = props.weighIn?.note ?? ''
})

const isEdit = computed(() => !!props.weighIn)
const lastWeighIn = computed(() => sortWeighIns(props.existing).at(-1) ?? null)

const weightValue = computed(() => parsePositiveNumber(weight.value))
const weightError = computed(() => {
  if (!submitted.value) return undefined
  return weightInputError(weightValue.value)
})
const dateError = computed(() => {
  if (!submitted.value) return undefined
  if (!date.value) return 'Choisissez une date'
  if (date.value > today) return 'La date ne peut pas être dans le futur'
  return undefined
})

/** Pesée déjà enregistrée à cette date (hors pesée en cours de modification). */
const conflict = computed(() =>
  props.existing.find(w => w.date === date.value && w.id !== props.weighIn?.id) ?? null,
)

const title = computed(() => (isEdit.value ? 'Modifier la pesée' : 'Ajouter une pesée'))
const submitLabel = computed(() => (conflict.value ? 'Remplacer' : 'Enregistrer'))

function onSubmit() {
  submitted.value = true
  if (weightError.value || dateError.value) return
  emit('save', {
    date: date.value,
    weightKg: roundWeight(weightValue.value!),
    note: note.value.trim() || undefined,
  })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="isEdit ? undefined : 'Idéalement le matin, à jeun, dans les mêmes conditions chaque jour.'"
    :ui="{ content: 'sm:max-w-sm', footer: 'justify-end' }"
  >
    <template #body>
      <form id="weigh-in-form" class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
        <UFormField
          label="Poids"
          :error="weightError"
          :hint="!isEdit && lastWeighIn ? `Dernière : ${formatWeight(lastWeighIn.weightKg)} kg` : undefined"
          required
        >
          <UInput
            v-model="weight"
            inputmode="decimal"
            autocomplete="off"
            placeholder="78,4"
            size="xl"
            autofocus
            class="w-full"
            :ui="{ base: 'text-lg font-semibold tabular-nums', trailing: 'pointer-events-none' }"
          >
            <template #trailing>
              <span class="text-sm text-muted">kg</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField label="Date" :error="dateError" required>
          <UInput
            v-model="date"
            type="date"
            :max="today"
            icon="i-lucide-calendar"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Note" hint="Facultatif">
          <UInput
            v-model="note"
            placeholder="Ex. : repas salé la veille"
            maxlength="80"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="conflict"
          color="neutral"
          variant="subtle"
          icon="i-lucide-replace"
          :title="`Une pesée existe déjà le ${format(parseISO(conflict.date), 'd MMMM', { locale: fr })}`"
          :description="`${formatWeight(conflict.weightKg)} kg — elle sera remplacée par celle-ci.`"
        />
      </form>
    </template>

    <template #footer>
      <UButton
        label="Annuler"
        color="neutral"
        variant="ghost"
        @click="open = false"
      />
      <UButton
        type="submit"
        form="weigh-in-form"
        :label="submitLabel"
        icon="i-lucide-check"
      />
    </template>
  </UModal>
</template>
