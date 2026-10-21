<script setup lang="ts">
import { COMPARE_ROWS, resolveBasis, valuesOnBasis } from '~/utils/productCompare'
import type { CompareBasis, CompareItem, CompareKey, CompareValue } from '~/utils/productCompare'

type Side = 'a' | 'b'

/**
 * Duel de deux produits, lu comme une étiquette à deux colonnes : une ligne par valeur, A puis B.
 * L'écart est neutre (signé, sans couleur) : « plus » n'est ni mieux ni pire selon qu'on sèche ou qu'on charge.
 * La valeur la plus haute de chaque ligne est seulement plus grasse.
 */
const props = defineProps<{
  /** `null` : comparateur vidé, il attend un premier produit. */
  a: CompareItem | null
  b: CompareItem | null
  /** Côté dont un scan est en cours de recherche. */
  loadingSide?: Side | null
  /** Photo importée en cours de lecture. */
  photoDecoding?: boolean
  /** Côtés dont l'ingrédient du catalogue appartient à l'utilisateur, donc modifiable. */
  editable?: Partial<Record<Side, boolean>>
}>()

const emit = defineEmits<{
  scan: [side: Side]
  photo: [side: Side]
  manual: [side: Side]
  catalog: [side: Side]
  swap: []
  createIngredient: [side: Side]
  remove: [side: Side]
  edit: [side: Side]
}>()

const basis = computed<CompareBasis>(() =>
  props.a && props.b ? resolveBasis(props.a, props.b) : { kind: 'same', base: (props.a ?? props.b)?.base ?? 'g' })

const values = computed(() => ({
  a: props.a ? valuesOnBasis(props.a, 'a', basis.value) : null,
  b: props.b ? valuesOnBasis(props.b, 'b', basis.value) : null,
}))

const comparable = computed(() => !!props.a && !!props.b && basis.value.kind !== 'mismatch' && props.loadingSide !== 'b')

const baseLabel = computed(() => {
  if (basis.value.kind === 'mismatch') return null
  return basis.value.base === 'ml' ? 'pour 100 ml' : 'pour 100 g'
})

function formatNumber(value: number, digits: number) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: digits })
}

const roundTo = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

/** Côté le plus haut d'une ligne, à la précision affichée ; `null` si égalité ou valeur manquante. */
function higherSide(key: CompareKey, digits: number): Side | null {
  if (!comparable.value) return null
  const a = values.value.a?.[key]
  const b = values.value.b?.[key]
  if (!a || !b) return null
  const ra = roundTo(a.value, digits)
  const rb = roundTo(b.value, digits)
  return ra === rb ? null : ra > rb ? 'a' : 'b'
}

/**
 * Écart relatif de B par rapport à A : « +38 % ». Une borne (<, ≥…) ou une estimation rend l'écart approché.
 * A à zéro n'a pas de pourcentage : l'écart reste alors en valeur (« +3 g »).
 */
function delta(key: CompareKey, unit: string, digits: number): string | null {
  if (!comparable.value) return null
  const a = values.value.a?.[key]
  const b = values.value.b?.[key]
  if (!a || !b) return null
  const diff = roundTo(b.value, digits) - roundTo(a.value, digits)
  const approx = a.prefix || b.prefix ? '≈ ' : ''
  if (roundTo(diff, digits) === 0) return `${approx}Identique`
  const sign = diff > 0 ? '+' : '−'
  const base = roundTo(a.value, digits)
  if (base <= 0) return `${approx}${sign}${formatNumber(Math.abs(diff), digits)} ${unit}`
  const pct = Math.round((Math.abs(diff) / base) * 100)
  return `${approx}${pct === 0 ? '<1' : `${sign}${formatNumber(pct, 0)}`} %`
}

const rows = computed(() => COMPARE_ROWS.map(row => ({
  ...row,
  higher: higherSide(row.key, row.digits),
  delta: delta(row.key, row.unit, row.digits),
})))

/** Barre G/P/L d'un côté, en grammes : seulement si les trois macros sont connues. */
function segments(v: Record<CompareKey, CompareValue>) {
  const parts = COMPARE_ROWS.filter(r => r.colorClass)
  if (parts.some(r => !v[r.key])) return []
  const total = parts.reduce((sum, r) => sum + v[r.key]!.value, 0)
  if (total <= 0) return []
  return parts
    .filter(r => v[r.key]!.value > 0)
    .map(r => ({ key: r.key, label: r.label, colorClass: r.colorClass!, grams: v[r.key]!.value, width: `${(v[r.key]!.value / total) * 100}%` }))
}

