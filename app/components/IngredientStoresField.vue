<script setup lang="ts">
/**
 * Fiche ingrédient : où l'acheter. Mémoire du foyer, portée par ses magasins (`Store.ingredientIds`), jamais par
 * l'ingrédient : un ingrédient du catalogue est partagé avec tous, ses magasins ne valent que pour le foyer. Chaque
 * coche s'enregistre aussitôt et vaut pour les prochaines fois qu'il arrive dans la liste ; s'il y est déjà avec
 * d'autres magasins, on propose d'y reporter le choix.
 */
import type { StoreCheckState } from '~/composables/useGroceryList'
import { storeNameKey } from '~/utils/stores'

const props = withDefaults(defineProps<{
  ingredientId: string
  /** Style du titre « Où l'acheter », celui des autres sections de la fiche. */
  titleClass?: string
}>(), { titleClass: 'text-sm font-semibold text-highlighted' })

const toast = useToast()
const shoppingList = useShoppingList()
const stores = shoppingList.stores

const current = computed(() => stores.storesForIngredient(props.ingredientId))
const currentStores = computed(() => current.value.flatMap(id => stores.storesById.value.get(id) ?? []))
const states = computed(() => new Map<string, StoreCheckState>(stores.stores.value.map(store => [store.id, current.value.includes(store.id)])))

const saved = ref(0)

function fail(action: string) {
  return (error: any) => toast.add({ title: action, description: error?.message || 'Vérifiez la connexion, puis réessayez.', color: 'error', icon: 'i-lucide-circle-alert' })
}

function write(storeIds: string[]) {
  stores.setIngredientStores(new Map([[props.ingredientId, storeIds]]))
    .then(() => saved.value++)
    .catch(fail('Magasins non enregistrés'))
}

function onToggle(storeId: string, on: boolean) {
  write(on ? [...current.value, storeId] : current.value.filter(id => id !== storeId))
}

/** Crée le magasin (ou reprend celui du même nom) et y range l'ingrédient. */
async function onCreate(name: string) {
  const twin = stores.stores.value.find(store => storeNameKey(store.name) === storeNameKey(name))
  const error = twin ? undefined : stores.nameError(name)
  if (error) {
    toast.add({ title: 'Magasin non créé', description: error, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  try {
    const id = twin?.id ?? await stores.add(name)
    if (!current.value.includes(id)) write([...current.value, id])
  }
  catch (err) {
    fail('Magasin non créé')(err)
  }
}

/** Articles de la liste venus de cet ingrédient, encore à acheter, rangés autrement que la mémoire. */
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id))
const outOfSync = computed(() => shoppingList.items.value.filter(item =>
  item.status === 'toBuy'
  && (item.ingredientId ?? item.complementOf?.ingredientId ?? item.linkedIngredientId) === props.ingredientId
  && !sameIds(stores.knownStoreIds(item.storeIds), current.value)))

const isApplying = ref(false)
async function applyToList() {
  isApplying.value = true
  try {
    await shoppingList.setItemsStores(outOfSync.value.map(item => ({ item, storeIds: current.value })))
    toast.add({ title: 'Liste de courses mise à jour', color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    fail('Liste de courses non mise à jour')(error)
  }
  finally {
    isApplying.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between gap-3">
      <h3 :class="titleClass">
        Où l'acheter
      </h3>
      <SavedHint :stamp="saved" />
    </div>

    <div class="flex items-center justify-between gap-3">
      <p v-if="currentStores.length" class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
        <StoreName v-for="store in currentStores" :key="store.id" :store="store" />
      </p>
      <p v-else class="text-sm text-dimmed">
        Partout
      </p>
      <UPopover :content="{ align: 'end', side: 'bottom' }">
        <UButton
          label="Choisir"
          trailing-icon="i-lucide-chevron-down"
          color="neutral"
          variant="outline"
          size="xs"
          class="shrink-0"
          :disabled="stores.loading.value"
        />
        <template #content>
          <div class="w-[min(17rem,calc(100vw-2rem))] p-2">
            <StoreChecklist
              :stores="stores.stores.value"
              :states="states"
              @toggle="onToggle"
              @create="onCreate"
            />
          </div>
        </template>
      </UPopover>
    </div>

    <div
      v-if="outOfSync.length"
      class="flex flex-col gap-2 rounded-md bg-elevated px-3 py-2 sm:flex-row sm:items-center"
    >
      <p class="flex-1 text-xs text-muted">
        Déjà dans la liste de courses, avec d'autres magasins.
      </p>
      <UButton
        label="Appliquer à la liste"
        color="neutral"
        variant="outline"
        size="xs"
        class="self-start sm:self-auto"
        :loading="isApplying"
        @click="applyToList"
      />
    </div>
  </div>
</template>
