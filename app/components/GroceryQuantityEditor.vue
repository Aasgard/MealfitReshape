<script setup lang="ts">
/**
 * Quantité d'un article, modifiable en texte libre ("3 pièces", "2 paquets").
 * Vider le champ, ou « Revenir au calcul », rétablit la quantité calculée depuis les menus.
 * - Souris : un clic ouvre l'édition dans un popover.
 * - Toucher : un appui long ouvre l'édition dans un panneau en bas d'écran (stable quand le clavier s'ouvre) ;
 *   un appui court ne fait rien (en magasin, seul le rond coche l'article).
 * - Clavier : Entrée ouvre le popover.
 */
import { createReusableTemplate } from '@vueuse/core'
import type { GroceryLine } from '~/utils/groceryList'

const props = withDefaults(defineProps<{
  line: GroceryLine
  /** `store` : cible plus grande et quantité en gras, pour le mode magasin. */
  variant?: 'prepare' | 'store'
}>(), { variant: 'prepare' })

const list = useInjectedGroceryList()
const [DefineForm, ReuseForm] = createReusableTemplate()

/** Édition ouverte, dans le popover (souris, clavier) ou le panneau du bas (toucher). */
const popoverOpen = ref(false)
const drawerOpen = ref(false)
const draft = ref('')

function edit(byTouch: boolean) {
  draft.value = props.line.quantityLabel
  if (byTouch) drawerOpen.value = true
  else popoverOpen.value = true
}

const trigger = useTemplateRef('trigger')
const { onPointerDown, onClick } = usePressToEdit(trigger, edit)

/** Remonte le panneau du bas au-dessus du clavier (iOS). */
useKeyboardInset(drawerOpen)

/** Quantité présélectionnée à l'ouverture : on tape directement la nouvelle. Différé, sinon iOS annule la sélection au focus. */
function selectAll(event: FocusEvent) {
  const input = event.target as HTMLInputElement
  requestAnimationFrame(() => input.select())
}

function close() {
  popoverOpen.value = false
  drawerOpen.value = false
}

function save() {
  list.setQuantity(props.line, draft.value)
  close()
}

function resetToComputed() {
  list.setQuantity(props.line, null)
  close()
}
</script>

<template>
  <DefineForm v-slot="{ isDrawer }">
    <form
      class="flex flex-col gap-3"
      :class="isDrawer ? 'pb-2' : 'w-[min(18rem,calc(100vw-2rem))] p-3'"
      @submit.prevent="save"
    >
      <UFormField :label="isDrawer ? undefined : `Quantité · ${line.label}`" :ui="{ label: 'truncate' }">
        <UInput
          v-model="draft"
          autofocus
          :size="isDrawer ? 'xl' : 'md'"
          :placeholder="line.computedQuantityLabel || 'ex. 2 paquets'"
          :aria-label="`Quantité de ${line.label}`"
          enterkeyhint="done"
          autocomplete="off"
          class="w-full"
          @focus="selectAll"
        />
      </UFormField>
      <p v-if="line.computedQuantityLabel" class="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted">
        <span>Calculé depuis les menus : <span class="tabular-nums text-highlighted">{{ line.computedQuantityLabel }}</span></span>
        <UButton
          v-if="line.isQuantityEdited"
          label="Revenir au calcul"
          color="primary"
          variant="link"
          size="xs"
          class="p-0"
          @click="resetToComputed"
        />
      </p>
      <div class="flex justify-end gap-2" :class="isDrawer && 'mt-1'">
        <UButton label="Annuler" color="neutral" variant="ghost" :size="isDrawer ? 'lg' : 'sm'" @click="close" />
        <UButton type="submit" label="Enregistrer" :size="isDrawer ? 'lg' : 'sm'" :class="isDrawer && 'flex-1 justify-center'" />
      </div>
    </form>
  </DefineForm>

  <UPopover v-model:open="popoverOpen" :content="{ align: 'end', side: 'bottom' }">
    <template #anchor>
      <button
        ref="trigger"
        type="button"
        class="quantity-trigger flex min-w-0 max-w-[45%] shrink-0 cursor-pointer select-none items-center rounded-md text-end tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-primary active:bg-elevated pointer-fine:hover:bg-elevated"
        :class="[
          variant === 'store' ? 'min-h-11 px-2.5 text-sm font-semibold' : 'px-2 py-1 text-sm',
          line.quantityLabel
            ? (variant === 'store' ? 'text-highlighted' : 'text-muted')
            : 'text-dimmed',
        ]"
        :aria-label="`${line.quantityLabel ? `Quantité de ${line.label} : ${line.quantityLabel}` : `Aucune quantité pour ${line.label}`}, modifier`"
        @pointerdown="onPointerDown"
        @click="onClick"
        @contextmenu.prevent
      >
        <span v-if="line.quantityLabel" class="truncate">{{ line.quantityLabel }}</span>
        <span v-else class="text-xs font-normal">Qté</span>
      </button>
    </template>

    <template #content>
      <ReuseForm :is-drawer="false" />
    </template>
  </UPopover>

  <UDrawer
    v-model:open="drawerOpen"
    :title="line.label"
    description="Quantité à acheter"
    :ui="{ content: KEYBOARD_AWARE_DRAWER_CONTENT }"
  >
    <template #body>
      <ReuseForm :is-drawer="true" />
    </template>
  </UDrawer>
</template>

<style scoped>
/* Pas de loupe ni de menu « Copier » d'iOS pendant l'appui long. */
.quantity-trigger {
  -webkit-touch-callout: none;
}
</style>
