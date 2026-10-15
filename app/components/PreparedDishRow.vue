<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { HouseholdMember } from '~/composables/useHousehold'
import type { DishStorage, PreparedDish } from '~/types/preparedDish'
import { DISH_STORAGES, formatDishDay, formatParts, isDishDepleted, isDishPlanned, isDishStale, STOCK_PARTS_STEP } from '~/utils/preparedDishes'

/** Un plat de la page Stock : ce qu'il est, depuis quand, ses parts restantes (ajustables) et ses actions. */
const props = defineProps<{
  dish: PreparedDish
  /** Photo de la recette d'origine, s'il y en a une. */
  imageUrl?: string
  todayKey: string
  /** Parts que fait la recette d'origine. */
  recipePersons?: number
  /** Parts des repas des menus cuisinés dans la même fournée que ce surplus. */
  menuParts?: number
  /** Membre du foyer qui a ajouté le plat, quand ce n'est pas le compte connecté. */
  addedBy?: HouseholdMember
}>()

const emit = defineEmits<{
  edit: []
  delete: []
  'set-parts': [parts: number]
  'set-storage': [storage: DishStorage]
}>()

const isPlanned = computed(() => isDishPlanned(props.dish, props.todayKey))
const isDepleted = computed(() => isDishDepleted(props.dish))
const isStale = computed(() => !isDepleted.value && isDishStale(props.dish, props.todayKey))

/**
 * Parts cuisinées en une fois avec ce surplus prévu (menus + stock) ; `null` une fois cuisiné, hors fournée, ou pour la
 * fournée d'un autre membre (ses menus ne sont pas connus).
 */
const batchTotal = computed(() => isPlanned.value && props.dish.batch && !props.addedBy
  ? (props.menuParts ?? 0) + props.dish.batch.surplusParts
  : null)

const dayLine = computed(() => isPlanned.value
  ? `À cuisiner le ${formatDishDay(props.dish.preparedOn)}`
  : `Préparé le ${formatDishDay(props.dish.preparedOn)}`)

const kcalPerPart = computed(() => Math.round(props.dish.perPart.calories))

const imageFailed = ref(false)
watch(() => props.imageUrl, () => { imageFailed.value = false })

const actions = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => emit('edit') }],
  DISH_STORAGES
    .filter(option => option.key !== props.dish.storage)
    .map(option => ({ label: `Ranger : ${option.label.toLowerCase()}`, icon: option.icon, onSelect: () => emit('set-storage', option.key) })),
  [{ label: 'Retirer du stock', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete') }],
])
</script>

<template>
  <li class="flex flex-col gap-2 p-3 sm:p-4" :class="isDepleted && 'bg-elevated/40'">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
      <button
        type="button"
        class="flex min-w-0 flex-1 basis-56 cursor-pointer items-start gap-3 rounded-md text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-label="`Modifier ${dish.label}`"
        @click="emit('edit')"
      >
        <img
          v-if="imageUrl && !imageFailed"
          :src="imageUrl"
          alt=""
          loading="lazy"
          class="size-10 shrink-0 rounded-full bg-accented object-cover"
          :class="isDepleted && 'opacity-50 grayscale'"
          @error="imageFailed = true"
        >
        <div v-else class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
          <UIcon :name="dish.recipeId ? 'i-lucide-chef-hat' : 'i-lucide-utensils'" class="size-4" />
        </div>

        <div class="min-w-0 flex-1">
          <p class="flex min-w-0 items-center gap-2">
            <span class="truncate font-semibold" :class="isDepleted ? 'text-muted' : 'text-highlighted'">{{ dish.label }}</span>
            <UTooltip v-if="addedBy" :text="`Ajouté par ${addedBy.name}`">
              <UAvatar :src="addedBy.photoUrl" :alt="addedBy.name" size="3xs" class="shrink-0" />
            </UTooltip>
            <UBadge v-if="isPlanned" label="Prévu" icon="i-lucide-calendar-clock" color="info" variant="subtle" size="sm" class="shrink-0" />
            <UBadge v-else-if="isDepleted" label="Épuisé" color="neutral" variant="subtle" size="sm" class="shrink-0" />
            <UBadge v-else-if="isStale" label="À consommer vite" icon="i-lucide-clock-alert" color="warning" variant="subtle" size="sm" class="shrink-0" />
          </p>
          <p class="mt-0.5 truncate text-xs tabular-nums text-dimmed">
            {{ dayLine }} · {{ kcalPerPart }} kcal / part ·
            <MenuMacroLabels
              :carbohydrates="Math.round(dish.perPart.carbohydrates)"
              :protein="Math.round(dish.perPart.protein)"
              :fat="Math.round(dish.perPart.fat)"
            />
          </p>
          <p v-if="dish.comment" class="mt-1 flex items-start gap-1 text-xs text-muted">
            <UIcon name="i-lucide-message-square-text" class="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span class="line-clamp-2">{{ dish.comment }}</span>
          </p>
        </div>
      </button>

      <div class="ms-auto flex shrink-0 items-center gap-1">
        <!-- Parts restantes, corrigées sur place (part oubliée, jetée...) ; un repas des menus les décompte tout seul. -->
        <div role="group" :aria-label="`Parts restantes de ${dish.label}`" class="flex items-center rounded-md ring ring-inset ring-accented">
          <UButton
            icon="i-lucide-minus"
            color="neutral"
            variant="link"
            size="sm"
            aria-label="Retirer une demi-part"
            :disabled="isDepleted"
            @click="emit('set-parts', Math.max(0, dish.parts - STOCK_PARTS_STEP))"
          />
          <span class="min-w-16 text-center text-sm font-semibold tabular-nums" :class="isDepleted ? 'text-muted' : 'text-highlighted'" aria-live="polite">
            {{ formatParts(dish.parts) }}
          </span>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="link"
            size="sm"
            aria-label="Ajouter une demi-part"
            @click="emit('set-parts', dish.parts + STOCK_PARTS_STEP)"
          />
        </div>
        <UDropdownMenu :items="actions" :content="{ align: 'end' }" :ui="{ content: 'w-52' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="sm"
            class="text-dimmed"
            :aria-label="`Actions pour ${dish.label}`"
          />
        </UDropdownMenu>
      </div>
    </div>
    <!-- Pas encore cuisiné : les parts de la fournée (menus + stock) devraient faire des recettes entières. -->
    <WholeRecipeAlert
      v-if="batchTotal !== null"
      class="sm:ps-13"
      :total="batchTotal"
      :persons="recipePersons"
      :min-total="batchTotal - dish.parts"
      compact
      @adjust="emit('set-parts', dish.parts + $event)"
    />
  </li>
</template>
