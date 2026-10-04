<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * Un seul menu d'actions pour toute une liste, ancré sur le bouton « ⋮ » cliqué :
 * évite de monter un UDropdownMenu par ligne, coûteux sur des dizaines de lignes.
 * Le bouton de chaque ligne appelle `toggle(event)` via la ref exposée ; le parent fournit les items de la ligne visée.
 */
defineProps<{
  items: DropdownMenuItem[][]
}>()

const open = ref(false)
const anchor = shallowRef<HTMLElement | null>(null)
/** Le menu se ferme au pointerdown extérieur, avant le click : sans ce repère, recliquer sur « ⋮ » le rouvrirait aussitôt. */
let lastClose = { anchor: null as HTMLElement | null, at: 0 }

const toggle = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement
  if (lastClose.anchor === target && performance.now() - lastClose.at < 300) return
  anchor.value = target
  open.value = true
}

const onOpenChange = (value: boolean) => {
  if (!value) lastClose = { anchor: anchor.value, at: performance.now() }
  open.value = value
}

/** Sans déclencheur Reka, le focus ne revient pas seul : on le rend au bouton « ⋮ » d'origine. */
const onCloseAutoFocus = (event: Event) => {
  event.preventDefault()
  anchor.value?.focus()
}

defineExpose({ toggle, isOpenFor: (el: HTMLElement | null) => open.value && anchor.value === el })
</script>

<template>
  <UDropdownMenu
    v-if="anchor"
    :open="open"
    :items="items"
    :content="{ reference: anchor, align: 'end', onCloseAutoFocus }"
    :ui="{ content: 'w-40' }"
    @update:open="onOpenChange"
  />
</template>
