<script setup lang="ts">
/**
 * Durée saisie dans une seule case au format heures:minutes (marche, randonnée), stockée en minutes.
 * Le clavier numérique d'un téléphone n'a pas de « : » : il est inséré tout seul avant les deux derniers chiffres
 * (« 235 » → « 2:35 ») ; tant qu'il n'y en a que deux, ce sont des heures.
 */
const props = defineProps<{
  /** Durée en minutes ; `null` = non renseignée. */
  modelValue: number | null
  /** Durée grisée affichée quand la case est vide (la dernière fois). */
  placeholder?: number | null
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
}>()

const format = (minutes: number | null) =>
  minutes === null ? '' : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

const text = ref(format(props.modelValue))
const focused = ref(false)

watch(() => props.modelValue, (value) => {
  if (!focused.value) text.value = format(value)
})

/** Garde les chiffres (4 au plus) et place le « : » avant les minutes. */
function mask(raw: string): string {
  const [h = '', m] = raw.split(':')
  if (m !== undefined) return `${h.replace(/\D/g, '').slice(0, 2)}:${m.replace(/\D/g, '').slice(0, 2)}`
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, -2)}:${digits.slice(-2)}` : digits
}

/** « 2:35 » → 155, « 2 » → 120 ; `undefined` tant que la saisie n'est pas une durée (minutes ≥ 60). */
function parse(value: string): number | null | undefined {
  if (!value) return null
  const [h = '', m = ''] = value.split(':')
  const hours = Number(h || 0)
  const minutes = Number(m || 0)
  if (minutes >= 60) return undefined
  return hours * 60 + minutes || null
}

function onInput(value: string | number) {
  text.value = mask(String(value))
  const minutes = parse(text.value)
  if (minutes !== undefined) emit('update:modelValue', minutes)
}

function onBlur() {
  focused.value = false
  text.value = format(props.modelValue)
}
</script>

<template>
  <UInput
    :model-value="text"
    inputmode="numeric"
    autocomplete="off"
    :placeholder="placeholder ? format(placeholder) : '__:__'"
    :aria-label="`${label}, en heures et minutes`"
    size="lg"
    class="w-full"
    :ui="{ base: 'text-end font-semibold tabular-nums placeholder:font-normal', trailing: 'pointer-events-none pe-2' }"
    @update:model-value="onInput"
    @focus="focused = true; ($event.target as HTMLInputElement).select()"
    @blur="onBlur"
  >
    <template #trailing>
      <span class="text-xs text-dimmed">h</span>
    </template>
  </UInput>
</template>
