<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { Store } from '~/types/store'
import { STORE_COLORS, STORE_NAME_MAX, storeColor, type StoreColor } from '~/utils/stores'

/**
 * Magasins des réglages : liste à règles fines où chaque nom s'écrit dans sa couleur. Tout se modifie sur place (nom,
 * couleur, rang) et s'enregistre aussitôt ; `saved` est émis après chaque écriture réussie.
 */
const emit = defineEmits<{ saved: [] }>()

const { stores, loading, nameError, add, rename, setColor, reorder, remove, restore } = useStores()
const { household, householdId } = useHousehold()
const toast = useToast()

const shareHint = computed(() => householdId.value && household.value
  ? `Partagés avec le foyer « ${household.value.name} » : chaque membre peut les modifier.`
  : 'Visibles par vous seul. Ils suivront votre liste de courses si vous créez un foyer.')

function save(write: Promise<unknown>, failure: string) {
  write.then(() => emit('saved')).catch((error) => {
    console.error(failure, error)
    toast.add({ title: failure, description: 'Vérifiez la connexion, puis réessayez.', color: 'error', icon: 'i-lucide-circle-alert' })
  })
}

// --- Ajout ---

const newName = ref('')
const addError = ref<string>()

function submitNew() {
  addError.value = nameError(newName.value)
  if (addError.value) return
  save(add(newName.value), 'Magasin non ajouté')
  newName.value = ''
}

watch(newName, () => (addError.value = undefined))

// --- Nom ---

/** Nom en cours de saisie, par magasin ; absent hors saisie (le champ montre le nom enregistré). */
const drafts = reactive<Record<string, string>>({})
const renameErrors = reactive<Record<string, string>>({})

function onNameInput(store: Store, value: string) {
  drafts[store.id] = value
  delete renameErrors[store.id]
}

/** Enregistre le nom saisi ; refusé, il revient au nom enregistré au départ du champ (`revert`). */
function commitName(store: Store, { revert }: { revert: boolean }) {
  const draft = drafts[store.id]
  if (draft === undefined) return true
  if (draft.trim().replace(/\s+/g, ' ') === store.name) {
    delete drafts[store.id]
    return true
  }
  const error = nameError(draft, store.id)
  if (error) {
    renameErrors[store.id] = revert ? `${error} Nom inchangé.` : error
    if (revert) delete drafts[store.id]
    return false
  }
  delete drafts[store.id]
  save(rename(store, draft), 'Magasin non renommé')
  return true
}

function onNameEnter(store: Store, event: KeyboardEvent) {
  if (commitName(store, { revert: false })) (event.target as HTMLInputElement).blur()
}

function onNameEscape(store: Store, event: KeyboardEvent) {
  delete drafts[store.id]
  delete renameErrors[store.id]
  ;(event.target as HTMLInputElement).blur()
}

// --- Couleur ---

const colorOpenFor = ref<string | null>(null)

function pickColor(store: Store, color: StoreColor) {
  colorOpenFor.value = null
  if (color !== store.color) save(setColor(store, color), 'Couleur non enregistrée')
}

// --- Ordre ---

const ordered = computed({
  get: () => stores.value,
  set: list => save(reorder(list), 'Ordre non enregistré'),
})

function move(index: number, delta: -1 | 1) {
  const list = [...stores.value]
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target]!, list[index]!]
  ordered.value = list
  const id = list[target]!.id
  nextTick(() => {
    const same = document.getElementById(`store-${id}-${delta < 0 ? 'up' : 'down'}`) as HTMLButtonElement | null
    const other = document.getElementById(`store-${id}-${delta < 0 ? 'down' : 'up'}`)
    ;(same && !same.disabled ? same : other)?.focus()
  })
}

// --- Suppression ---

function removeStore(store: Store) {
  delete drafts[store.id]
  delete renameErrors[store.id]
  remove(store)
    .then(() => {
      emit('saved')
      toast.add({
        title: `« ${store.name} » supprimé`,
        color: 'neutral',
        icon: 'i-lucide-trash-2',
        actions: [{
          label: 'Annuler',
          color: 'neutral',
          variant: 'outline',
          onClick: () => save(restore(store), 'Magasin non rétabli'),
        }],
      })
    })
    .catch((error) => {
      console.error('Magasin non supprimé', error)
      toast.add({ title: 'Magasin non supprimé', description: 'Vérifiez la connexion, puis réessayez.', color: 'error', icon: 'i-lucide-circle-alert' })
    })
}
</script>

