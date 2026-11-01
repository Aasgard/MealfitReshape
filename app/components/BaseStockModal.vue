<script setup lang="ts">
import type { BaseStock } from '~/types/baseStock'
import type { DishStorage } from '~/types/preparedDish'
import type { Recipe } from '~/types/recipe'
import { formatBaseGrams, type BaseStockState } from '~/utils/baseStock'
import { dayKeyOf } from '~/utils/menuWeek'
import { parseNonNegativeNumber, parsePositiveNumber } from '~/utils/numberInput'
import { baseYield } from '~/utils/recipeBases'
import { isBaseRecipe } from '~/utils/recipeType'

/**
 * Ranger une base préparée (bocal de pickles, pot de pesto), ou corriger un bocal déjà rangé. Une base se compte en
 * grammes : à la mise au stock, son rendement est proposé ; à la correction, ce qu'il reste aujourd'hui, avant les repas
 * du jour (ceux-ci y puisent ensuite, comme ceux des jours suivants).
 */
const props = withDefaults(defineProps<{
  /** Bocal à corriger ; `null` : nouvelle mise au stock. */
  stock?: BaseStockState | null
  /** Base proposée à la mise au stock (fiche de la base) ; sans elle, on la choisit parmi `recipes`. */
  base?: Recipe | null
  recipes?: Recipe[]
}>(), {
  stock: null,
  base: null,
  recipes: () => [],
})

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const toast = useToast()
const { addStock, correctStock, updateStock } = useBaseStockWrites()

const isEdit = computed(() => !!props.stock)
const bases = computed(() => props.recipes.filter(isBaseRecipe).map(r => ({ id: r.id, label: r.title })).sort((a, b) => a.label.localeCompare(b.label, 'fr')))
const baseId = ref<string | undefined>(undefined)
const selectedBase = computed(() => props.base ?? props.recipes.find(r => r.id === baseId.value) ?? null)
const grams = ref('')
const storage = ref<DishStorage>('FRIDGE')
const comment = ref('')
const saving = ref(false)
const submitted = ref(false)

const gramsText = (n: number) => String(Math.round(n))

watch(open, (isOpen) => {
  if (!isOpen) return
  submitted.value = false
  const state = props.stock
  if (state) {
    grams.value = gramsText(state.remaining)
    storage.value = state.stock.storage
    comment.value = state.stock.comment ?? ''
    return
  }
  baseId.value = props.base?.id
  const yieldGrams = baseYield(props.base)
  grams.value = yieldGrams ? gramsText(yieldGrams) : ''
  storage.value = 'FRIDGE'
  comment.value = ''
})

/** La base choisie à la main propose son rendement, tant qu'on n'a rien saisi d'autre. */
watch(baseId, (id, previous) => {
  if (isEdit.value || props.base || !id) return
  const previousYield = baseYield(props.recipes.find(r => r.id === previous))
  if (grams.value && Number(grams.value) !== previousYield) return
  const yieldGrams = baseYield(props.recipes.find(r => r.id === id))
  grams.value = yieldGrams ? gramsText(yieldGrams) : ''
})

const parsedGrams = computed(() => (isEdit.value ? parseNonNegativeNumber(grams.value) : parsePositiveNumber(grams.value)))
const gramsError = computed(() => {
  if (!submitted.value) return undefined
  if (!grams.value.trim()) return 'Requis'
  return parsedGrams.value === null ? 'Nombre invalide' : undefined
})
const baseError = computed(() => (submitted.value && !selectedBase.value ? 'Choisissez une base' : undefined))

const title = computed(() => (isEdit.value ? props.stock!.stock.label : 'Mettre une base au stock'))
const description = computed(() => {
  const state = props.stock
  if (!state) return 'Comptée en grammes : les plats des menus qui l\'utilisent y puisent leur part.'
  return state.reserved > 0.5
    ? `Reste ${formatBaseGrams(state.remaining)}, dont ${formatBaseGrams(state.reserved)} réservés par les menus.`
    : `Reste ${formatBaseGrams(state.remaining)}.`
})

async function save() {
  submitted.value = true
  if (parsedGrams.value === null || (!isEdit.value && !selectedBase.value)) return
  saving.value = true
  try {
    const state = props.stock
    if (state) {
      if (Math.abs(parsedGrams.value - state.remaining) >= 0.5) await correctStock(state.stock, parsedGrams.value)
      if (storage.value !== state.stock.storage || comment.value.trim() !== (state.stock.comment ?? '')) {
        await updateStock(state.stock, { storage: storage.value, comment: comment.value })
      }
    } else {
      const base = selectedBase.value!
      await addStock({
        recipeId: base.id,
        label: base.title,
        grams: parsedGrams.value,
        storage: storage.value,
        preparedOn: dayKeyOf(new Date()),
        ...(comment.value.trim() ? { comment: comment.value.trim() } : {}),
      })
      toast.add({ title: 'Au stock', description: `« ${base.title} » · ${formatBaseGrams(parsedGrams.value)}`, color: 'success', icon: 'i-lucide-archive' })
    }
    open.value = false
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: error?.message || 'Le stock n\'a pas pu être enregistré.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-sm', footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField v-if="!isEdit && !base" label="Base" :error="baseError">
          <USelectMenu
            v-model="baseId"
            :items="bases"
            value-key="id"
            placeholder="Choisir une base..."
            :search-input="{ placeholder: 'Rechercher une base...' }"
            icon="i-lucide-cooking-pot"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="isEdit ? 'Il reste' : 'Quantité préparée'"
          :help="isEdit ? 'Avant les repas d\'aujourd\'hui : ils y puiseront ensuite.' : (selectedBase && baseYield(selectedBase) ? `La recette donne ${formatBaseGrams(baseYield(selectedBase)!)}.` : undefined)"
          :error="gramsError"
        >
          <UInput
            v-model="grams"
            type="search"
            inputmode="decimal"
            enterkeyhint="done"
            autocomplete="off"
            spellcheck="false"
            data-form-type="other"
            data-lpignore="true"
            placeholder="ex : 450"
            class="w-full"
            :ui="{ base: `${NAME_FIELD_BASE} tabular-nums`, trailing: 'pointer-events-none' }"
          >
            <template #trailing>
              <span class="text-sm text-dimmed">g</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField label="Rangement">
          <DishStorageSelect v-model="storage" />
        </UFormField>

        <UFormField label="Commentaire (optionnel)">
          <UInput v-model="comment" placeholder="ex : bocal de 500 ml" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="() => { open = false }" />
      <UButton :label="isEdit ? 'Enregistrer' : 'Mettre au stock'" :icon="isEdit ? 'i-lucide-check' : 'i-lucide-archive'" :loading="saving" @click="save" />
    </template>
  </UModal>
</template>
