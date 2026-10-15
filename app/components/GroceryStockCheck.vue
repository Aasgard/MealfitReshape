<script setup lang="ts">
/**
 * « Vérifier un article », entre deux courses : combien les repas planifiés vont encore prendre d'un ingrédient,
 * d'aujourd'hui à la fin de la période, et si ce qu'on en a suffit. Deux temps dans le même panneau : la liste des
 * ingrédients des repas (ordre alphabétique, filtre), puis le registre jour par jour d'un ingrédient, où le stock saisi
 * se vide jusqu'au jour où il ne suffit plus. Ce qui manque s'ajoute à la liste en complément.
 * Rien n'est enregistré ici : ni le stock saisi, ni les lignes du jour écartées (« Déjà cuisiné », « Déjà mangé »).
 * Écran tactile : panneau du bas, remonté au-dessus du clavier ; sinon panneau latéral.
 */
import { createReusableTemplate, useMediaQuery } from '@vueuse/core'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  checkStock,
  formatStockAmount,
  parseStockInput,
  stockUnitOf,
  toBuyFor,
  type StockNeedEntry,
  type StockNeedIngredient,
  type StockNeedOrigin,
} from '~/utils/stockCheck'
import { groceryDayLabel } from '~/utils/groceryList'
import { piecesFor } from '~/utils/shoppingList'

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const toast = useToast()
const list = useInjectedGroceryList()
const check = useStockCheck(list)
const [DefineContent, ReuseContent] = createReusableTemplate()
const [DefineFooter, ReuseFooter] = createReusableTemplate()

const isTouch = useMediaQuery('(pointer: coarse)')
useKeyboardInset(() => open.value && isTouch.value)

const filter = ref('')
const selectedId = ref<string | null>(null)
const haveText = ref('')
/** Lignes du jour écartées : gardées tant que la page est ouverte, jamais enregistrées. */
const excluded = ref(new Set<string>())
const isAdding = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  filter.value = ''
  selectedId.value = null
  haveText.value = ''
})

const todayKey = computed(() => format(list.today, 'yyyy-MM-dd'))
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const dayLabel = (date: string) => groceryDayLabel(parseISO(date), list.today)
const dayTitle = (date: string) => capitalize(dayLabel(date))

/** « jusqu'à dim. 19 », « jusqu'à demain », « pour aujourd'hui ». */
const untilLabel = computed(() => {
  const end = check.days?.end
  if (!end) return ''
  return end === todayKey.value ? 'pour aujourd\'hui' : `jusqu'à ${dayLabel(end)}`
})

// --- Liste des ingrédients ---

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const ingredients = computed(() => {
  const query = normalize(filter.value.trim())
  return query ? check.needs.ingredients.filter(item => normalize(item.label).includes(query)) : check.needs.ingredients
})

