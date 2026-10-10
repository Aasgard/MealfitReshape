<script setup lang="ts">
/**
 * Champ numérique d'une série ou d'une sortie : accepte la virgule, garde ce qui est tapé tant qu'il a le focus
 * (« 42, » n'est pas encore un nombre) et n'émet que des valeurs valides, `null` quand il est vidé.
 */
const props = withDefaults(defineProps<{
  modelValue: number | null
  /** Valeur grisée affichée quand le champ est vide (la dernière fois, l'objectif). */
  placeholder?: string
  unit?: string
  integer?: boolean
  label: string
  size?: 'md' | 'lg'
  /**
   * Champ « en texte » : chiffre en gras comme une valeur affichée, souligné en pointillés pour dire qu'il se modifie
   * (relevé d'une séance). L'unité est alors affichée par le parent, à côté.
   */
  bare?: boolean
  /** Case étroite (tableau de répétitions) : chiffre centré, presque sans marge intérieure. */
  compact?: boolean
}>(), {
  placeholder: '—',
  unit: undefined,
  integer: false,
  size: 'lg',
})

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
}>()

/** Entier : chiffres seuls (« 1200 », pas « 1 200 », que refuserait un champ numérique). */
const format = (value: number | null) => value === null ? '' : props.integer ? String(Math.round(value)) : formatDecimal(value, 2)

/**
 * Entier : vrai champ numérique. Chrome n'y propose pas sa barre de remplissage (mots de passe, clés) au-dessus du
 * clavier, qu'il affiche sur un champ texte malgré `autocomplete="off"`. Décimal : champ texte, pour accepter la virgule.
 */
const fieldAttrs = computed(() => props.integer
  ? { type: 'number', inputmode: 'numeric' as const, pattern: '[0-9]*', min: 0, step: 1 }
  : { type: 'text', inputmode: 'decimal' as const })

/** Sans les flèches +/- d'un champ numérique. */
const NO_SPIN = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function onFocus(event: FocusEvent) {
  focused.value = true
  try {
    (event.target as HTMLInputElement).select()
  }
  catch {
    // Sélection refusée par certains navigateurs sur un champ numérique : sans conséquence.
  }
}

const text = ref(format(props.modelValue))
const focused = ref(false)

watch(() => props.modelValue, (value) => {
  if (!focused.value) text.value = format(value)
})

function onInput(value: string | number) {
  text.value = String(value)
  if (!text.value.trim()) return emit('update:modelValue', null)
  const parsed = parsePositiveNumber(text.value)
  if (parsed === null) return
  emit('update:modelValue', props.integer ? Math.round(parsed) : Math.round(parsed * 100) / 100)
}

function onBlur() {
  focused.value = false
  text.value = format(props.modelValue)
}
</script>

<template>
  <UInput
    v-if="bare"
    :model-value="text"
    v-bind="fieldAttrs"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
    enterkeyhint="done"
    :placeholder="placeholder"
    :aria-label="label"
    variant="none"
    class="w-full"
    :ui="{ base: `rounded-none border-b border-dashed border-accented p-0 text-end text-lg font-bold tabular-nums text-highlighted placeholder:font-bold focus:border-solid focus:border-primary ${NO_SPIN}` }"
    @update:model-value="onInput"
    @focus="onFocus"
    @blur="onBlur"
  />
  <UInput
    v-else
    :model-value="text"
    v-bind="fieldAttrs"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
    enterkeyhint="done"
    :placeholder="placeholder"
    :aria-label="label"
    :size="size"
    class="w-full"
    :ui="{
      base: `${compact ? 'px-1 text-center' : 'text-end'} font-semibold tabular-nums placeholder:font-normal ${NO_SPIN}`,
      trailing: 'pointer-events-none pe-2',
    }"
    @update:model-value="onInput"
    @focus="onFocus"
    @blur="onBlur"
  >
    <template v-if="unit" #trailing>
      <span class="text-xs text-dimmed">{{ unit }}</span>
    </template>
  </UInput>
</template>
