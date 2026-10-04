<script setup lang="ts">
import type { IngredientMacros } from '~/utils/ingredientNutrition'

const props = withDefaults(defineProps<{
  /** `null` : valeurs non renseignées, affichées en tirets avec la même géométrie (les cartes d'une grille restent alignées). */
  macros: IngredientMacros | null
  showBar?: boolean
}>(), {
  showBar: true,
})

// Les kcal et grammes G/P/L sont arrondis à l'entier à l'affichage ; la barre garde les valeurs exactes.
const macroTotal = computed(() => props.macros
  ? props.macros.carbohydrates + props.macros.protein + props.macros.fat
  : 0)

const MACROS = [
  { key: 'carbohydrates', short: 'G', label: 'Glucides', colorClass: 'bg-green-500' },
  { key: 'protein', short: 'P', label: 'Protéines', colorClass: 'bg-red-700' },
  { key: 'fat', short: 'L', label: 'Lipides', colorClass: 'bg-amber-500' },
] as const

/** Segments de la barre de composition, dans l’ordre G/P/L utilisé partout ailleurs ; les macros à 0 sont omises pour éviter un segment invisible collé à un gap. */
const macroSegments = computed(() => {
  const macros = props.macros
  if (!macros || macroTotal.value <= 0) return []
  return MACROS
    .filter(m => macros[m.key] > 0)
    .map(m => ({ key: m.key, colorClass: m.colorClass, width: `${(macros[m.key] / macroTotal.value) * 100}%` }))
})

const format = (n: number | undefined) => n == null ? '—' : String(Math.round(n))
</script>

<template>
  <!--
    La mise en page dépend de la largeur du composant (container query), jamais du nombre de chiffres :
    étroit = G/P/L puis kcal sur deux lignes fixes ; à partir de 16rem = une seule ligne. Rien ne passe à la ligne.
  -->
  <div class="@container flex flex-col gap-1.5" :aria-label="macros ? undefined : 'Valeurs non renseignées'">
    <div class="flex flex-col gap-1 text-xs text-dimmed whitespace-nowrap @[16rem]:flex-row @[16rem]:items-center @[16rem]:gap-2">
      <div class="flex items-center gap-2">
        <span v-for="m in MACROS" :key="m.key" class="flex items-center gap-1 shrink-0">
          <span class="size-2 rounded-full shrink-0" :class="macros ? m.colorClass : 'bg-accented'" />
          <span aria-hidden="true">{{ m.short }}</span>
          <span class="sr-only">{{ m.label }}</span>
          <span class="font-medium tabular-nums" :class="macros ? 'text-highlighted' : 'text-dimmed'">{{ format(macros?.[m.key]) }}<template v-if="macros">g</template></span>
        </span>
      </div>
      <p class="flex items-baseline gap-1 self-end @[16rem]:self-auto @[16rem]:ml-auto">
        <span class="font-semibold tabular-nums" :class="macros ? 'text-highlighted' : 'text-dimmed'">{{ format(macros?.calories) }}</span>
        <span>kcal</span>
      </p>
    </div>
    <div v-if="showBar" class="flex h-1.5 rounded-full bg-accented overflow-hidden gap-0.5">
      <div
        v-for="segment in macroSegments"
        :key="segment.key"
        class="h-full rounded-full transition-all duration-500"
        :class="segment.colorClass"
        :style="{ width: segment.width }"
      />
    </div>
  </div>
</template>
