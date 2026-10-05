<script setup lang="ts">
import { parsePositiveNumber } from '~/utils/numberInput'
import type { GoalDirection } from '~/utils/profile'

/**
 * Déficit (perte) ou surplus (prise) calorique en % de la dépense journalière : pourcentages proposés + champ « Autre ».
 * Partagé par l'objectif du profil et le calculateur de besoins journaliers, pour qu'ils proposent la même liste.
 */
const props = withDefaults(defineProps<{
  direction: Exclude<GoalDirection, 'maintain'>
  size?: 'sm' | 'md'
}>(), {
  size: 'sm',
})

const percent = defineModel<number>({ required: true })
/** Erreur de saisie du champ « Autre », affichée par le parent (sous la ligne ou le champ de formulaire). */
const error = defineModel<string | undefined>('error')

const percents = computed(() => GOAL_CALORIE_PERCENTS[props.direction])
const isCustom = computed(() => !percents.value.includes(percent.value))
const customDraft = () => (isCustom.value ? formatNumber(percent.value, 1) : '')

const draft = ref(customDraft())
// Valeur changée ailleurs (Firestore, autre sens) : on recale le champ, sauf s'il affiche une saisie à corriger.
watch([percent, () => props.direction], () => {
  if (!error.value) draft.value = customDraft()
})

const noun = computed(() => (props.direction === 'loss' ? 'déficit' : 'surplus'))
const label = (value: number) => `${props.direction === 'loss' ? '−' : '+'}${formatNumber(value, 1)} %`

function select(value: number) {
  error.value = undefined
  percent.value = value
  draft.value = !percents.value.includes(value) ? formatNumber(value, 1) : ''
}

/** Champ « Autre » : un pourcentage libre, borné selon le sens ; vide = on garde le pourcentage actuel. */
function commit() {
  const raw = draft.value.trim().replace(/%$/, '')
  if (!raw) {
    error.value = undefined
    draft.value = customDraft()
    return
  }
  const value = parsePositiveNumber(raw)
  const { min, max } = GOAL_CALORIE_PERCENT_LIMITS[props.direction]
  if (value === null) {
    error.value = 'Entrez un nombre valide'
    return
  }
  if (value < min || value > max) {
    error.value = `Entre ${formatNumber(min)} et ${formatNumber(max)} % de la dépense`
    return
  }
  // Arrondi au dixième ; une valeur égale à un pourcentage proposé sélectionne son bouton.
  select(Math.round(value * 10) / 10)
}
</script>

<template>
  <UFieldGroup :size="size" class="w-full sm:w-auto">
    <UButton
      v-for="value in percents"
      :key="value"
      :label="label(value)"
      :color="percent === value ? 'primary' : 'neutral'"
      :variant="percent === value ? 'solid' : 'outline'"
      :aria-pressed="percent === value"
      :aria-label="`${label(value)} de la dépense journalière`"
      class="flex-1 justify-center whitespace-nowrap tabular-nums sm:flex-none"
      @click="select(value)"
    />
    <UInput
      v-model="draft"
      inputmode="decimal"
      placeholder="Autre"
      :size="size"
      :color="error ? 'error' : isCustom ? 'primary' : 'neutral'"
      :highlight="!!error || isCustom"
      :aria-label="`Autre ${noun}, en % de la dépense journalière`"
      :aria-invalid="!!error"
      class="min-w-16 flex-1 sm:w-20 sm:flex-none"
      :ui="{ base: 'text-center tabular-nums' }"
      @change="commit"
    />
  </UFieldGroup>
</template>
