<script setup lang="ts">
/**
 * Magasins à cocher pour un article, plusieurs articles ou un ingrédient. Chaque geste s'applique aussitôt (le parent
 * écrit) ; aucun coché : partout. « En partie » pour une sélection dont certains articles seulement ont le magasin : le
 * cocher l'ajoute à tous. En bas, la création d'un magasin, et, si `rememberLabel` est fourni, la case qui retient le
 * choix pour les prochaines fois.
 */
import type { StoreCheckState } from '~/composables/useGroceryList'
import type { Store } from '~/types/store'
import { STORE_NAME_MAX } from '~/utils/stores'

defineProps<{
  stores: Store[]
  states: Map<string, StoreCheckState>
  /** Libellé de la case « Retenir » ; sans lui, pas de case. */
  rememberLabel?: string
  /** Tactile : cibles plus hautes. */
  large?: boolean
}>()

const remember = defineModel<boolean>('remember', { default: true })

const emit = defineEmits<{
  toggle: [storeId: string, on: boolean]
  create: [name: string]
}>()

const newName = ref('')

function create() {
  const name = newName.value.trim()
  if (!name) return
  emit('create', name)
  newName.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <ul v-if="stores.length" class="flex flex-col">
      <li v-for="store in stores" :key="store.id">
        <UCheckbox
          :model-value="states.get(store.id) ?? false"
          :size="large ? 'lg' : 'md'"
          :aria-label="store.name"
          :ui="{
            root: `w-full cursor-pointer items-center rounded-md px-2 transition-colors hover:bg-elevated ${large ? 'min-h-12' : 'min-h-9'}`,
            wrapper: 'min-w-0 flex-1',
            label: 'cursor-pointer text-sm font-medium',
          }"
          @update:model-value="emit('toggle', store.id, states.get(store.id) !== true)"
        >
          <template #label>
            <StoreName :store="store" />
          </template>
        </UCheckbox>
      </li>
    </ul>
    <p v-else class="px-2 text-sm text-muted">
      Aucun magasin pour l'instant.
    </p>

    <p class="px-2 text-xs text-dimmed">
      Aucun coché : visible dans tous les magasins.
    </p>

    <form class="flex gap-2 border-t border-default pt-3" @submit.prevent="create">
      <UInput
        v-model="newName"
        placeholder="Nouveau magasin"
        aria-label="Nom du nouveau magasin"
        autocomplete="off"
        enterkeyhint="done"
        :maxlength="STORE_NAME_MAX"
        :size="large ? 'lg' : 'sm'"
        class="min-w-0 flex-1"
      />
      <UButton
        type="submit"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :size="large ? 'lg' : 'sm'"
        :disabled="!newName.trim()"
        aria-label="Créer le magasin"
      />
    </form>

    <UCheckbox
      v-if="rememberLabel"
      v-model="remember"
      :label="rememberLabel"
      description="Les prochaines fois que l'ingrédient arrive dans la liste."
      :size="large ? 'lg' : 'sm'"
      :ui="{ root: 'border-t border-default px-2 pt-3', label: 'text-sm', description: 'text-xs text-dimmed' }"
    />
  </div>
</template>
