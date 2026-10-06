<script setup lang="ts">
import { parsePositiveNumber } from '~/utils/numberInput'
import { computeWeighing, formatGramsValue } from '~/utils/containerWeighing'

/**
 * Fiche de pesée d'un meal prep, lue comme une étiquette nutritionnelle :
 * poids plein − tare = net cuit, ÷ parts = poids d'une part. Recalculée à chaque frappe.
 * Rien n'est enregistré : remonter le composant (`key`) le remet à zéro.
 */
const props = defineProps<{
  /** Poids à vide du récipient, en grammes. */
  tare: number
}>()

/** Au-delà, la barre ne découpe plus les parts (segments trop fins pour être lus). */
const MAX_PART_SEGMENTS = 20

const fullWeightInput = ref('')
const parts = ref(1)

const fullWeight = computed(() => parsePositiveNumber(fullWeightInput.value))
const weighing = computed(() => computeWeighing(fullWeight.value, props.tare, parts.value))

/** Saisie non numérique (lettres, plusieurs virgules...) : distincte d'un poids plus léger que la tare. */
const isUnreadable = computed(() => fullWeightInput.value.trim() !== '' && fullWeight.value === null)

const tareShare = computed(() => {
  const w = weighing.value
  return w.status === 'ok' ? props.tare / (props.tare + w.net) : 0
})

const partSegments = computed(() => {
  const w = weighing.value
  if (w.status !== 'ok') return []
  const count = parts.value <= MAX_PART_SEGMENTS ? parts.value : 1
  return Array.from({ length: count }, (_, i) => i)
})

const percent = (ratio: number) => `${Math.round(ratio * 100)} %`
</script>

<template>
  <section aria-labelledby="weighing-title" class="rounded-xl border border-default bg-default overflow-hidden">
    <h3 id="weighing-title" class="px-4 pt-4 pb-2 text-sm font-semibold text-highlighted">
      Pesée
    </h3>

    <dl class="divide-y divide-default px-4">
      <div class="flex items-center justify-between gap-4 py-2.5">
        <dt>
          <label for="weighing-full" class="text-sm text-muted">Poids plein</label>
        </dt>
        <dd>
          <UInput
            id="weighing-full"
            v-model="fullWeightInput"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0"
            size="lg"
            variant="outline"
            autofocus
            :color="isUnreadable || weighing.status === 'invalid' ? 'error' : 'primary'"
            :highlight="isUnreadable || weighing.status === 'invalid'"
            :aria-invalid="isUnreadable || weighing.status === 'invalid'"
            aria-describedby="weighing-hint"
            class="w-36"
            :ui="{ base: 'text-right text-lg font-semibold tabular-nums pe-8' }"
          >
            <template #trailing>
              <span class="text-sm text-dimmed">g</span>
            </template>
          </UInput>
        </dd>
      </div>

      <div class="flex items-center justify-between gap-4 py-2.5">
        <dt class="flex items-center gap-2 text-sm text-muted">
          <span class="w-3 text-dimmed" aria-hidden="true">−</span>Tare
        </dt>
        <dd class="text-sm tabular-nums text-muted">
          {{ formatGramsValue(tare) }}&nbsp;g
        </dd>
      </div>

      <div class="flex items-center justify-between gap-4 py-2.5">
        <dt class="flex items-center gap-2 text-sm text-muted">
          <span class="w-3 text-dimmed" aria-hidden="true">=</span>Net cuit
        </dt>
        <dd class="text-sm font-semibold tabular-nums text-highlighted">
          {{ weighing.status === 'ok' ? `${formatGramsValue(weighing.net)} g` : '—' }}
        </dd>
      </div>

      <div class="flex items-center justify-between gap-4 py-2">
        <dt class="flex items-center gap-2 text-sm text-muted">
          <span class="w-3 text-dimmed" aria-hidden="true">÷</span>
          <label for="weighing-parts">Parts</label>
        </dt>
        <dd>
          <UInputNumber
            id="weighing-parts"
            v-model="parts"
            :min="1"
            :max="99"
            size="md"
            variant="outline"
            class="w-36"
            :ui="{ base: 'text-center font-semibold tabular-nums' }"
          />
        </dd>
      </div>
    </dl>

    <div class="mt-2 border-t border-default bg-elevated/50 px-4 py-4 flex flex-col gap-3">
      <div class="flex items-end justify-between gap-4" aria-live="polite">
        <p class="text-sm font-semibold text-highlighted pb-1.5">
          Par part
        </p>
        <p class="flex items-baseline gap-1.5">
          <span
            class="text-4xl font-bold tabular-nums leading-none transition-colors"
            :class="weighing.status === 'ok' ? 'text-highlighted' : 'text-dimmed'"
          >{{ weighing.status === 'ok' ? formatGramsValue(weighing.perPart) : '—' }}</span>
          <span class="text-sm text-dimmed">g</span>
        </p>
      </div>

      <!-- Répartition du poids sur la balance : le récipient, puis chaque part. -->
      <div
        class="flex h-2 gap-0.5 rounded-full bg-accented overflow-hidden"
        role="img"
        :aria-label="weighing.status === 'ok'
          ? `Récipient ${percent(tareShare)} du poids total, nourriture ${percent(1 - tareShare)} en ${parts} part${parts > 1 ? 's' : ''}`
          : 'Pas encore de pesée'"
      >
        <template v-if="weighing.status === 'ok'">
          <div
            class="h-full rounded-full bg-inverted/25 transition-all duration-500"
            :style="{ width: `${tareShare * 100}%` }"
          />
          <div class="flex flex-1 gap-0.5">
            <div
              v-for="i in partSegments"
              :key="i"
              class="h-full flex-1 rounded-full bg-primary transition-all duration-500"
            />
          </div>
        </template>
      </div>

      <p id="weighing-hint" class="text-xs" :class="isUnreadable || weighing.status === 'invalid' ? 'text-error' : 'text-dimmed'">
        <template v-if="isUnreadable">
          Saisissez le poids en grammes, par exemple 2480.
        </template>
        <template v-else-if="weighing.status === 'invalid'">
          Plus léger que le récipient vide : vérifiez le poids affiché par la balance.
        </template>
        <template v-else-if="weighing.status === 'ok'">
          Récipient {{ percent(tareShare) }} · nourriture {{ percent(1 - tareShare) }}
        </template>
        <template v-else>
          Posez le récipient plein sur la balance et saisissez le poids affiché.
        </template>
      </p>
    </div>
  </section>
</template>
