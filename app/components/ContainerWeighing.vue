<script setup lang="ts">
import { parsePositiveNumber } from '~/utils/numberInput'
import { computeWeighing, formatGramsValue } from '~/utils/containerWeighing'

/**
 * Fiche de pesée d'un meal prep, lue comme une étiquette nutritionnelle :
 * récipient plein − récipient vide = net, ÷ parts = poids d'une part. Recalculée à chaque frappe.
 * Par défaut, le net est divisé en parts égales ; la carte « Répartition non homogène », une fois ouverte,
 * le répartit entre des boîtes de tailles différentes (ex. 1 + 1,5 + 0,5 parts).
 * Rien n'est enregistré : remonter le composant (`key`) le remet à zéro.
 */
const props = defineProps<{
  /** Poids à vide du récipient, en grammes. */
  tare: number
}>()

/** Steppers uniquement, sans champ de saisie : aucun clavier ne s'ouvre sur mobile. */
const MAX_PARTS = 20
/** Parts d'une boîte de la répartition non homogène : par demi-part. */
const PORTION_STEP = 0.5
/** Au-delà, la liste et la barre deviennent illisibles. */
const MAX_PORTIONS = 20

type Portion = { id: number; parts: number }

const fullWeightInput = ref('')
/** Division régulière : nombre entier de parts égales. */
const parts = ref(1)
const stepParts = (direction: 1 | -1) => {
  parts.value = Math.min(MAX_PARTS, Math.max(1, parts.value + direction))
}

const unevenOpen = ref(false)
let nextPortionId = 0
const newPortion = (): Portion => ({ id: nextPortionId++, parts: 1 })
const portions = ref<Portion[]>([])
/** Boîtes retouchées : on garde la répartition saisie quand la carte est refermée puis rouverte. */
const portionsEdited = ref(false)

// À l'ouverture, la répartition part de la division régulière : une boîte d'une part par part.
watch(unevenOpen, (isOpen) => {
  if (isOpen && !portionsEdited.value) portions.value = Array.from({ length: parts.value }, newPortion)
})

const stepPortion = (portion: Portion, direction: 1 | -1) => {
  portion.parts = Math.min(MAX_PARTS, Math.max(PORTION_STEP, portion.parts + direction * PORTION_STEP))
  portionsEdited.value = true
}
const addPortion = () => {
  if (portions.value.length >= MAX_PORTIONS) return
  portions.value.push(newPortion())
  portionsEdited.value = true
}
const removePortion = (id: number) => {
  portions.value = portions.value.filter(portion => portion.id !== id)
  portionsEdited.value = true
}

/** Parts de chaque boîte : celles de la répartition si la carte est ouverte, sinon des parts égales. */
const portionParts = computed(() =>
  unevenOpen.value ? portions.value.map(portion => portion.parts) : Array.from({ length: parts.value }, () => 1),
)
const totalParts = computed(() => portionParts.value.reduce((sum, p) => sum + p, 0))

const formatParts = (value: number) => value.toLocaleString('fr-FR')
const formatPartsLabel = (value: number) => `${formatParts(value)} part${value > 1 ? 's' : ''}`

const fullWeight = computed(() => parsePositiveNumber(fullWeightInput.value))
const weighing = computed(() => computeWeighing(fullWeight.value, props.tare, portionParts.value))

/** Saisie non numérique (lettres, plusieurs virgules...) : distincte d'un poids plus léger que la tare. */
const isUnreadable = computed(() => fullWeightInput.value.trim() !== '' && fullWeight.value === null)

const tareShare = computed(() => {
  const w = weighing.value
  return w.status === 'ok' ? props.tare / (props.tare + w.net) : 0
})

const portionWeight = (index: number) => {
  const w = weighing.value
  return w.status === 'ok' ? `${formatGramsValue(w.portionWeights[index]!)} g` : '— g'
}

const percent = (ratio: number) => `${Math.round(ratio * 100)} %`
</script>

