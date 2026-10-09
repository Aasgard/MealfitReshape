<script setup lang="ts">
/** Sous-ensemble de la fiche Open Food Facts lu par ce relevé. */
export type OffNutritionSource = {
  nutriments?: Record<string, unknown>
  nutrition_data_per?: string
  product_quantity_unit?: string
}

const props = defineProps<{
  product: OffNutritionSource
}>()

type NutrientReading =
  | { kind: 'missing' }
  | { kind: 'value', value: number, prefix: string, note?: string }

/** Préfixes Open Food Facts (`<key>_modifier`) : `~` = valeur estimée par OFF, les autres sont des bornes déclarées. */
const MODIFIER_PREFIX: Record<string, string> = { '~': '≈', '<': '<', '>': '>', '<=': '≤', '>=': '≥' }

function numberAt(nutriments: Record<string, unknown>, key: string): number | null {
  const raw = nutriments[key]
  const value = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Une clé absente reste « non renseignée » ; un 0 explicite est un vrai zéro. */
function readNutrient(nutriments: Record<string, unknown>, key: string): NutrientReading {
  const value = numberAt(nutriments, `${key}_100g`)
  if (value == null) return { kind: 'missing' }
  const modifier = nutriments[`${key}_modifier`]
  const prefix = typeof modifier === 'string' ? MODIFIER_PREFIX[modifier] ?? '' : ''
  return { kind: 'value', value, prefix, note: modifier === '~' ? 'Estimée par Open Food Facts' : undefined }
}

/** Les kcal d'abord ; à défaut, la valeur en kJ de l'étiquette convertie (1 kcal = 4,184 kJ). */
function readEnergy(nutriments: Record<string, unknown>): NutrientReading {
  const kcal = readNutrient(nutriments, 'energy-kcal')
  if (kcal.kind === 'value') return kcal
  const kj = readNutrient(nutriments, 'energy-kj')
  if (kj.kind === 'missing') return kj
  return { ...kj, value: kj.value / 4.184, note: kj.note ?? `Convertie depuis ${formatNumber(kj.value, 0)} kJ` }
}

const MACROS = [
  { key: 'carbohydrates', label: 'Glucides', colorClass: 'bg-green-500' },
  { key: 'proteins', label: 'Protéines', colorClass: 'bg-red-700' },
  { key: 'fat', label: 'Lipides', colorClass: 'bg-amber-500' },
] as const

const nutriments = computed(() => props.product.nutriments ?? {})

const energy = computed(() => readEnergy(nutriments.value))

const macros = computed(() => MACROS.map(m => ({ ...m, reading: readNutrient(nutriments.value, m.key) })))

/** Open Food Facts stocke tout en `_100g`, mais une boisson se lit pour 100 ml. */
const perLabel = computed(() => {
  const per = props.product.nutrition_data_per?.toLowerCase() ?? ''
  const unit = props.product.product_quantity_unit?.toLowerCase() ?? ''
  return per.includes('ml') || ['ml', 'cl', 'l'].includes(unit) ? 'pour 100 ml' : 'pour 100 g'
})

const missingCount = computed(() => [energy.value, ...macros.value.map(m => m.reading)].filter(r => r.kind === 'missing').length)

/** Barre de composition G/P/L : seulement si les trois macros sont connues, sinon une barre partielle mentirait. */
const segments = computed(() => {
  const readings = macros.value
  if (readings.some(m => m.reading.kind === 'missing')) return []
  const grams = readings.map(m => (m.reading.kind === 'value' ? m.reading.value : 0))
  const total = grams.reduce((sum, g) => sum + g, 0)
  if (total <= 0) return []
  return readings
    .map((m, i) => ({ key: m.key, colorClass: m.colorClass, grams: grams[i]! }))
    .filter(s => s.grams > 0)
    .map(s => ({ ...s, width: `${(s.grams / total) * 100}%` }))
})

const barCaption = computed(() => {
  if (segments.value.length) return 'Répartition des glucides, protéines et lipides en grammes'
  if (macros.value.some(m => m.reading.kind === 'missing')) return 'Répartition indisponible : il manque au moins une macro'
  return 'Ni glucides, ni protéines, ni lipides'
})

function formatNumber(value: number, maximumFractionDigits: number) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits })
}
</script>

