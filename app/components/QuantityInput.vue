<script setup lang="ts">
/**
 * Quantité en texte libre qui ouvre d'abord le clavier numérique du téléphone ; un bouton dans le champ bascule vers le
 * clavier texte (« 2 paquets ») et retour. Les autres attributs vont au `UInput`.
 * Le clavier ne change qu'en reprenant le focus : le bouton le retire puis le rend au champ.
 * En `type="search"`, comme les champs de nom (voir `NAME_FIELD_BASE`) : sans barre de mots de passe sur Android.
 */
import { useMediaQuery } from '@vueuse/core'

const model = defineModel<string>({ required: true })

const isTouch = useMediaQuery('(pointer: coarse)')
const isText = ref(false)
const input = useTemplateRef('input')

const inputMode = computed(() => (isText.value ? 'text' : 'decimal'))

/** Attribut posé à la main pour reprendre le focus sans attendre le rendu : hors du geste, iOS n'ouvre pas le clavier. */
function toggleKeyboard() {
  isText.value = !isText.value
  const el = input.value?.inputRef
  if (!el) return
  el.setAttribute('inputmode', inputMode.value)
  el.blur()
  el.focus()
}
</script>

<template>
  <UInput
    ref="input"
    v-model="model"
    :inputmode="inputMode"
    type="search"
    autocomplete="off"
    spellcheck="false"
    data-form-type="other"
    data-lpignore="true"
    :ui="{ base: NAME_FIELD_BASE, ...(isTouch ? { trailing: 'pe-1' } : {}) }"
  >
    <template v-if="isTouch" #trailing>
      <UButton
        :icon="isText ? 'i-lucide-hash' : 'i-lucide-type'"
        :aria-label="isText ? 'Clavier numérique' : 'Clavier texte'"
        color="neutral"
        variant="link"
        size="sm"
        @pointerdown.prevent
        @click="toggleKeyboard"
      />
    </template>
  </UInput>
</template>
