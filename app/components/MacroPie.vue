<script setup lang="ts">
/**
 * Petit camembert de répartition des macros, en grammes comme la barre de composition (IngredientMacroSummary),
 * avec les mêmes couleurs G/P/L. Un disque gris quand il n'y a aucun macro.
 */
const props = defineProps<{
  carbohydrates: number
  protein: number
  fat: number
}>()

// Un cercle de rayon R tracé avec un trait d'épaisseur 2R remplit un disque de rayon 2R :
// chaque part est un morceau de ce trait (stroke-dasharray), décalé de la somme des parts précédentes.
const RADIUS = 5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const slices = computed(() => {
  const total = props.carbohydrates + props.protein + props.fat
  if (total <= 0) return []

  let offset = 0
  return ([
    { key: 'carbohydrates', value: props.carbohydrates, colorClass: 'text-green-500' },
    { key: 'protein', value: props.protein, colorClass: 'text-red-700' },
    { key: 'fat', value: props.fat, colorClass: 'text-amber-500' },
  ] as const)
    .filter(slice => slice.value > 0)
    .map((slice) => {
      const length = (slice.value / total) * CIRCUMFERENCE
      const result = { ...slice, dasharray: `${length} ${CIRCUMFERENCE}`, dashoffset: -offset }
      offset += length
      return result
    })
})

const ariaLabel = computed(() =>
  `Glucides ${Math.round(props.carbohydrates)} g, protéines ${Math.round(props.protein)} g, lipides ${Math.round(props.fat)} g`
)
</script>

<template>
  <svg viewBox="0 0 20 20" class="size-3.5 shrink-0" role="img" :aria-label="ariaLabel">
    <circle cx="10" cy="10" r="10" style="fill: var(--ui-bg-accented)" />
    <circle
      v-for="slice in slices"
      :key="slice.key"
      cx="10"
      cy="10"
      :r="RADIUS"
      fill="none"
      stroke="currentColor"
      :stroke-width="RADIUS * 2"
      :stroke-dasharray="slice.dasharray"
      :stroke-dashoffset="slice.dashoffset"
      transform="rotate(-90 10 10)"
      :class="slice.colorClass"
    />
  </svg>
</template>