/** Total des besoins, lignes écartées non comptées : ce que la liste annonce avant d'ouvrir le détail. */
function totalLabel(item: StockNeedIngredient) {
  const result = checkStock(item, excluded.value, null, { grams: 0, milliliters: 0 })
  return formatStockAmount(result.need, result.unit, item.gramsPerPiece)
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

// --- Détail d'un ingrédient ---

const selected = computed(() => check.needs.ingredients.find(item => item.ingredientId === selectedId.value) ?? null)

/** L'ingrédient a quitté les repas de la période (repas retiré, période changée) : retour à la liste. */
watch(selected, (item) => {
  if (!item && selectedId.value && !check.isLoading) selectedId.value = null
})

function select(item: StockNeedIngredient) {
  selectedId.value = item.ingredientId
  haveText.value = ''
}

function back() {
  selectedId.value = null
}

const unit = computed(() => (selected.value ? stockUnitOf(selected.value) : 'g'))
const unitSuffix = computed(() => ({ piece: 'pièces', g: 'g', ml: 'ml' })[unit.value])
const have = computed(() => parseStockInput(haveText.value, unit.value, selected.value?.gramsPerPiece))
const isHaveInvalid = computed(() => haveText.value.trim() !== '' && have.value == null)

const result = computed(() => {
  const item = selected.value
  const span = check.days
  if (!item || !span) return null
  return checkStock(item, excluded.value, have.value, toBuyFor(list.items, item.ingredientId, span))
})

const amount = (value: number, rounding: 'up' | 'nearest' = 'up') =>
  formatStockAmount(value, unit.value, selected.value?.gramsPerPiece, rounding)

type Verdict = { tone: 'enough' | 'covered' | 'short', icon: string, title: string, detail: string }

/** Réponse en une phrase, dès que le stock est saisi. */
const verdict = computed<Verdict | null>(() => {
  const r = result.value
  if (!r || have.value == null) return null
  if (!r.runOutDate) {
    const left = have.value - r.need
    return {
      tone: 'enough',
      icon: 'i-lucide-circle-check',
      title: r.need > 0 ? `Assez ${untilLabel.value}` : 'Rien à prévoir',
      detail: left > 0.5 ? `Il en restera ${amount(left, 'nearest')}.` : 'Juste ce qu\'il faut.',
    }
  }
  const runOut = r.runOutDate === todayKey.value
    ? 'Pas assez pour aujourd\'hui'
    : `Ça tient jusqu'à ${dayLabel(format(addDays(parseISO(r.runOutDate), -1), 'yyyy-MM-dd'))}`
  if (!r.missing) {
    return {
      tone: 'covered',
      icon: 'i-lucide-shopping-basket',
      title: runOut,
      detail: `La suite est déjà dans la liste (${amount(r.toBuy)}).`,
    }
  }
  return {
    tone: 'short',
    icon: 'i-lucide-triangle-alert',
    title: `Il en manquera ${amount(r.missing)}`,
    detail: `${runOut}${r.toBuy > 0 ? `, en comptant les ${amount(r.toBuy)} déjà dans la liste` : ''}.`,
  }
})

const VERDICT_TONE = {
  enough: 'text-success',
  covered: 'text-highlighted',
  short: 'text-error',
} as const

const ORIGIN_LABEL: Record<StockNeedOrigin, string> = {
  bought: 'acheté',
  listed: 'dans la liste',
  unlisted: 'pas listé',
}

const isToday = (entry: StockNeedEntry) => entry.date === todayKey.value
const doneLabel = (entry: StockNeedEntry) => (entry.kind === 'recipe' ? 'Déjà cuisiné' : 'Déjà mangé')

function toggleExcluded(entry: StockNeedEntry, isDone: boolean) {
  const next = new Set(excluded.value)
  if (isDone) next.add(entry.id)
  else next.delete(entry.id)
  excluded.value = next
}

/** Part du stock saisi qui reste après le jour, pour la jauge : vide (et rouge) quand il ne suffit plus. */
function gaugeOf(remaining: number | null) {
  if (remaining == null || have.value == null) return null
  if (remaining < -1e-6) return { width: '100%', isShort: true }
  return { width: `${have.value > 0 ? Math.min(100, remaining / have.value * 100) : 0}%`, isShort: false }
}

function remainingLabel(remaining: number) {
  return remaining < -1e-6 ? `manque ${amount(-remaining)}` : `reste ${amount(remaining, 'nearest')}`
}

// --- Ajout du manque ---

const missingLabel = computed(() => (result.value?.missing ? amount(result.value.missing) : ''))
const isUrgent = computed(() => {
  const runOut = result.value?.runOutDate
  return !!runOut && differenceInCalendarDays(parseISO(runOut), list.today) <= 1
})

async function addMissing() {
  const item = selected.value
  const r = result.value
  if (!item || !r?.missing || !r.runOutDate) return
  const ingredient = check.ingredientsById.get(item.ingredientId)
  const grams = r.unit === 'ml'
    ? 0
    : r.unit === 'piece' && item.gramsPerPiece ? piecesFor(r.missing, item.gramsPerPiece) * item.gramsPerPiece : Math.ceil(r.missing)
  const quantity = missingLabel.value
  isAdding.value = true
  await list.addComplement(
    { id: item.ingredientId, label: item.label, categoryId: ingredient?.category?.id },
    { grams, milliliters: r.unit === 'ml' ? Math.ceil(r.missing) : 0 },
    { quantity, neededBy: r.runOutDate, urgent: isUrgent.value },
  ).catch(() => {})
  isAdding.value = false
  toast.add({
    title: 'Ajouté à la liste',
    description: `${item.label} : ${quantity}, pour ${dayLabel(r.runOutDate)}.`,
    color: 'success',
    icon: 'i-lucide-check',
  })
}
</script>

<template>
  <DefineContent>
    <!-- Liste : les ingrédients des repas de la période. -->
    <div v-if="!selected" class="flex flex-col gap-3">
      <p v-if="!check.days" class="rounded-lg border border-dashed border-default px-4 py-6 text-center text-sm text-muted">
        {{ list.rangeDays ? 'La période de la liste est déjà passée. Choisissez-en une qui va jusqu\'à aujourd\'hui ou au-delà.' : 'Choisissez une période complète dans « Lister ».' }}
      </p>

      <template v-else>
        <UInput
          v-model="filter"
          icon="i-lucide-search"
          placeholder="Filtrer les ingrédients"
          autocomplete="off"
          enterkeyhint="search"
          :autofocus="!isTouch"
          class="w-full"
          aria-label="Filtrer les ingrédients"
        />

        <p v-if="check.isLoading" class="py-8 text-center text-sm text-muted">
          Calcul des besoins…
        </p>

        <p v-else-if="!check.needs.ingredients.length" class="rounded-lg border border-dashed border-default px-4 py-6 text-center text-sm text-muted">
          Aucun repas planifié n'utilise d'ingrédient {{ untilLabel }}.
        </p>

        <template v-else>
          <p class="flex items-baseline justify-between gap-3 border-b border-default pb-1 text-xs text-dimmed">
            <span>{{ plural(check.needs.ingredients.length, 'ingrédient') }} {{ untilLabel }}</span>
            <span>Besoin</span>
          </p>

          <ul v-if="ingredients.length" class="-mt-3 divide-y divide-default">
            <li v-for="item in ingredients" :key="item.ingredientId">
              <button
                type="button"
                class="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-start transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                @click="select(item)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-highlighted">{{ item.label }}</span>
                  <span class="block text-xs text-dimmed">dès {{ dayLabel(item.entries[0]!.date) }}</span>
                </span>
                <span class="shrink-0 text-sm tabular-nums text-highlighted">{{ totalLabel(item) }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p v-else class="py-6 text-center text-sm text-muted">
            Aucun ingrédient ne correspond à « {{ filter.trim() }} ».
          </p>

          <p v-if="check.needs.skipped.length" class="flex gap-2 text-xs text-dimmed">
            <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>Non compté : {{ check.needs.skipped.join(', ') }}.</span>
          </p>
        </template>
      </template>
    </div>

    <!-- Détail : le registre d'un ingrédient. -->
    <div v-else-if="result" class="flex flex-col gap-5">
      <div class="flex flex-col gap-1">
        <UButton
          label="Tous les ingrédients"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="link"
          size="sm"
          class="-ms-2.5 self-start"
          @click="back"
        />
        <h3 class="text-lg font-bold tracking-tight text-highlighted">
          {{ selected.label }}
        </h3>
      </div>

      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-4">
        <div class="flex min-w-0 flex-col">
          <span class="text-xs text-muted">À prévoir {{ untilLabel }}</span>
          <span class="text-4xl font-bold leading-tight tracking-tight tabular-nums text-highlighted">{{ amount(result.need) }}</span>
        </div>

        <UFormField label="J'en ai" :error="isHaveInvalid ? 'Un nombre, ex. 300' : undefined" class="min-w-0">
          <UInput
            v-model="haveText"
            inputmode="decimal"
            enterkeyhint="done"
            autocomplete="off"
            placeholder="Combien ?"
            size="lg"
            class="w-full"
            :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }"
          >
            <template #trailing>
              <span class="text-sm text-dimmed">{{ unitSuffix }}</span>
            </template>
          </UInput>
        </UFormField>
      </div>

      <p v-if="result.uncountedMilliliters > 0" class="-mt-3 text-xs text-dimmed">
        Plus {{ formatStockAmount(result.uncountedMilliliters, 'ml') }} non comptés : l'ingrédient n'a pas de densité pour les convertir.
      </p>

      <!-- La réponse, en une phrase. -->
      <div aria-live="polite">
        <div v-if="verdict" class="flex gap-3 rounded-lg bg-elevated px-3.5 py-3">
          <UIcon :name="verdict.icon" class="mt-0.5 size-5 shrink-0" :class="VERDICT_TONE[verdict.tone]" aria-hidden="true" />
          <div class="min-w-0">
            <p class="font-semibold tabular-nums" :class="VERDICT_TONE[verdict.tone]">
              {{ verdict.title }}
            </p>
            <p class="text-sm tabular-nums text-muted">
              {{ verdict.detail }}
            </p>
          </div>
        </div>
        <p v-else class="text-xs text-dimmed">
          Saisissez ce que vous avez pour savoir jusqu'à quand ça tient.
        </p>
      </div>

      <!-- Registre : la réserve se vide jour après jour. -->
      <section aria-labelledby="stock-ledger-title" class="flex flex-col">
        <h4 id="stock-ledger-title" class="flex items-baseline justify-between gap-3 border-b border-default pb-1 text-xs font-semibold uppercase tracking-wide text-dimmed">
          <span>Jour par jour</span>
          <span v-if="have != null" class="font-normal normal-case tracking-normal">Après le jour</span>
        </h4>
        <ol class="divide-y divide-default">
          <li v-for="day in result.days" :key="day.date" class="flex flex-col gap-1.5 py-3">
            <div class="flex items-baseline gap-3">
              <span
                class="min-w-0 flex-1 text-sm font-semibold"
                :class="day.date === result.runOutDate ? 'text-error' : 'text-highlighted'"
              >{{ dayTitle(day.date) }}</span>
              <span
                v-if="day.remaining != null"
                class="shrink-0 text-xs tabular-nums"
                :class="day.remaining < -1e-6 ? 'font-semibold text-error' : 'text-muted'"
              >{{ remainingLabel(day.remaining) }}</span>
            </div>

            <div
              v-if="gaugeOf(day.remaining)"
              class="h-1 overflow-hidden rounded-full bg-accented"
              aria-hidden="true"
            >
              <div
                class="stock-gauge h-full rounded-full"
                :class="gaugeOf(day.remaining)!.isShort ? 'bg-error' : 'bg-primary'"
                :style="{ width: gaugeOf(day.remaining)!.width }"
              />
            </div>

            <ul class="flex flex-col gap-1">
              <li v-for="entry in day.entries" :key="entry.id" class="flex flex-col gap-1">
                <div class="flex items-baseline gap-3" :class="excluded.has(entry.id) && 'text-dimmed'">
                  <span class="min-w-0 flex-1 text-sm" :class="excluded.has(entry.id) ? 'line-through' : 'text-default'">
                    <span class="truncate">{{ entry.label }}</span>
                    <span class="text-xs text-dimmed"> · {{ ORIGIN_LABEL[entry.origin] }}</span>
                  </span>
                  <span class="shrink-0 text-sm tabular-nums" :class="excluded.has(entry.id) ? 'line-through' : 'text-highlighted'">
                    {{ amount(unit === 'ml' ? entry.milliliters : entry.grams) }}
                  </span>
                </div>
                <USwitch
                  v-if="isToday(entry)"
                  :model-value="excluded.has(entry.id)"
                  :label="doneLabel(entry)"
                  size="xs"
                  :ui="{ label: 'text-xs font-normal text-muted' }"
                  @update:model-value="toggleExcluded(entry, $event)"
                />
              </li>
            </ul>
          </li>
        </ol>
      </section>
    </div>
  </DefineContent>

  <DefineFooter>
    <div v-if="selected && result?.missing" class="flex w-full flex-col gap-1.5">
      <UButton
        :label="`Ajouter ${missingLabel} à la liste`"
        icon="i-lucide-plus"
        size="lg"
        block
        :loading="isAdding"
        @click="addMissing"
      />
      <p class="text-center text-xs text-dimmed">
        Pour {{ dayLabel(result.runOutDate!) }}{{ isUrgent ? ', marqué urgent' : '' }} · « {{ selected.label }} (complément) »
      </p>
    </div>
  </DefineFooter>

  <UDrawer
    v-if="isTouch"
    v-model:open="open"
    title="Vérifier un article"
    :description="selected ? undefined : 'Ce que les repas prévus vont encore prendre.'"
    :ui="{ content: KEYBOARD_AWARE_DRAWER_CONTENT, body: 'pb-4', footer: 'pt-0' }"
  >
    <template #body>
      <ReuseContent />
    </template>
    <template v-if="selected && result?.missing" #footer>
      <ReuseFooter />
    </template>
  </UDrawer>

  <USlideover
    v-else
    v-model:open="open"
    title="Vérifier un article"
    description="Ce que les repas prévus vont encore prendre."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <ReuseContent />
    </template>
    <template v-if="selected && result?.missing" #footer>
      <ReuseFooter />
    </template>
  </USlideover>
</template>

<style scoped>
/* La jauge suit le stock saisi : elle se vide en glissant plutôt qu'en sautant. */
.stock-gauge {
  transition: width 320ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .stock-gauge {
    transition: none;
  }
}
</style>
