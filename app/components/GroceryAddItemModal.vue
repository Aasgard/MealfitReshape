<script setup lang="ts">
/**
 * Ajout manuel d'un article : nom, rayon et quantité (facultative, texte libre).
 * Le rayon choisi est gardé d'un ajout à l'autre : on ajoute souvent plusieurs articles du même rayon.
 * Écran tactile : panneau du bas, remonté au-dessus du clavier, pour tout voir sans défiler ; sinon une modale.
 */
import { createReusableTemplate, useMediaQuery } from '@vueuse/core'

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const list = useInjectedGroceryList()
const [DefineForm, ReuseForm] = createReusableTemplate()

const isTouch = useMediaQuery('(pointer: coarse)')
useKeyboardInset(() => open.value && isTouch.value)

const label = ref('')
const aisleId = ref(MISC_AISLE.id)
const quantity = ref('')
const submitted = ref(false)

const aisleItems = computed(() =>
  list.aisleOptions.map(aisle => ({ label: aisle.label, value: aisle.id, icon: categoryIconName(aisle.icon) })))

watch(open, (isOpen) => {
  if (!isOpen) return
  label.value = ''
  quantity.value = ''
  submitted.value = false
})

const labelError = computed(() => (submitted.value && !label.value.trim() ? 'Donnez un nom à l\'article.' : undefined))

function onSubmit() {
  submitted.value = true
  if (labelError.value) return
  const aisle = list.aisleOptions.find(a => a.id === aisleId.value)
  if (list.addManual(label.value, aisle, quantity.value)) open.value = false
}

function close() {
  open.value = false
}
</script>

<template>
  <DefineForm>
    <form class="flex flex-col gap-3" novalidate @submit.prevent="onSubmit">
      <UFormField label="Nom" :error="labelError" required>
        <UInput
          v-model="label"
          placeholder="Ex. : éponges, café moulu"
          autocomplete="off"
          autofocus
          enterkeyhint="done"
          maxlength="80"
          class="w-full"
        />
      </UFormField>

      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Rayon" class="min-w-0">
          <USelectMenu
            v-model="aisleId"
            :items="aisleItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Quantité" class="min-w-0">
          <UInput
            v-model="quantity"
            placeholder="Facultatif"
            autocomplete="off"
            enterkeyhint="done"
            maxlength="40"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="mt-1 flex justify-end gap-2">
        <UButton label="Annuler" color="neutral" variant="ghost" @click="close" />
        <UButton type="submit" label="Ajouter" icon="i-lucide-plus" :class="isTouch && 'flex-1 justify-center'" />
      </div>
    </form>
  </DefineForm>

  <UDrawer
    v-if="isTouch"
    v-model:open="open"
    title="Ajouter un article"
    :ui="{ content: KEYBOARD_AWARE_DRAWER_CONTENT, body: 'pb-2' }"
  >
    <template #body>
      <ReuseForm />
    </template>
  </UDrawer>

  <UModal
    v-else
    v-model:open="open"
    title="Ajouter un article"
    :ui="{ content: 'sm:max-w-sm' }"
  >
    <template #body>
      <ReuseForm />
    </template>
  </UModal>
</template>