const bars = computed(() => ({ a: values.value.a ? segments(values.value.a) : [], b: values.value.b ? segments(values.value.b) : [] }))

function barLabel(side: Side) {
  const s = bars.value[side]
  return s.length
    ? `Répartition en grammes : ${s.map(x => `${x.label} ${formatNumber(x.grams, 1)} g`).join(', ')}`
    : 'Répartition indisponible'
}

/** Ce que les cellules ne peuvent pas dire : conversion par la densité, valeurs estimées. */
const footnotes = computed(() => {
  const notes: string[] = []
  const b = basis.value
  if (b.kind === 'converted') {
    const item = b.side === 'a' ? props.a! : props.b!
    notes.push(`${item.name} ramené à 100 ml par sa densité (${formatNumber(b.density, 2)} g/ml)`)
  }
  const all = [props.a, props.b].filter((x): x is CompareItem => !!x).flatMap(x => Object.values(x.values))
  if (all.some(v => v?.prefix === '≈')) notes.push('≈ estimée par Open Food Facts')
  return notes
})

const mismatchText = computed(() => {
  if (basis.value.kind !== 'mismatch' || !props.a || !props.b) return ''
  const per = (item: CompareItem) => (item.base === 'ml' ? '100 ml' : '100 g')
  return `A est donné pour ${per(props.a)}, B pour ${per(props.b)}, sans densité pour passer de l’un à l’autre. Les valeurs restent lisibles, les écarts ne sont pas calculés.`
})

function metaOf(item: CompareItem) {
  if (item.source === 'catalog') return 'Catalogue'
  return item.brand || `EAN ${item.id}`
}

/** Liens d'image morts : on retombe sur l'icône plutôt qu'une image cassée. */
const failedImages = ref(new Set<string>())
const imageOf = (item: CompareItem) => (item.imageUrl && !failedImages.value.has(item.imageUrl) ? item.imageUrl : null)
function onImageError(url: string) {
  failedImages.value = new Set([...failedImages.value, url])
}

