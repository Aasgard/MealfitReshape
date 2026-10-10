<script setup lang="ts">
/**
 * Nombre de parts d'une recette dans « Ajouter depuis les menus », modifiable sans toucher aux menus (invités, restes
 * à prévoir...). Même geste que la quantité d'un article : appui long au doigt (panneau du bas), clic à la souris ou
 * Entrée au clavier (popover). Enregistrer inclut la recette dans la liste avec ces parts ; les menus ne changent pas.
 */
import { createReusableTemplate } from '@vueuse/core'
import type { GroceryMealRow } from '~/composables/useGroceryList'

const props = defineProps<{
  row: GroceryMealRow
}>()

const list = useInjectedGroceryList()
const [DefineForm, ReuseForm] = createReusableTemplate()

const popoverOpen = ref(false)
const drawerOpen = ref(false)
const draft = ref<number | null>(null)

function edit(byTouch: boolean) {
  draft.value = props.row.parts ?? null
  if (byTouch) drawerOpen.value = true
  else popoverOpen.value = true
}

const trigger = useTemplateRef('trigger')
const { onPointerDown, onClick } = usePressToEdit(trigger, edit)

/** Remonte le panneau du bas au-dessus du clavier (iOS). */
useKeyboardInset(drawerOpen)

const plannedLabel = computed(() => {
  const parts = props.row.plannedParts ?? 0
  return `${parts.toLocaleString('fr-FR')} part${parts > 1 ? 's' : ''}`
})

function close() {
  popoverOpen.value = false
  drawerOpen.value = false
}

function save() {
  list.setRowParts(props.row, draft.value)
  close()
}

function resetToPlanned() {
  list.setRowParts(props.row, null)
  close()
}
</script>

<template>
  <DefineForm v-slot="{ isDrawer }">
    <form
      class="flex flex-col gap-3"
      :class="isDrawer ? 'pb-2' : 'w-[min(16rem,calc(100vw-2rem))] p-3'"
      @submit.prevent="save"
    >
      <UFormField :label="isDrawer ? undefined : `Parts · ${row.label}`" :ui="{ label: 'truncate' }">
        <UInputNumber
          v-model="draft"
          autofocus
          :min="0.5"
          :step="0.5"
          locale="fr-FR"
          :size="isDrawer ? 'xl' : 'md'"
          :aria-label="`Nombre de parts de ${row.label}`"
          class="w-full"
        />
      </UFormField>
      <p class="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted">
        <span>Planifié dans les menus : <span class="tabular-nums text-highlighted">{{ plannedLabel }}</span></span>
        <UButton
          v-if="row.isPartsEdited"
          label="Revenir aux menus"
          color="primary"
          variant="link"
          size="xs"
          class="p-0"
          @click="resetToPlanned"
        />
      </p>
      <div class="flex justify-end gap-2" :class="isDrawer && 'mt-1'">
        <UButton label="Annuler" color="neutral" variant="ghost" :size="isDrawer ? 'lg' : 'sm'" @click="close" />
        <UButton type="submit" label="Enregistrer" :size="isDrawer ? 'lg' : 'sm'" :disabled="!draft" :class="isDrawer && 'flex-1 justify-center'" />
      </div>
    </form>
  </DefineForm>

  <UPopover v-model:open="popoverOpen" :content="{ align: 'end', side: 'bottom' }">
    <template #anchor>
      <button
        ref="trigger"
        type="button"
        class="parts-trigger -me-1.5 flex shrink-0 cursor-pointer select-none items-center gap-1 rounded-md px-1.5 py-0.5 text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-primary active:bg-elevated pointer-fine:hover:bg-elevated"
        :class="row.isPartsEdited ? 'font-semibold text-primary' : 'text-dimmed'"
        :aria-label="`${row.label} : ${row.quantityLabel}${row.isPartsEdited ? `, modifié (${plannedLabel} planifiées)` : ''}, modifier le nombre de parts`"
        @pointerdown="onPointerDown"
        @click="onClick"
        @contextmenu.prevent
      >
        {{ row.quantityLabel }}
      </button>
    </template>

    <template #content>
      <ReuseForm :is-drawer="false" />
    </template>
  </UPopover>

  <UDrawer
    v-model:open="drawerOpen"
    :title="row.label"
    :description="`Parts à prévoir · ${plannedLabel} planifiée${(row.plannedParts ?? 0) > 1 ? 's' : ''}`"
    :ui="{ content: KEYBOARD_AWARE_DRAWER_CONTENT }"
  >
    <template #body>
      <ReuseForm :is-drawer="true" />
    </template>
  </UDrawer>
</template>

<style scoped>
/* Pas de loupe ni de menu « Copier » d'iOS pendant l'appui long. */
.parts-trigger {
  -webkit-touch-callout: none;
}
</style>