<template>
  <div class="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
    <p class="text-xs text-dimmed text-pretty">
      <template v-if="!loading && !stores.length">
        Ajoutez les magasins où vous faites vos courses.
      </template>
      {{ shareHint }}
    </p>

    <div class="overflow-hidden rounded-lg border border-default">
      <ol v-if="loading" aria-hidden="true">
        <li v-for="n in 2" :key="n" class="flex items-center gap-3 border-b border-default py-2.5 ps-2 pe-3">
          <USkeleton class="size-7 rounded-sm" />
          <USkeleton class="size-3.5 rounded-full" />
          <USkeleton class="h-4 w-32" />
        </li>
      </ol>

      <VueDraggable
        v-else
        v-model="ordered"
        tag="ol"
        handle=".store-handle"
        :animation="180"
        ghost-class="store-ghost"
        chosen-class="store-chosen"
        aria-label="Magasins"
      >
        <li
          v-for="(store, index) in ordered"
          :key="store.id"
          class="flex flex-col border-b border-default bg-default py-1.5 ps-2 pe-1.5"
        >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="store-handle flex size-7 shrink-0 cursor-grab items-center justify-center rounded-sm text-dimmed hover:text-highlighted active:cursor-grabbing"
              :aria-label="`Déplacer ${store.name}`"
              tabindex="-1"
            >
              <UIcon name="i-lucide-grip-vertical" class="size-4" />
            </button>

            <UPopover
              :open="colorOpenFor === store.id"
              :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
              @update:open="open => (colorOpenFor = open ? store.id : null)"
            >
              <button
                type="button"
                class="flex size-7 shrink-0 items-center justify-center rounded-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                :class="storeColor(store.color).text"
                :aria-label="`Couleur de ${store.name} : ${storeColor(store.color).label}. Changer`"
              >
                <span class="size-3.5 rounded-full bg-current" />
              </button>

              <template #content>
                <div class="flex flex-col gap-2 p-2.5">
                  <p :id="`store-${store.id}-colors`" class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Couleur du nom
                  </p>
                  <div role="radiogroup" :aria-labelledby="`store-${store.id}-colors`" class="grid grid-cols-5 gap-1">
                    <button
                      v-for="color in STORE_COLORS"
                      :key="color.key"
                      type="button"
                      role="radio"
                      :aria-checked="store.color === color.key"
                      :aria-label="color.label"
                      :title="color.label"
                      class="flex size-8 items-center justify-center rounded-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                      :class="color.text"
                      @click="pickColor(store, color.key)"
                    >
                      <span
                        class="flex size-5 items-center justify-center rounded-full bg-current"
                        :class="store.color === color.key && 'ring-2 ring-current ring-offset-2 ring-offset-(--ui-bg)'"
                      />
                    </button>
                  </div>
                </div>
              </template>
            </UPopover>

            <input
              :value="drafts[store.id] ?? store.name"
              type="text"
              :maxlength="STORE_NAME_MAX"
              autocomplete="off"
              spellcheck="false"
              class="min-w-0 flex-1 rounded-sm bg-transparent px-1.5 py-1 text-sm font-semibold outline-none transition-colors hover:bg-elevated/60 focus-visible:bg-default focus-visible:outline-2 focus-visible:outline-primary"
              :class="storeColor(store.color).text"
              :aria-label="`Nom du magasin ${store.name}`"
              :aria-invalid="!!renameErrors[store.id]"
              :aria-describedby="renameErrors[store.id] ? `store-${store.id}-error` : undefined"
              @input="onNameInput(store, ($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="onNameEnter(store, $event)"
              @keydown.esc.prevent="onNameEscape(store, $event)"
              @blur="commitName(store, { revert: true })"
            >

            <div class="flex shrink-0">
              <UButton
                :id="`store-${store.id}-up`"
                icon="i-lucide-chevron-up"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="index === 0"
                :aria-label="`Monter ${store.name}`"
                @click="move(index, -1)"
              />
              <UButton
                :id="`store-${store.id}-down`"
                icon="i-lucide-chevron-down"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="index === ordered.length - 1"
                :aria-label="`Descendre ${store.name}`"
                @click="move(index, 1)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                class="hover:text-error"
                :aria-label="`Supprimer ${store.name}`"
                @click="removeStore(store)"
              />
            </div>
          </div>
          <p
            v-if="renameErrors[store.id]"
            :id="`store-${store.id}-error`"
            class="ps-[4.875rem] pb-1 text-xs text-error"
            role="alert"
          >
            {{ renameErrors[store.id] }}
          </p>
        </li>
      </VueDraggable>

      <form class="flex flex-col py-1.5 ps-2 pe-1.5" @submit.prevent="submitNew">
        <div class="flex items-center gap-2">
          <span class="flex size-7 shrink-0 items-center justify-center text-dimmed" aria-hidden="true">
            <UIcon name="i-lucide-plus" class="size-4" />
          </span>
          <span class="size-7 shrink-0" aria-hidden="true" />
          <input
            v-model="newName"
            type="text"
            :maxlength="STORE_NAME_MAX"
            autocomplete="off"
            placeholder="Ajouter un magasin…"
            aria-label="Nom du nouveau magasin"
            class="min-w-0 flex-1 rounded-sm bg-transparent px-1.5 py-1 text-sm text-highlighted outline-none placeholder:text-dimmed hover:bg-elevated/60 focus-visible:bg-default focus-visible:outline-2 focus-visible:outline-primary"
            :aria-invalid="!!addError"
            :aria-describedby="addError ? 'store-new-error' : undefined"
            :disabled="loading"
          >
          <UButton
            type="submit"
            label="Ajouter"
            color="neutral"
            variant="outline"
            size="xs"
            class="shrink-0"
            :disabled="loading || !newName.trim()"
          />
        </div>
        <p v-if="addError" id="store-new-error" class="ps-[4.875rem] pt-1 pb-1 text-xs text-error" role="alert">
          {{ addError }}
        </p>
      </form>
    </div>
  </div>
</template>

<style>
.store-ghost {
  opacity: 0.5;
  background-color: color-mix(in oklch, var(--ui-primary) 6%, transparent) !important;
}

.store-chosen {
  background-color: var(--ui-bg-elevated) !important;
}

.store-chosen .store-handle {
  color: var(--ui-primary);
}
</style>