const sides = computed(() => [
  { side: 'a' as const, letter: 'A', item: props.a },
  { side: 'b' as const, letter: 'B', item: props.b },
])
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="mismatchText" class="flex gap-2 rounded-lg bg-elevated px-3 py-2 text-sm text-muted">
      <UIcon name="i-lucide-scale" class="mt-0.5 size-4 shrink-0 text-dimmed" aria-hidden="true" />
      <span><span class="font-semibold text-highlighted">Bases différentes.</span> {{ mismatchText }}</span>
    </p>

    <div class="overflow-hidden rounded-xl border border-default">
      <table class="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <!-- Mobile : juste assez pour « Protéines » en 12px sur une ligne, le reste va aux deux produits. -->
          <col class="w-[5.25rem] sm:w-36">
          <col>
          <col>
        </colgroup>

        <thead>
          <tr class="border-b border-default align-top">
            <td class="px-3 pt-3 pb-3 sm:px-4">
              <div class="flex h-full flex-col justify-between gap-3">
                <!-- 10px sur mobile : « pour 100 ml » tient sur une ligne dans la colonne des libellés ; « Bases différentes » peut passer à la ligne. -->
                <span class="text-[0.625rem] leading-tight text-dimmed sm:text-xs" :class="{ 'whitespace-nowrap': baseLabel }">{{ baseLabel ?? 'Bases différentes' }}</span>
                <UTooltip v-if="a && b" text="Inverser A et B">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-arrow-left-right"
                    aria-label="Inverser A et B"
                    class="-ms-1.5 self-start"
                    :disabled="!!loadingSide"
                    @click="emit('swap')"
                  />
                </UTooltip>
              </div>
            </td>

            <th
              v-for="col in sides"
              :key="col.side"
              scope="col"
              class="border-s border-default px-3 pt-3 pb-3 text-start font-normal sm:px-4"
              :aria-busy="loadingSide === col.side"
            >
              <!-- Recherche en cours : la colonne se vide, l'autre reste lisible. -->
              <div v-if="loadingSide === col.side" class="flex h-[7rem] flex-col gap-2 sm:h-[7.75rem]" aria-label="Recherche du produit">
                <USkeleton class="size-11 rounded-lg sm:size-14" />
                <USkeleton class="h-4 w-4/5" />
                <USkeleton class="h-3 w-1/2" />
              </div>

              <div v-else-if="col.item" class="flex h-[7rem] min-w-0 flex-col gap-2 sm:h-[7.75rem]">
                <!-- Fond blanc fixe, même en sombre : les photos OFF sont détourées sur blanc. -->
                <span class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-default bg-white p-0.5 sm:size-14">
                    <img
                      v-if="imageOf(col.item)"
                      :src="imageOf(col.item)!"
                      alt=""
                      class="max-h-full max-w-full object-contain"
                      referrerpolicy="no-referrer"
                      @error="onImageError(col.item.imageUrl!)"
                    >
                    <UIcon
                      v-else
                      :name="col.item.source === 'scan' ? 'i-lucide-package' : 'i-lucide-carrot'"
                      class="size-5 text-neutral-400"
                      aria-hidden="true"
                    />
                </span>
                <div class="flex min-w-0 flex-col gap-0.5">
                  <p class="line-clamp-2 font-semibold leading-snug text-balance wrap-break-word" :class="col.item.name ? 'text-highlighted' : 'text-dimmed'">
                    <span class="sr-only">{{ col.letter }} : </span>{{ col.item.name || 'Nom non renseigné' }}
                  </p>
                  <p class="flex min-w-0 items-center gap-1 text-xs text-muted">
                    <UIcon v-if="col.item.source === 'catalog'" name="i-lucide-book-open" class="size-3 shrink-0" aria-hidden="true" />
                    <span class="truncate tabular-nums">{{ metaOf(col.item) }}</span>
                  </p>
                </div>
              </div>

              <!-- Emplacement à remplir (A d’abord quand le comparateur est vide) : les sources, sans autre détour. -->
              <div v-else-if="col.side === 'a' || a" class="flex h-[7rem] flex-col gap-2 sm:h-[7.75rem]">
                <span class="sr-only">{{ col.letter }} : à choisir</span>
                <div class="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                  <UButton size="sm" icon="i-lucide-scan-barcode" class="justify-center" @click="emit('scan', col.side)">
                    Scanner
                  </UButton>
                  <!-- Recours sans caméra : en icônes côte à côte, comme dans le bloc de scan des repas. -->
                  <div class="flex gap-1.5">
                    <UTooltip :text="photoDecoding ? 'Lecture de la photo…' : 'Importer une photo'">
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-image-up"
                        class="flex-1 justify-center sm:flex-none"
                        :loading="photoDecoding"
                        :aria-label="photoDecoding ? 'Lecture de la photo…' : 'Importer une photo'"
                        @click="emit('photo', col.side)"
                      />
                    </UTooltip>
                    <UTooltip text="Saisir le code">
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-keyboard"
                        class="flex-1 justify-center sm:flex-none"
                        aria-label="Saisir le code"
                        @click="emit('manual', col.side)"
                      />
                    </UTooltip>
                  </div>
                  <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-book-open" class="justify-center" @click="emit('catalog', col.side)">
                    Catalogue
                  </UButton>
                </div>
              </div>
              <!-- B attend que A soit rempli. -->
              <div v-else class="h-[7rem] sm:h-[7.75rem]" />
            </th>
          </tr>
        </thead>

        <tbody class="divide-y divide-default">
          <tr v-for="row in rows" :key="row.key" class="align-middle">
            <th scope="row" class="px-3 py-2.5 text-start font-normal text-muted sm:px-4" :class="row.key === 'calories' ? 'py-3' : ''">
              <span class="block text-xs leading-6 whitespace-nowrap sm:text-sm" :class="row.key === 'calories' ? 'text-highlighted font-medium' : ''">{{ row.label }}</span>
            </th>

            <td
              v-for="col in sides"
              :key="col.side"
              class="border-s border-default px-3 text-end sm:px-4"
              :class="row.key === 'calories' ? 'py-3' : 'py-2.5'"
            >
              <!-- Hauteur fixe : la ligne d'écart est réservée partout, la grille ne bouge pas quand B arrive ou part. -->
              <div class="flex flex-col items-end justify-center" :class="row.key === 'calories' ? 'h-[2.875rem] sm:h-[3.125rem]' : 'h-[2.625rem]'">
                <template v-if="col.item && loadingSide !== col.side">
                  <span
                    v-if="values[col.side]?.[row.key]"
                    class="tabular-nums text-highlighted"
                    :class="[
                      row.key === 'calories' ? 'text-xl sm:text-2xl tracking-tight' : 'text-base',
                      row.higher === col.side ? 'font-bold' : 'font-normal',
                    ]"
                  >
                    <span v-if="values[col.side]![row.key]!.prefix" class="font-normal text-muted">{{ values[col.side]![row.key]!.prefix }}</span>{{ formatNumber(values[col.side]![row.key]!.value, row.digits) }}<span class="text-sm font-normal text-dimmed">&nbsp;{{ row.unit }}</span>
                  </span>
                  <span v-else class="text-dimmed" :class="row.key === 'calories' ? 'text-xl sm:text-2xl' : 'text-base'" aria-label="Non renseigné">—</span>

                  <!-- Toujours réservée, même vide : centrées, les valeurs de A et de B restent sur la même ligne. -->
                  <span class="mt-0.5 block h-4 max-w-full truncate text-xs tabular-nums text-muted" :aria-hidden="!(col.side === 'b' && row.delta)">
                    <template v-if="col.side === 'b' && row.delta">
                      <span class="sr-only">Écart avec A : </span>{{ row.delta }}
                    </template>
                  </span>
                </template>
                <span v-else-if="loadingSide === col.side" class="block w-full py-1">
                  <USkeleton class="ms-auto h-4 w-2/3" />
                </span>
                <span v-else class="text-dimmed" aria-hidden="true">·</span>
              </div>
            </td>
          </tr>
        </tbody>

        <!-- Répartition G/P/L en pied : elle résume les lignes de macros juste au-dessus. -->
        <tfoot>
          <tr class="border-t border-default">
            <th scope="row" class="px-3 py-1.5 text-start font-normal text-muted sm:px-4">
              <span class="block text-xs leading-6 whitespace-nowrap sm:text-sm">Ratio</span>
            </th>
            <td v-for="col in sides" :key="col.side" class="border-s border-default px-3 py-3 sm:px-4">
              <div
                v-if="col.item && loadingSide !== col.side"
                class="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-accented"
                role="img"
                :aria-label="barLabel(col.side)"
              >
                <div
                  v-for="segment in bars[col.side]"
                  :key="segment.key"
                  class="h-full rounded-full transition-all duration-500"
                  :class="segment.colorClass"
                  :style="{ width: segment.width }"
                />
              </div>
              <div v-else class="h-1.5 rounded-full bg-elevated" />
            </td>
          </tr>
          <tr class="border-t border-default align-top">
            <td />
            <td v-for="col in sides" :key="col.side" class="border-s border-default px-3 py-2.5 sm:px-4">
              <!-- Hauteur de deux boutons empilés réservée, qu'il y ait « Créer » ou « Modifier » sous « Retirer », « Retirer » seul ou rien. -->
              <div class="flex h-[4.375rem] flex-col gap-1.5 sm:items-start">
                <template v-if="col.item && loadingSide !== col.side">
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-x"
                    class="justify-center"
                    :aria-label="`Retirer ${col.item.name || `le produit ${col.letter}`} du comparateur`"
                    @click="emit('remove', col.side)"
                  >
                    Retirer
                  </UButton>
                  <!-- Un ingrédient du catalogue existe déjà : seul un produit scanné se crée. -->
                  <UButton
                    v-if="col.item.source === 'scan' && col.item.off"
                    size="sm"
                    icon="i-lucide-plus"
                    class="justify-center"
                    :aria-label="`Créer l’ingrédient ${col.item.name || col.letter}`"
                    @click="emit('createIngredient', col.side)"
                  >
                    Créer
                  </UButton>
                  <!-- Seulement ses propres ingrédients : ceux du catalogue public ne se modifient pas. -->
                  <UButton
                    v-if="col.item.source === 'catalog' && editable?.[col.side]"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-pencil"
                    class="justify-center"
                    :aria-label="`Modifier l’ingrédient ${col.item.name}`"
                    @click="emit('edit', col.side)"
                  >
                    Modifier
                  </UButton>
                </template>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-if="footnotes.length" class="text-xs text-dimmed">
      {{ footnotes.join(' · ') }}
    </p>
  </div>
</template>
