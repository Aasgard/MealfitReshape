<script setup lang="ts">
/**
 * Saisie d'un nombre entier par un pavé numérique de l'appli (panneau du bas), sans ouvrir le clavier du téléphone :
 * le clavier système affiche au-dessus de lui la barre de remplissage automatique d'Android (mots de passe, clés),
 * qu'une page web ne peut pas désactiver. Sert aux répétitions d'un circuit, notées entre deux efforts.
 */
const props = withDefaults(defineProps<{
  modelValue: number | null
  /** Ce qui est saisi, en titre du pavé et pour les lecteurs d'écran. */
  label: string
  placeholder?: string
  /** Case étroite (tableau) ou grande case (minuteur). */
  size?: 'compact' | 'lg'
  /** Nombre de chiffres au plus. */
  maxDigits?: number
}>(), {
  placeholder: '—',
  size: 'compact',
  maxDigits: 4,
})

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
}>()

const open = ref(false)
useOverlayBackClose(open)

/** Chiffres tapés depuis l'ouverture ; le premier chiffre remplace la valeur affichée. */
const draft = ref('')
const touched = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  draft.value = props.modelValue === null ? '' : String(props.modelValue)
  touched.value = false
})

function press(digit: string) {
  const base = touched.value ? draft.value : ''
  touched.value = true
  const next = (base + digit).replace(/^0+(?=\d)/, '')
  if (next.length <= props.maxDigits) draft.value = next
}

function erase() {
  touched.value = true
  draft.value = draft.value.slice(0, -1)
}

function confirm() {
  emit('update:modelValue', draft.value === '' ? null : Number(draft.value))
  open.value = false
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
</script>

<template>
  <UDrawer v-model:open="open" :title="label" :ui="{ content: 'max-w-sm mx-auto', body: 'pb-6' }">
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-center rounded-md bg-default font-semibold tabular-nums ring ring-inset ring-accented transition-colors hover:ring-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
      :class="[
        size === 'lg' ? 'h-14' : 'h-10',
        modelValue === null
          ? [size === 'lg' ? 'text-base' : 'text-sm', 'font-normal text-dimmed']
          : [size === 'lg' ? 'text-3xl' : 'text-sm', 'text-highlighted'],
      ]"
      :aria-label="`${label} : ${modelValue ?? 'non renseigné'}`"
    >
      {{ modelValue ?? placeholder }}
    </button>

    <template #body>
      <div class="flex flex-col gap-4">
        <p
          class="flex h-16 items-center justify-center rounded-lg bg-elevated text-4xl font-bold tabular-nums"
          :class="draft ? 'text-highlighted' : 'text-dimmed'"
          aria-live="polite"
        >
          {{ draft || '—' }}
        </p>
        <div class="grid grid-cols-3 gap-2">
          <UButton
            v-for="key in KEYS"
            :key="key"
            :label="key"
            color="neutral"
            variant="outline"
            size="xl"
            class="h-14 justify-center text-xl font-semibold tabular-nums"
            @click="press(key)"
          />
          <UButton
            icon="i-lucide-delete"
            color="neutral"
            variant="ghost"
            size="xl"
            class="h-14 justify-center"
            aria-label="Effacer le dernier chiffre"
            @click="erase"
          />
          <UButton
            label="0"
            color="neutral"
            variant="outline"
            size="xl"
            class="h-14 justify-center text-xl font-semibold tabular-nums"
            @click="press('0')"
          />
          <UButton
            icon="i-lucide-check"
            size="xl"
            class="h-14 justify-center"
            aria-label="Valider"
            @click="confirm"
          />
        </div>
      </div>
    </template>
  </UDrawer>
</template>