<template>
  <div class="flex flex-col gap-3">
    <section aria-labelledby="weighing-title" class="rounded-xl border border-default bg-default overflow-hidden">
      <h3 id="weighing-title" class="px-4 pt-4 pb-2 text-sm font-semibold text-highlighted">
        Pesée
      </h3>

      <dl class="divide-y divide-default px-4">
        <div class="flex items-center justify-between gap-4 py-2.5">
          <dt>
            <label for="weighing-full" class="text-sm text-muted">Récipient plein</label>
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
            <span class="w-3 text-dimmed" aria-hidden="true">−</span>Récipient vide
          </dt>
          <dd class="text-sm tabular-nums text-muted">
            {{ formatGramsValue(tare) }}&nbsp;g
          </dd>
        </div>

        <div class="flex items-center justify-between gap-4 py-2.5">
          <dt class="flex items-center gap-2 text-sm text-muted">
            <span class="w-3 text-dimmed" aria-hidden="true">=</span>Net
          </dt>
          <dd class="text-sm font-semibold tabular-nums text-highlighted">
            {{ weighing.status === 'ok' ? `${formatGramsValue(weighing.net)} g` : '—' }}
          </dd>
        </div>

        <div class="flex items-center justify-between gap-4 py-2">
          <dt class="flex items-center gap-2 text-sm text-muted">
            <span class="w-3 text-dimmed" aria-hidden="true">÷</span>
            <span id="weighing-parts-label">Parts</span>
          </dt>
          <dd>
            <!-- Répartition non homogène ouverte : le total de ses boîtes remplace la division régulière. -->
            <p
              v-if="unevenOpen"
              class="flex h-9 items-center text-sm font-semibold tabular-nums text-highlighted"
              title="Réglé par la répartition non homogène"
            >
              {{ formatParts(totalParts) }}
            </p>
            <!-- Sans champ de saisie : seuls − et + changent le nombre de parts, aucun clavier ne s'ouvre sur mobile. -->
            <div
              v-else
              role="group"
              aria-labelledby="weighing-parts-label"
              class="flex w-36 items-center justify-between rounded-md ring ring-inset ring-accented"
            >
              <UButton
                icon="i-lucide-minus"
                color="primary"
                variant="link"
                size="md"
                aria-label="Retirer une part"
                :disabled="parts <= 1"
                @click="stepParts(-1)"
              />
              <span class="text-sm font-semibold text-highlighted tabular-nums" aria-live="polite">
                <span aria-hidden="true">{{ parts }}</span>
                <span class="sr-only">{{ formatPartsLabel(parts) }}</span>
              </span>
              <UButton
                icon="i-lucide-plus"
                color="primary"
                variant="link"
                size="md"
                aria-label="Ajouter une part"
                :disabled="parts >= MAX_PARTS"
                @click="stepParts(1)"
              />
            </div>
          </dd>
        </div>
      </dl>

      <div class="mt-2 border-t border-default bg-elevated/50 px-4 py-4 flex flex-col gap-3">
        <!-- Répartition non homogène ouverte : chaque boîte a son poids, un poids par part régulier induirait en erreur. -->
        <div v-if="!unevenOpen" class="flex items-end justify-between gap-4" aria-live="polite">
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

        <!-- Répartition du poids sur la balance : le récipient, puis chaque boîte à la taille de ses parts. -->
        <div
          class="flex h-2 gap-0.5 rounded-full bg-accented overflow-hidden"
          role="img"
          :aria-label="weighing.status === 'ok'
            ? `Récipient ${percent(tareShare)} du poids total, nourriture ${percent(1 - tareShare)} en ${formatPartsLabel(totalParts)}`
            : 'Pas encore de pesée'"
        >
          <template v-if="weighing.status === 'ok'">
            <div
              class="h-full rounded-full bg-inverted/25 transition-all duration-500"
              :style="{ width: `${tareShare * 100}%` }"
            />
            <div class="flex flex-1 gap-0.5">
              <div
                v-for="(weight, i) in portionParts"
                :key="i"
                class="h-full basis-0 rounded-full bg-primary transition-all duration-500"
                :style="{ flexGrow: weight }"
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

    <!-- Boîtes de tailles différentes : repliée par défaut, la division régulière couvre le cas courant. -->
    <UCollapsible v-model:open="unevenOpen" class="rounded-xl border border-default bg-default">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-3 rounded-xl p-4 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span class="flex-1">
          <span class="block text-sm font-semibold text-highlighted">Répartition non homogène</span>
          <span class="block text-xs text-dimmed">
            {{ unevenOpen ? `${portions.length} boîte${portions.length > 1 ? 's' : ''} · ${formatPartsLabel(totalParts)}` : 'Boîtes de tailles différentes' }}
          </span>
        </span>
        <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-dimmed transition-transform duration-200" :class="unevenOpen && 'rotate-180'" />
      </button>

      <template #content>
        <div class="flex flex-col gap-3 border-t border-default px-4 pb-4">
          <ul class="flex flex-col divide-y divide-default" aria-live="polite">
            <li
              v-for="(portion, index) in portions"
              :key="portion.id"
              class="flex items-center gap-2 py-2"
            >
              <span class="min-w-0 flex-1 truncate text-sm text-muted">Boîte {{ index + 1 }}</span>

              <!-- Sans champ de saisie : seuls − et + changent les parts, aucun clavier ne s'ouvre sur mobile. -->
              <div class="flex items-center gap-1.5">
                <div
                  role="group"
                  :aria-label="`Parts de la boîte ${index + 1}`"
                  class="flex items-center rounded-md ring ring-inset ring-accented"
                >
                  <UButton
                    icon="i-lucide-minus"
                    color="primary"
                    variant="link"
                    size="sm"
                    aria-label="Retirer une demi-part"
                    :disabled="portion.parts <= PORTION_STEP"
                    @click="stepPortion(portion, -1)"
                  />
                  <span class="w-7 text-center text-sm font-semibold text-highlighted tabular-nums">
                    <span aria-hidden="true">{{ formatParts(portion.parts) }}</span>
                    <span class="sr-only">{{ formatPartsLabel(portion.parts) }}</span>
                  </span>
                  <UButton
                    icon="i-lucide-plus"
                    color="primary"
                    variant="link"
                    size="sm"
                    aria-label="Ajouter une demi-part"
                    :disabled="portion.parts >= MAX_PARTS"
                    @click="stepPortion(portion, 1)"
                  />
                </div>
                <span class="w-8 text-xs text-dimmed" aria-hidden="true">part{{ portion.parts > 1 ? 's' : '' }}</span>
              </div>

              <span
                class="w-16 text-right text-base font-bold tabular-nums transition-colors"
                :class="weighing.status === 'ok' ? 'text-highlighted' : 'text-dimmed'"
              >{{ portionWeight(index) }}</span>

              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="`Retirer la boîte ${index + 1}`"
                :class="portions.length > 1 ? '' : 'invisible'"
                :disabled="portions.length <= 1"
                @click="removePortion(portion.id)"
              />
            </li>
          </ul>

          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="soft"
            size="sm"
            class="self-start"
            :disabled="portions.length >= MAX_PORTIONS"
            @click="addPortion"
          >
            Ajouter une boîte
          </UButton>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
