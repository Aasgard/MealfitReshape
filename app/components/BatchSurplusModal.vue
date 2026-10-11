<script setup lang="ts">
import type { DishStorage, PreparedDish } from '~/types/preparedDish'
import { formatDishDay, formatParts, PARTS_EPSILON, STOCK_PARTS_STEP } from '~/utils/preparedDishes'

/**
 * Surplus prévu d'une fournée, depuis « Cuisiner » : des parts cuisinées en plus de celles des menus, qui rejoignent le
 * stock le jour de cuisine. Sans surplus existant, on en déclare un ; sinon on le modifie, ou on le retire (0 part).
 */
const props = defineProps<{
  title: string
  /** Jour de cuisine, `yyyy-MM-dd`. */
  cookDay: string
  /** Parts des repas des menus, sans le surplus. */
  plannedParts: number
  /** Parts que fait la recette : on alerte quand le total n'en fait pas un nombre entier. */
  recipePersons?: number
  /** Surplus déjà déclaré pour cette fournée. */
  dish: PreparedDish | null
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [value: { surplusParts: number, storage: DishStorage, comment: string }]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const COMMENT_MAX = 200

const surplusParts = ref(2)
const storage = ref<DishStorage>('FREEZER')
const comment = ref('')

/** Parts du surplus déjà placées dans des repas : il ne peut pas descendre en dessous. */
const takenParts = computed(() => {
  const dish = props.dish
  if (!dish?.batch) return 0
  return Math.max(0, dish.batch.surplusParts - dish.parts)
})

watch(open, (isOpen) => {
  if (!isOpen) return
  surplusParts.value = props.dish?.batch?.surplusParts ?? 2
  storage.value = props.dish?.storage ?? 'FREEZER'
  comment.value = props.dish?.comment ?? ''
})

const minParts = computed(() => props.dish ? Math.max(0, takenParts.value) : STOCK_PARTS_STEP)
const stepParts = (direction: 1 | -1) => {
  surplusParts.value = Math.max(minParts.value, surplusParts.value + direction * STOCK_PARTS_STEP)
}

const isRemoval = computed(() => !!props.dish && surplusParts.value < PARTS_EPSILON)
const total = computed(() => props.plannedParts + surplusParts.value)

const submit = () => {
  emit('save', { surplusParts: surplusParts.value, storage: storage.value, comment: comment.value })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="dish ? 'Surplus pour le stock' : 'En faire plus pour le stock'"
    :description="`${title} · cuisinée le ${formatDishDay(cookDay)}`"
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-sm', footer: 'justify-end' }"
  >
    <template #body>
      <form id="batch-surplus-form" class="flex flex-col gap-5" novalidate @submit.prevent="submit">
        <UFormField label="Parts en plus" :help="takenParts > 0 ? `${formatParts(takenParts)} déjà prévue${takenParts > 1 ? 's' : ''} dans des repas.` : undefined">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Parts en plus" class="flex items-center gap-1 rounded-md ring ring-inset ring-accented">
              <UButton
                icon="i-lucide-minus"
                color="neutral"
                variant="link"
                size="lg"
                aria-label="Retirer une demi-part"
                :disabled="surplusParts <= minParts + PARTS_EPSILON"
                @click="stepParts(-1)"
              />
              <span class="min-w-20 text-center text-base font-semibold text-highlighted tabular-nums" aria-live="polite">
                {{ formatParts(surplusParts) }}
              </span>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="link"
                size="lg"
                aria-label="Ajouter une demi-part"
                @click="stepParts(1)"
              />
            </div>
            <!-- Ce que la fiche recette et la liste de courses compteront : menus + stock. -->
            <p class="text-sm tabular-nums text-muted">
              {{ formatParts(plannedParts) }} des menus
              <span class="text-dimmed">→</span>
              <span class="font-semibold text-highlighted">{{ formatParts(total) }}</span> à cuisiner
            </p>
          </div>
        </UFormField>

        <!-- Le surplus garde au moins une demi-part (ou les parts déjà prises) : l'annuler passe par le « − ». -->
        <WholeRecipeAlert
          v-if="!isRemoval"
          :total="total"
          :persons="recipePersons"
          :min-total="plannedParts + Math.max(minParts, STOCK_PARTS_STEP)"
          @adjust="surplusParts += $event"
        />

        <template v-if="!isRemoval">
          <UFormField label="Rangement">
            <DishStorageSelect v-model="storage" />
          </UFormField>

          <UFormField label="Commentaire (optionnel)" :hint="`${comment.length}/${COMMENT_MAX}`">
            <UInput
              v-model="comment"
              :maxlength="COMMENT_MAX"
              placeholder="ex : ajouter la crème au réchauffage"
              class="w-full"
            />
          </UFormField>

          <p class="flex items-start gap-2 text-xs text-muted">
            <UIcon name="i-lucide-info" class="mt-px size-3.5 shrink-0" aria-hidden="true" />
            Comptées dans la fiche recette et dans la liste de courses (si la fournée n'est pas encore achetée), puis
            disponibles dans le stock dès le {{ formatDishDay(cookDay) }}.
          </p>
        </template>
        <p v-else class="text-sm text-muted">
          Le surplus sera retiré du stock et de la liste de courses.
        </p>
      </form>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton
        type="submit"
        form="batch-surplus-form"
        :label="isRemoval ? 'Retirer le surplus' : dish ? 'Enregistrer' : 'Prévoir le surplus'"
        :color="isRemoval ? 'error' : 'primary'"
        :icon="isRemoval ? 'i-lucide-trash-2' : 'i-lucide-check'"
        :loading="saving"
      />
    </template>
  </UModal>
</template>
