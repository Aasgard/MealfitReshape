<script setup lang="ts">
/**
 * Magasins d'un ou plusieurs articles de la liste, à cocher (voir `StoreChecklist`). Souris : popover sous le
 * déclencheur ; tactile : panneau du bas. Chaque coche s'écrit aussitôt ; la mémoire des ingrédients suit si
 * « Retenir » est coché.
 */
import { createReusableTemplate, useMediaQuery } from '@vueuse/core'
import type { GroceryLine } from '~/utils/groceryList'

const props = withDefaults(defineProps<{
  lines: GroceryLine[]
  /** Titre du panneau tactile. */
  title: string
  /** Plusieurs articles : message de confirmation à chaque coche. */
  announce?: boolean
}>(), { announce: false })

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** Au moins une coche a été écrite pendant l'ouverture : envoyé à la fermeture. */
  changed: []
}>()

const list = useInjectedGroceryList()
const [DefineChecklist, ReuseChecklist] = createReusableTemplate<{ large: boolean }>()
const isTouch = useMediaQuery('(pointer: coarse)')

const states = computed(() => list.storeStatesFor(props.lines))

/** Libellé de « Retenir » : nom de l'ingrédient pour un article seul, sinon générique ; aucun si rien n'a d'ingrédient. */
const rememberLabel = computed(() => {
  const withIngredient = props.lines.filter(line => list.ingredientIdOf(line))
  if (!withIngredient.length) return undefined
  if (props.lines.length === 1) return `Retenir pour ${withIngredient[0]!.label.replace(/ \(complément\)$/, '')}`
  return 'Retenir pour ces ingrédients'
})

let didChange = false
watch(open, (isOpen) => {
  if (isOpen) didChange = false
  else if (didChange) emit('changed')
})

function onToggle(storeId: string, on: boolean) {
  didChange = true
  list.setStoreOn(props.lines, storeId, on, { announce: props.announce })
}

function onCreate(name: string) {
  didChange = true
  list.createStoreFor(props.lines, name, { announce: props.announce })
}
</script>

<template>
  <DefineChecklist v-slot="{ large }">
    <StoreChecklist
      v-model:remember="list.rememberStores"
      :stores="list.stores"
      :states="states"
      :remember-label="rememberLabel"
      :large="large"
      @toggle="onToggle"
      @create="onCreate"
    />
  </DefineChecklist>

  <UDrawer v-if="isTouch" v-model:open="open" :title="title" description="Où l'acheter" :ui="{ body: 'pb-6' }">
    <slot />
    <template #body>
      <ReuseChecklist :large="true" />
    </template>
  </UDrawer>

  <UPopover v-else v-model:open="open" :content="{ align: 'end', side: 'bottom' }">
    <slot />
    <template #content>
      <div class="flex w-[min(17rem,calc(100vw-2rem))] flex-col gap-2 p-2">
        <p class="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-dimmed">
          Où l'acheter
        </p>
        <ReuseChecklist :large="false" />
      </div>
    </template>
  </UPopover>
</template>
