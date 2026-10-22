<script setup lang="ts">
/**
 * Ajout manuel d'un article : nom, rayon et quantité (facultative, texte libre), puis, facultatifs, le jour où il est
 * nécessaire et le marquage urgent.
 * Le nom propose les ingrédients du catalogue : en choisir un reprend son rayon et ses magasins, et y rattache l'article.
 * Magasins proposés d'office : celui où l'on est (Acheter) ou celui que filtre la liste (Lister) ; aucun : partout.
 * Le rayon choisi est gardé d'un ajout à l'autre : on ajoute souvent plusieurs articles du même rayon.
 * Écran tactile : panneau du bas, remonté au-dessus du clavier, pour tout voir sans défiler ; sinon une modale.
 */
import { createReusableTemplate, useMediaQuery } from '@vueuse/core'
import { format } from 'date-fns'
import type { Ingredient } from '~/types/ingredient'

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const list = useInjectedGroceryList()
const [DefineForm, ReuseForm] = createReusableTemplate()

const isTouch = useMediaQuery('(pointer: coarse)')
useKeyboardInset(() => open.value && isTouch.value)

const label = ref('')
const aisleId = ref(MISC_AISLE.id)
const quantity = ref('')
/** `yyyy-MM-dd`, vide si aucun jour. */
const neededBy = ref('')
const urgent = ref(false)
/** Magasins de l'article ; vide : partout. */
const storeIds = ref<string[]>([])
const submitted = ref(false)

const storeItems = computed(() => list.stores.map(store => ({ label: store.name, value: store.id, store })))
/** Ingrédient du catalogue choisi parmi les suggestions ; retiré dès que le nom ne lui correspond plus. */
const linked = shallowRef<Ingredient | null>(null)

/** Suggestions du catalogue pour le nom saisi : ceux qui commencent par la saisie d'abord. */
const suggestions = computed(() => {
  const query = normalizeForSearch(label.value)
  if (query.length < 2 || linked.value) return []
  const starts = (i: Ingredient) => normalizeForSearch(i.label).startsWith(query)
  return list.ingredients
    .filter(i => matchesSearch(i.label, query))
    .sort((a, b) => Number(starts(b)) - Number(starts(a)) || a.label.localeCompare(b.label, 'fr'))
    .slice(0, 5)
})

/** Reprend le nom, le rayon et, s'il y en a, les magasins retenus par le foyer pour l'ingrédient. */
function pick(ingredient: Ingredient) {
  linked.value = ingredient
  label.value = ingredient.label
  const categoryId = ingredient.category?.id
  aisleId.value = list.aisleOptions.some(a => a.id === categoryId) ? categoryId! : MISC_AISLE.id
  const remembered = list.storesForIngredient(ingredient.id)
  if (remembered.length) storeIds.value = remembered
}

watch(label, (value) => {
  if (linked.value && value.trim() !== linked.value.label) linked.value = null
})

const today = () => format(new Date(), 'yyyy-MM-dd')

const aisleItems = computed(() =>
  list.aisleOptions.map(aisle => ({ label: aisle.label, value: aisle.id, icon: categoryIconName(aisle.icon) })))

watch(open, (isOpen) => {
  if (!isOpen) return
  label.value = ''
  quantity.value = ''
  neededBy.value = ''
  urgent.value = false
  storeIds.value = [...list.addItemStoreIds]
  linked.value = null
  submitted.value = false
})

const labelError = computed(() => (submitted.value && !label.value.trim() ? 'Donnez un nom à l\'article.' : undefined))

function onSubmit() {
  submitted.value = true
  if (labelError.value) return
  const aisle = list.aisleOptions.find(a => a.id === aisleId.value)
  if (list.addManual(label.value, aisle, quantity.value, urgent.value, neededBy.value, linked.value?.id, storeIds.value)) {
    open.value = false
  }
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
          name="grocery-item-label"
          type="search"
          autocomplete="off"
          autocapitalize="sentences"
          spellcheck="false"
          data-form-type="other"
          data-lpignore="true"
          :ui="{ base: NAME_FIELD_BASE }"
          autofocus
          enterkeyhint="done"
          maxlength="80"
          class="w-full"
        />
        <ul v-if="suggestions.length" class="mt-1 divide-y divide-default overflow-hidden rounded-md border border-default">
          <li v-for="ingredient in suggestions" :key="ingredient.id">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              @click="pick(ingredient)"
            >
              <UIcon :name="categoryIconName(ingredient.category?.icon) ?? 'i-lucide-tag'" class="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ ingredient.label }}</span>
              <span v-if="ingredient.category?.label" class="shrink-0 text-xs text-muted">{{ ingredient.category.label }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="linked" class="mt-1 flex items-center gap-1 text-xs text-muted">
          <UIcon name="i-lucide-link" class="size-3.5" />
          Ingrédient du catalogue
        </p>
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
          <QuantityInput
            v-model="quantity"
            placeholder="Facultatif"
            autocomplete="off"
            enterkeyhint="done"
            maxlength="40"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField v-if="list.hasStores" label="Magasins">
        <USelectMenu
          v-model="storeIds"
          :items="storeItems"
          value-key="value"
          multiple
          :search-input="false"
          placeholder="Partout"
          icon="i-lucide-store"
          class="w-full"
        >
          <template #item-label="{ item }">
            <StoreName :store="item.store" />
          </template>
        </USelectMenu>
      </UFormField>

      <div class="grid grid-cols-2 items-end gap-3">
        <UFormField label="Pour le" class="min-w-0">
          <UInput
            v-model="neededBy"
            type="date"
            :min="today()"
            class="w-full"
          />
        </UFormField>

        <USwitch v-model="urgent" label="Urgent" class="min-h-8" />
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