<template>
  <section class="rounded-xl border border-default flex flex-col overflow-hidden" aria-labelledby="nutrition-title">
    <div class="flex items-baseline justify-between gap-3 border-b border-default px-4 py-2.5">
      <div class="flex items-baseline gap-2 min-w-0">
        <h2 id="nutrition-title" class="text-sm font-semibold text-highlighted truncate">
          Valeurs nutritionnelles
        </h2>
        <span class="text-xs text-dimmed shrink-0">{{ perLabel }}</span>
      </div>
      <span v-if="missingCount" class="text-xs text-dimmed tabular-nums shrink-0">
        {{ missingCount === 4 ? 'Aucune valeur renseignée' : `${missingCount} non renseignée${missingCount > 1 ? 's' : ''}` }}
      </span>
    </div>

    <dl class="grid grid-cols-3 sm:grid-cols-[1.25fr_1fr_1fr_1fr] gap-px bg-border border-b border-default">
      <div class="col-span-3 sm:col-span-1 bg-default p-4 flex flex-col gap-1">
        <dt class="text-xs font-semibold uppercase tracking-wide text-dimmed">
          Énergie
        </dt>
        <dd v-if="energy.kind === 'value'" class="flex items-baseline gap-1 text-highlighted">
          <span v-if="energy.prefix" class="text-xl font-semibold text-muted">{{ energy.prefix }}</span>
          <span class="text-4xl font-bold tracking-tight tabular-nums leading-none">{{ formatNumber(energy.value, 0) }}</span>
          <span class="text-sm text-muted">kcal</span>
        </dd>
        <dd v-else class="text-4xl font-bold leading-none text-dimmed" aria-label="Non renseignée">
          —
        </dd>
        <dd class="min-h-4 text-xs" :class="energy.kind === 'missing' ? 'text-dimmed' : 'text-muted'">
          {{ energy.kind === 'missing' ? 'Non renseignée' : energy.note }}
        </dd>
      </div>

      <div v-for="m in macros" :key="m.key" class="bg-default p-4 flex flex-col gap-1 min-w-0">
        <dt class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dimmed">
          <span class="size-2 rounded-full shrink-0" :class="m.reading.kind === 'value' ? m.colorClass : 'bg-accented'" />
          <span class="truncate">{{ m.label }}</span>
        </dt>
        <dd v-if="m.reading.kind === 'value'" class="flex items-baseline gap-0.5 text-highlighted whitespace-nowrap">
          <span v-if="m.reading.prefix" class="text-base font-semibold text-muted mr-0.5">{{ m.reading.prefix }}</span>
          <span class="text-2xl font-bold tabular-nums leading-tight">{{ formatNumber(m.reading.value, 1) }}</span>
          <span class="text-sm text-muted">g</span>
        </dd>
        <dd v-else class="text-2xl font-bold leading-tight text-dimmed" aria-label="Non renseigné">
          —
        </dd>
        <dd class="min-h-4 text-xs leading-tight" :class="m.reading.kind === 'missing' ? 'text-dimmed' : 'text-muted'">
          {{ m.reading.kind === 'missing' ? 'Non renseigné' : m.reading.note }}
        </dd>
      </div>
    </dl>

    <div class="px-4 py-3 flex flex-col gap-1.5">
      <div
        class="flex h-1.5 rounded-full bg-accented overflow-hidden gap-0.5"
        role="img"
        :aria-label="segments.length
          ? `Répartition en grammes : ${segments.map(s => `${MACROS.find(m => m.key === s.key)!.label} ${formatNumber(s.grams, 1)} g`).join(', ')}`
          : barCaption"
      >
        <div
          v-for="segment in segments"
          :key="segment.key"
          class="h-full rounded-full transition-all duration-500"
          :class="segment.colorClass"
          :style="{ width: segment.width }"
        />
      </div>
      <p class="text-xs text-dimmed">
        {{ barCaption }}
      </p>
    </div>
  </section>
</template>
