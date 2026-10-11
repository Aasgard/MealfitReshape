<script setup lang="ts">
import { formatParts, wholeRecipeGap } from '~/utils/preparedDishes'

/**
 * Alerte quand les parts à cuisiner ne font pas un nombre entier de recettes (ex. 15 parts d'une recette de 4), avec
 * de quoi passer au multiple juste en dessous ou au-dessus. Rien ne s'affiche quand le compte est rond.
 */
const props = defineProps<{
  /** Parts cuisinées en une fois : repas des menus et stock. */
  total: number
  /** Parts que fait la recette. */
  persons?: number
  /** Total sous lequel on ne peut pas descendre (parts des menus, parts déjà prises). */
  minTotal?: number
  /** Affichage serré, dans une ligne de liste. */
  compact?: boolean
}>()

const emit = defineEmits<{
  /** Parts à ajouter (positif) ou retirer (négatif) pour tomber juste. */
  adjust: [delta: number]
}>()

const gap = computed(() => wholeRecipeGap(props.total, props.persons))
const canLower = computed(() => !!gap.value && gap.value.lower > 0 && gap.value.lower > (props.minTotal ?? 0) - 1e-6)
const recipesLabel = computed(() => gap.value?.recipes.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) ?? '')
</script>

<template>
  <div
    v-if="gap"
    role="status"
    class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-warning"
    :class="!compact && 'rounded-md bg-warning/10 px-3 py-2'"
  >
    <span class="flex items-center gap-1">
      <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        La recette fait {{ formatParts(persons!) }} :
        <span class="font-semibold tabular-nums">{{ formatParts(total) }}</span> = {{ recipesLabel }} recettes.
      </span>
    </span>
    <span class="flex items-center gap-1">
      <UButton
        v-if="canLower"
        :label="`Passer à ${formatParts(gap.lower)}`"
        color="warning"
        variant="outline"
        size="xs"
        class="tabular-nums"
        @click="emit('adjust', gap.lower - total)"
      />
      <UButton
        :label="`Passer à ${formatParts(gap.upper)}`"
        color="warning"
        variant="soft"
        size="xs"
        class="tabular-nums"
        @click="emit('adjust', gap.upper - total)"
      />
    </span>
  </div>
</template>
