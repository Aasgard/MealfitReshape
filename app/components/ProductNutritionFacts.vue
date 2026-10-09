<script setup lang="ts">
import { isPer100Ml, readEnergy, readNutrient } from '~/utils/offNutrition'
import type { OffNutritionSource } from '~/utils/offNutrition'

const props = defineProps<{
  product: OffNutritionSource
}>()

/** Même ordre, mêmes initiales et mêmes pastilles que les cartes ingrédients. */
const MACROS = [
  { key: 'carbohydrates', short: 'G', label: 'Glucides', colorClass: 'bg-green-500' },
  { key: 'proteins', short: 'P', label: 'Protéines', colorClass: 'bg-red-700' },
  { key: 'fat', short: 'L', label: 'Lipides', colorClass: 'bg-amber-500' },
] as const

const nutriments = computed(() => props.product.nutriments ?? {})

const energy = computed(() => readEnergy(nutriments.value))

const macros = computed(() => MACROS.map(m => ({ ...m, reading: readNutrient(nutriments.value, m.key) })))

const perLabel = computed(() => (isPer100Ml(props.product) ? 'pour 100 ml' : 'pour 100 g'))

const missingCount = computed(() => [energy.value, ...macros.value.map(m => m.reading)].filter(r => r.kind === 'missing').length)

/** Barre de composition G/P/L : seulement si les trois macros sont connues, sinon une barre partielle mentirait. */
const segments = computed(() => {
  const readings = macros.value
  if (readings.some(m => m.reading.kind === 'missing')) return []
  const grams = readings.map(m => (m.reading.kind === 'value' ? m.reading.value : 0))
  const total = grams.reduce((sum, g) => sum + g, 0)
  if (total <= 0) return []
  return readings
    .map((m, i) => ({ key: m.key, label: m.label, colorClass: m.colorClass, grams: grams[i]! }))
    .filter(s => s.grams > 0)
    .map(s => ({ ...s, width: `${(s.grams / total) * 100}%` }))
})

/** Ce que la ligne compacte ne peut pas dire : valeurs estimées, énergie convertie, barre absente. */
const footnotes = computed(() => {
  const notes: string[] = []
  const readings = [energy.value, ...macros.value.map(m => m.reading)]
  if (readings.some(r => r.kind === 'value' && r.prefix === '≈')) notes.push('≈ estimée par Open Food Facts')
  if (energy.value.kind === 'value' && energy.value.note?.startsWith('Convertie')) {
    notes.push(`Énergie ${energy.value.note.charAt(0).toLowerCase()}${energy.value.note.slice(1)}`)
  }
  if (macros.value.some(m => m.reading.kind === 'missing')) notes.push('Répartition indisponible : il manque au moins une macro')
  else if (!segments.value.length) notes.push('Ni glucides, ni protéines, ni lipides')
  return notes
})

function formatNumber(value: number, maximumFractionDigits: number) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits })
}
</script>

<template>
  <section class="rounded-xl border border-default flex flex-col overflow-hidden" aria-labelledby="nutrition-title">
    <div class="flex items-baseline justify-between gap-3 border-b border-default px-4 py-2.5">
      <h2 id="nutrition-title" class="min-w-0 truncate text-sm font-semibold text-highlighted">
        Valeurs nutritionnelles
      </h2>
      <span v-if="missingCount" class="text-xs text-dimmed tabular-nums shrink-0">
        {{ missingCount === 4 ? 'Aucune valeur renseignée' : `${missingCount} non renseignée${missingCount > 1 ? 's' : ''}` }}
      </span>
    </div>

    <div class="px-4 py-3 flex flex-col gap-2.5">
      <dl class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-dimmed whitespace-nowrap">
        <div v-for="m in macros" :key="m.key" class="flex items-center gap-1.5">
          <dt class="flex items-center gap-1.5">
            <span class="size-2 rounded-full shrink-0" :class="m.reading.kind === 'value' ? m.colorClass : 'bg-accented'" />
            <span aria-hidden="true">{{ m.short }}</span>
            <span class="sr-only">{{ m.label }}</span>
          </dt>
          <dd v-if="m.reading.kind === 'value'" class="font-medium tabular-nums text-highlighted">
            <span v-if="m.reading.prefix" class="text-muted">{{ m.reading.prefix }}</span>{{ formatNumber(m.reading.value, 1) }}<span class="font-normal text-muted"> g</span>
          </dd>
          <dd v-else aria-label="Non renseigné">
            —
          </dd>
        </div>

        <div class="flex items-baseline gap-1 ml-auto">
          <dt class="sr-only">
            Énergie
          </dt>
          <dd v-if="energy.kind === 'value'" class="text-base font-semibold tabular-nums text-highlighted">
            <span v-if="energy.prefix" class="text-muted">{{ energy.prefix }}</span>{{ formatNumber(energy.value, 0) }}<span class="text-sm font-normal text-dimmed"> kcal</span>
          </dd>
          <dd v-else class="text-base font-semibold" aria-label="Non renseignée">
            —<span class="text-sm font-normal" aria-hidden="true"> kcal</span>
          </dd>
        </div>
      </dl>

      <div
        class="flex h-1.5 rounded-full bg-accented overflow-hidden gap-0.5"
        role="img"
        :aria-label="segments.length
          ? `Répartition en grammes : ${segments.map(s => `${s.label} ${formatNumber(s.grams, 1)} g`).join(', ')}`
          : footnotes.at(-1)"
      >
        <div
          v-for="segment in segments"
          :key="segment.key"
          class="h-full rounded-full transition-all duration-500"
          :class="segment.colorClass"
          :style="{ width: segment.width }"
        />
      </div>

      <!-- 11px : tient sur une ligne dans la carte d'un écran de 375px ; tronqué plutôt que renvoyé à la ligne en deçà. -->
      <p class="-mt-1 truncate text-[0.6875rem] leading-tight text-dimmed">
        Glucides, Protéines, Lipides et calories {{ perLabel }}
      </p>

      <p v-if="footnotes.length" class="text-xs text-dimmed">
        {{ footnotes.join(' · ') }}
      </p>
    </div>
  </section>
</template>
