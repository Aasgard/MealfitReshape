<script setup lang="ts">
import type { DishStorage } from '~/types/preparedDish'
import { dishStorageOf, formatDishDay, formatParts } from '~/utils/preparedDishes'

/**
 * Confirmation de « Mettre au stock » sur un repas d'une recette : il quitte les menus et ses parts rejoignent le stock,
 * cuisinées avec sa fournée. Le rangement se choisit, sauf quand le surplus de la fournée existe déjà (on le rejoint).
 */
const props = defineProps<{
  label: string
  parts: number
  /** Jour de cuisine de la fournée du repas, `yyyy-MM-dd`. */
  cookDay: string
  /** La fournée est déjà cuisinée (jour de cuisine passé ou aujourd'hui). */
  isCooked: boolean
  /** Rangement du surplus déjà prévu pour cette fournée, s'il y en a un : les parts le rejoignent. */
  existingStorage?: DishStorage | null
  saving?: boolean
}>()

const emit = defineEmits<{
  confirm: [storage: DishStorage]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const storage = ref<DishStorage>('FRIDGE')
watch(open, (isOpen) => {
  if (isOpen) storage.value = props.existingStorage ?? 'FRIDGE'
})

const confirm = () => {
  emit('confirm', storage.value)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Mettre au stock"
    :description="`${label} · ${formatParts(parts)}`"
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-sm', footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          Le repas est retiré du menu.
          <template v-if="isCooked">
            Ses {{ formatParts(parts) }}, cuisinées le {{ formatDishDay(cookDay) }}, sont disponibles tout de suite dans le stock.
          </template>
          <template v-else>
            Ses {{ formatParts(parts) }} restent à cuisiner le {{ formatDishDay(cookDay) }} avec la fournée, puis rejoignent le stock.
            La liste de courses ne change pas.
          </template>
        </p>

        <p v-if="existingStorage" class="flex items-center gap-2 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
          <UIcon :name="dishStorageOf(existingStorage).icon" class="size-4 shrink-0 text-primary" aria-hidden="true" />
          Elles rejoignent le surplus déjà prévu ({{ dishStorageOf(existingStorage).label.toLowerCase() }}).
        </p>
        <UFormField v-else label="Rangement">
          <DishStorageSelect v-model="storage" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton label="Mettre au stock" icon="i-lucide-archive" :loading="saving" @click="confirm" />
    </template>
  </UModal>
</template>
