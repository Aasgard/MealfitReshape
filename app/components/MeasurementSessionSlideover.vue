<script setup lang="ts">
/**
 * Saisie guidée d'une séance : les zones défilent dans l'ordre du corps, chacune avec sa dernière
 * valeur et la façon de mesurer. Entrée passe au champ suivant pour enchaîner sans lâcher le ruban.
 */
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { MeasurementSession, MeasurementZoneKey } from '~/utils/measurements'

const props = defineProps<{
  /** Séance à modifier ; absente pour une nouvelle séance. */
  session?: MeasurementSession | null
  existing: MeasurementSession[]
}>()

const emit = defineEmits<{
  save: [value: Omit<MeasurementSession, 'id'>]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const today = toIsoDay(new Date())
const date = ref(today)
const inputs = reactive<Record<MeasurementZoneKey, string>>(emptyInputs())
const submitted = ref(false)

function emptyInputs(): Record<MeasurementZoneKey, string> {
  return Object.fromEntries(MEASUREMENT_ZONES.map(z => [z.key, ''])) as Record<MeasurementZoneKey, string>
}

watch(open, (isOpen) => {
  if (!isOpen) return
  submitted.value = false
  date.value = props.session?.date ?? today
  const values = props.session?.values ?? {}
  for (const zone of MEASUREMENT_ZONES) {
    const value = values[zone.key]
    inputs[zone.key] = value === undefined ? '' : formatCm(value)
  }
})

const isEdit = computed(() => !!props.session)
const otherSessions = computed(() => props.existing.filter(s => s.id !== props.session?.id))

const fields = computed(() => MEASUREMENT_ZONES.map((zone) => {
  const raw = inputs[zone.key].trim()
  const value = raw ? parsePositiveNumber(raw) : null
  const previous = lastValueBefore(otherSessions.value, zone.key, date.value)
  let error: string | undefined
  if (raw && (value === null || value < MIN_MEASUREMENT_CM || value > MAX_MEASUREMENT_CM)) {
    error = `Entre ${MIN_MEASUREMENT_CM} et ${MAX_MEASUREMENT_CM} cm, par exemple 86,5`
  }
  const deviation = value !== null && previous ? Math.abs(value - previous.valueCm) / previous.valueCm : 0
  return {
    zone,
    value,
    previous,
    error,
    warning: !error && deviation > MEASUREMENT_WARNING_RATIO
      ? `${formatSignedCm(value! - previous!.valueCm)} cm depuis la dernière fois : vérifiez cette mesure`
      : undefined,
  }
}))

const filledCount = computed(() => fields.value.filter(f => f.value !== null && !f.error).length)

const dateError = computed(() => {
  if (!submitted.value) return undefined
  if (!date.value) return 'Choisissez une date'
  if (date.value > today) return 'La date ne peut pas être dans le futur'
  const conflict = otherSessions.value.find(s => s.date === date.value)
  if (conflict) return `Une séance existe déjà le ${format(parseISO(conflict.date), 'd MMMM', { locale: fr })} : modifiez-la plutôt`
  return undefined
})

const formError = computed(() =>
  submitted.value && filledCount.value === 0 ? 'Renseignez au moins une zone pour enregistrer la séance' : undefined,
)

function focusNext(index: number) {
  const next = MEASUREMENT_ZONES[index + 1]
  if (next) document.getElementById(`zone-${next.key}`)?.focus()
  else onSubmit()
}

function onSubmit() {
  submitted.value = true
  if (dateError.value || formError.value || fields.value.some(f => f.error)) return
  const values: MeasurementSession['values'] = {}
  for (const field of fields.value) {
    if (field.value !== null) values[field.zone.key] = Math.round(field.value * 10) / 10
  }
  emit('save', { date: date.value, values })
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="isEdit ? 'Modifier la séance' : 'Nouvelle séance'"
    description="Ruban à même la peau, ajusté sans serrer. Laissez vide une zone non mesurée."
    :ui="{ content: 'sm:max-w-md', footer: 'justify-end' }"
  >
    <template #body>
      <form id="measurement-session-form" class="flex flex-col gap-5" novalidate @submit.prevent="onSubmit">
        <UFormField label="Date" :error="dateError" required>
          <UInput
            v-model="date"
            type="date"
            :max="today"
            icon="i-lucide-calendar"
            class="w-full"
          />
        </UFormField>

        <ol class="flex flex-col divide-y divide-default border-y border-default">
          <li v-for="(field, index) in fields" :key="field.zone.key" class="flex flex-col gap-1.5 py-3.5">
            <div class="flex items-center gap-3">
              <label :for="`zone-${field.zone.key}`" class="flex-1 text-sm font-semibold text-highlighted">
                {{ field.zone.label }}
              </label>
              <span v-if="field.previous" class="text-xs tabular-nums text-dimmed">
                Dernière : {{ formatCm(field.previous.valueCm) }}
              </span>
              <UInput
                :id="`zone-${field.zone.key}`"
                v-model="inputs[field.zone.key]"
                inputmode="decimal"
                autocomplete="off"
                :placeholder="field.previous ? formatCm(field.previous.valueCm) : '—'"
                :enterkeyhint="index < fields.length - 1 ? 'next' : 'done'"
                :color="field.error ? 'error' : field.warning ? 'warning' : undefined"
                :highlight="!!field.error || !!field.warning"
                :autofocus="index === 0"
                class="w-28"
                :ui="{ base: 'text-end font-semibold tabular-nums', trailing: 'pointer-events-none' }"
                @keydown.enter.prevent="focusNext(index)"
              >
                <template #trailing>
                  <span class="text-xs text-muted">cm</span>
                </template>
              </UInput>
            </div>
            <p class="text-xs text-dimmed">
              {{ field.zone.howTo }}
            </p>
            <p v-if="field.error" class="text-xs text-error">
              {{ field.error }}
            </p>
            <p v-else-if="field.warning" class="flex items-center gap-1.5 text-xs text-warning">
              <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" aria-hidden="true" />
              {{ field.warning }}
            </p>
          </li>
        </ol>

        <p v-if="formError" class="text-sm text-error">
          {{ formError }}
        </p>
      </form>
    </template>

    <template #footer>
      <p class="me-auto text-xs tabular-nums text-dimmed">
        {{ filledCount }} / {{ MEASUREMENT_ZONES.length }} zones
      </p>
      <UButton
        label="Annuler"
        color="neutral"
        variant="ghost"
        @click="open = false"
      />
      <UButton
        type="submit"
        form="measurement-session-form"
        label="Enregistrer"
        icon="i-lucide-check"
      />
    </template>
  </USlideover>
</template>
