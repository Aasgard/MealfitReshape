<script setup lang="ts">
/**
 * Mode « Lister » : à gauche les repas de la période, cochés s'ils sont dans la liste (cocher ajoute, décocher retire,
 * aussitôt), à droite la liste par rayon.
 * Ici pas de case à cocher sur les articles : « J'en ai déjà » les range dans un groupe à part,
 * pour ne jamais confondre avec la case « dans le panier » du mode magasin.
 */
import { useElementSize, useIntersectionObserver, useMediaQuery } from '@vueuse/core'
import type { Ref } from 'vue'
import type { GroceryMealRow } from '~/composables/useGroceryList'
import type { GroceryLine } from '~/utils/groceryList'

const list = useInjectedGroceryList()

const inputDate = useTemplateRef('inputDate')
const atHomeOpen = ref(false)

/**
 * Ouvert d'office sur grand écran (les deux panneaux tiennent côte à côte), et sur mobile quand la liste est vide au
 * chargement : c'est par là qu'on la remplit.
 */
const isWide = useMediaQuery('(min-width: 1024px)')

/**
 * En-têtes collés en haut de l'écran quand la page défile (mobile) ; les en-têtes de rayon se calent sous celui de
 * « Produits », dont la hauteur est mesurée. Sur grand écran, chaque panneau défile sous son en-tête fixe.
 */
const listHeader = useTemplateRef('listHeader')
const { height: listHeaderHeight } = useElementSize(listHeader, undefined, { box: 'border-box' })

/**
 * Un en-tête collé perd ses coins arrondis (sinon la liste transparaît dans les angles). Un repère sans hauteur placé
 * juste au-dessus de lui sort du conteneur qui défile au moment où il se colle.
 */
function useStuck(sentinel: Readonly<Ref<HTMLElement | null>>) {
  const stuck = ref(false)
  const root = computed(() => sentinel.value?.closest<HTMLElement>('[data-slot="body"]') ?? null)
  useIntersectionObserver(sentinel, ([entry]) => {
    stuck.value = !!entry && !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)
  }, { root })
  return stuck
}
const isSourceStuck = useStuck(useTemplateRef<HTMLElement>('sourceSentinel'))
const isListStuck = useStuck(useTemplateRef<HTMLElement>('listSentinel'))

const sourceOpen = ref(true)
const stopInitialOpen = watch(() => list.isLoading, (loading) => {
  if (loading) return
  sourceOpen.value = isWide.value || !list.lines.length
  queueMicrotask(() => stopInitialOpen())
}, { immediate: true })

function openAddItem() {
  list.isAddItemOpen = true
}

const groups = computed(() => {
  const result: { aisle: GroceryLine['aisle'], lines: GroceryLine[] }[] = []
  for (const line of list.filteredToBuy) {
    let group = result.at(-1)
    if (group?.aisle.id !== line.aisle.id) {
      group = { aisle: line.aisle, lines: [] }
      result.push(group)
    }
    group.lines.push(line)
  }
  return result
})

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

const sourceSummary = computed(() => {
  if (list.isLoadingMeals) return 'Chargement des repas…'
  if (!list.mealRows.length) return 'Aucun repas sur la période'
  return `${list.mealRows.length} repas · ${list.includedRowCount} dans la liste`
})

/** « Prévu par Alexia », « Prévu aussi par Alexia » quand le compte connecté en a prévu lui aussi. */
const plannedByLabel = (row: GroceryMealRow) =>
  `Prévu ${row.isPlannedBySelf ? 'aussi ' : ''}par ${row.plannedBy.map(member => member.name).join(' et ')}`

// --- Magasins : rattachement d'un article, ou de plusieurs en mode sélection ---

/** État de la case d'un rayon en mode sélection : tous ses articles, certains, ou aucun. */
function aisleSelection(lines: GroceryLine[]): boolean | 'indeterminate' {
  const count = lines.filter(line => list.selectedIds.has(line.id)).length
  return count === 0 ? false : count === lines.length ? true : 'indeterminate'
}

const allVisibleSelected = computed(() => list.filteredToBuy.length > 0 && list.filteredToBuy.every(line => list.selectedIds.has(line.id)))

function toggleAllVisible() {
  list.setSelected(list.filteredToBuy, !allVisibleSelected.value)
}

const bulkPickerOpen = ref(false)

/** Rattachement fait depuis la barre de sélection : la sélection a servi, on la quitte. */
function onBulkChanged() {
  list.stopSelection()
}

/**
 * Appui long sur un article (tactile) : entre en mode sélection avec lui. Ignoré sur la quantité et les boutons
 * d'action, qui ont leurs propres gestes ; un glissement l'annule (défilement).
 */
let pressTimer: ReturnType<typeof setTimeout> | undefined
let pressOrigin: { x: number, y: number } | null = null
let suppressNextClick = false
let lastPointerType = ''

function onLinePointerDown(event: PointerEvent, line: GroceryLine) {
  lastPointerType = event.pointerType
  if (!list.hasStores || list.selecting || event.pointerType === 'mouse') return
  if (event.target instanceof Element && event.target.closest('.quantity-trigger, [data-line-actions]')) return
  pressOrigin = { x: event.clientX, y: event.clientY }
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    pressOrigin = null
    suppressNextClick = true
    list.startSelection(line)
    navigator.vibrate?.(10)
  }, 450)
}

function onLinePointerMove(event: PointerEvent) {
  if (!pressOrigin) return
  if (Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 8) cancelPress()
}

function cancelPress() {
  clearTimeout(pressTimer)
  pressOrigin = null
}

/** En sélection, un appui n'importe où sur la ligne la coche ; le clic qui suit un appui long est avalé. */
function onLineClickCapture(event: MouseEvent, line: GroceryLine) {
  if (suppressNextClick) {
    suppressNextClick = false
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (!list.selecting) return
  event.preventDefault()
  event.stopPropagation()
  list.setSelected([line])
}

/** Au toucher, l'appui long sert à sélectionner : pas de menu contextuel du navigateur. */
function onLineContextMenu(event: MouseEvent) {
  if (list.hasStores && lastPointerType && lastPointerType !== 'mouse') event.preventDefault()
}

onBeforeUnmount(cancelPress)

/** Libellé lu par les lecteurs d'écran : l'état de la case dit ce que fera le geste. */
function rowAriaLabel(row: GroceryMealRow) {
  if (row.isLocked) return `${row.label} : déjà acheté`
  if (row.isChecked) return `${row.label} : dans la liste, décocher pour retirer`
  if (row.isIndeterminate) return `${row.label} : en partie dans la liste, cocher pour tout ajouter`
  return `${row.label} : cocher pour ajouter à la liste`
}
</script>

<template>
  <div class="flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6">
    <!--
      Grand écran : la page ne défile pas, les deux panneaux remplissent la hauteur côte à côte, leurs en-têtes restent
      visibles et chacun fait défiler son contenu. Mobile : panneaux empilés à leur hauteur naturelle, la page défile.
      (Commentaire dans la racine : un commentaire à côté ferait un fragment, que la <Transition> de la page ne sait pas
      animer.)
    -->
    <!-- Repère du collage de l'en-tête ci-dessous ; la marge négative annule l'espacement de la colonne. -->
    <div ref="sourceSentinel" class="-mb-4 h-0 lg:hidden" aria-hidden="true" />
    <!-- Source : repas de la période, cochés s'ils sont dans la liste. -->
    <UCollapsible
      v-model:open="sourceOpen"
      class="flex flex-col rounded-xl border border-default bg-default lg:min-h-0"
      :class="sourceOpen ? 'lg:self-stretch' : 'lg:self-start'"
      :ui="{ content: 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' }"
    >
      <!-- Collé contre le bord : le décalage négatif compense la marge intérieure du conteneur qui défile. -->
      <button
        type="button"
        class="sticky -top-4 z-20 flex w-full shrink-0 cursor-pointer items-center gap-3 bg-default p-4 text-start transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:-top-6 sm:px-5 lg:top-0"
        :class="[
          isSourceStuck ? 'rounded-none' : (sourceOpen ? 'rounded-t-xl' : 'rounded-xl'),
          sourceOpen && 'border-b border-default',
        ]"
      >
        <span class="flex-1">
          <span class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
            <UIcon name="i-lucide-calendar-days" class="size-5 shrink-0 text-primary" aria-hidden="true" />
            Menu
          </span>
          <span class="block text-xs tabular-nums text-dimmed">{{ sourceSummary }}</span>
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 shrink-0 text-muted transition-transform duration-200"
          :class="sourceOpen && 'rotate-180'"
        />
      </button>

      <template #content>
        <div class="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
          <UFormField label="Période">
            <UInputDate ref="inputDate" v-model="list.dateRange" range class="w-full">
              <template #trailing>
                <UPopover :reference="inputDate?.inputsRef[0]?.$el">
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    icon="i-lucide-calendar"
                    aria-label="Choisir la période dans le calendrier"
                    class="px-0"
                  />
                  <template #content>
                    <UCalendar v-model="list.dateRange" range class="p-2" />
                  </template>
                </UPopover>
              </template>
            </UInputDate>
          </UFormField>

          <p v-if="list.isLoadingMeals" class="py-6 text-center text-sm text-muted">
            Chargement des repas…
          </p>

          <div v-else-if="list.mealRows.length" class="flex flex-col">
            <div class="flex items-center justify-between gap-2 border-b border-default pb-1">
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                Dans la liste
              </p>
              <UButton
                v-if="list.selectableMealRows.length"
                :label="list.areAllMealsIncluded ? 'Tout décocher' : 'Tout cocher'"
                color="neutral"
                variant="link"
                size="xs"
                :disabled="!list.isCatalogReady"
                @click="list.toggleAllMeals()"
              />
            </div>
            <ul class="divide-y divide-default">
              <li v-for="row in list.mealRows" :key="row.key" class="flex items-center gap-3">
                <label
                  class="flex min-w-0 flex-1 items-center gap-3 py-2"
                  :class="row.isSelectable && !row.isLocked ? 'cursor-pointer' : 'cursor-not-allowed'"
                >
                  <UCheckbox
                    :model-value="row.isIndeterminate ? 'indeterminate' : row.isChecked"
                    :disabled="!row.isSelectable || row.isLocked || !list.isCatalogReady"
                    :aria-label="rowAriaLabel(row)"
                    @update:model-value="list.toggleRow(row)"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-sm"
                    :class="row.isChecked || row.isIndeterminate ? 'text-highlighted' : 'text-muted'"
                  >{{ row.label }}</span>
                  <UTooltip v-if="row.plannedBy.length" :text="plannedByLabel(row)">
                    <UAvatarGroup size="3xs" class="shrink-0">
                      <UAvatar v-for="member in row.plannedBy" :key="member.id" :src="member.photoUrl" :alt="member.name" />
                    </UAvatarGroup>
                  </UTooltip>
                  <UTooltip v-if="row.hasBought" :text="row.isLocked ? 'Déjà acheté' : 'En partie acheté'">
                    <UIcon name="i-lucide-shopping-cart" class="size-3.5 shrink-0 text-dimmed" :aria-label="row.isLocked ? 'déjà acheté' : 'en partie acheté'" />
                  </UTooltip>
                </label>
                <!-- Les parts d'une recette se modifient (appui long ou clic) ; hors du label pour ne pas cocher la ligne. -->
                <GroceryPartsEditor v-if="row.parts && !row.hasBought" :row="row" />
                <span v-else-if="row.quantityLabel" class="shrink-0 text-xs tabular-nums text-dimmed">{{ row.quantityLabel }}</span>
              </li>
            </ul>
          </div>
          <p v-else class="rounded-lg border border-dashed border-default px-4 py-6 text-center text-sm text-muted">
            {{ list.range ? 'Aucun repas planifié sur cette période.' : 'Choisissez une période complète.' }}
          </p>

          <!-- Repas inclus puis retirés des menus : la liste ne suit pas les menus, on les retire à la main. -->
          <div v-if="list.orphanRows.length" class="flex flex-col">
            <p class="border-b border-default pb-1 text-xs font-semibold uppercase tracking-wide text-dimmed">
              Retiré des menus
            </p>
            <ul class="divide-y divide-default">
              <li v-for="row in list.orphanRows" :key="row.key" class="flex items-center gap-3 py-1.5">
                <span class="min-w-0 flex-1 truncate text-sm text-dimmed">{{ row.label }}</span>
                <span v-if="row.isBought" class="shrink-0 text-xs text-dimmed">Déjà acheté</span>
                <UButton
                  v-else
                  label="Retirer"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="!list.isCatalogReady"
                  :aria-label="`Retirer ${row.label} de la liste`"
                  @click="list.removeOrphans(row)"
                />
              </li>
            </ul>
          </div>

          <p v-if="list.mealRows.length" class="text-xs text-dimmed">
            Cocher ajoute ses ingrédients à la liste, décocher les retire. Changer de période ne retire rien.
          </p>

          <UButton
            to="/dashboard/menus"
            label="Modifier les menus"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="link"
            size="sm"
            class="-ms-2.5 self-start"
          />
        </div>
      </template>
    </UCollapsible>

    <!-- Liste à acheter, par rayon. -->
    <section aria-labelledby="to-buy-title" class="flex flex-col rounded-xl border border-default bg-default lg:min-h-0 lg:overflow-hidden" :style="{ '--list-header-height': `${listHeaderHeight}px` }">
      <div ref="listSentinel" class="h-0 lg:hidden" aria-hidden="true" />
      <div
        ref="listHeader"
        class="sticky -top-4 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-default bg-default p-4 sm:-top-6 sm:px-5 lg:top-0"
        :class="isListStuck ? 'rounded-none' : 'rounded-t-xl'"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 id="to-buy-title" class="flex items-center gap-2 text-lg font-bold tracking-tight text-highlighted">
                <UIcon name="i-lucide-shopping-basket" class="size-5 shrink-0 text-primary" aria-hidden="true" />
                Produits
              </h2>
              <p class="text-xs tabular-nums text-dimmed">
                {{ plural(list.filteredToBuy.length, 'article') }} · {{ plural(groups.length, 'rayon') }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <UButton
                v-if="list.hasStores && !list.selecting"
                icon="i-lucide-square-check"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="!list.filteredToBuy.length"
                aria-label="Sélectionner des articles"
                @click="list.startSelection()"
              >
                <span class="hidden sm:inline">Sélectionner</span>
              </UButton>
              <UButton
                v-if="list.selecting"
                :label="allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="toggleAllVisible"
              />
              <UButton
                v-else
                label="Ajouter un article"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                size="sm"
                class="shrink-0"
                @click="openAddItem"
              />
            </div>
          </div>
          <!-- Filtre par magasin : un article sans magasin compte dans chacun. -->
          <StoreChoiceBar
            v-if="list.hasStores"
            v-model="list.listFilter"
            :choices="list.listFilterChoices"
            label="Filtrer par magasin"
            class="self-start"
          />
        </div>
      </div>

      <!-- Contenu défilant ; les en-têtes de rayon restent collés en haut pendant le défilement. -->
      <div class="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
        <p v-if="list.isLoading" class="px-6 py-10 text-center text-sm text-muted">
          Chargement de la liste…
        </p>
        <p v-else-if="!list.toBuy.length" class="px-6 py-10 text-center text-sm text-muted">
          {{ list.atHomeLines.length
            ? 'Tout ce qui reste est déjà à la maison.'
            : 'La liste est vide. Ajoutez les ingrédients de vos menus, ou un article à la main.' }}
        </p>

        <div v-for="(group, index) in groups" :key="group.aisle.id" class="flex flex-col">
          <h3
            class="sticky top-[calc(var(--list-header-height)-1rem)] z-10 flex items-center gap-2 border-b border-default bg-elevated px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted sm:top-[calc(var(--list-header-height)-1.5rem)] sm:px-5 lg:top-0"
            :class="index > 0 && 'border-t'"
          >
            <UCheckbox
              v-if="list.selecting"
              :model-value="aisleSelection(group.lines)"
              :aria-label="`Sélectionner tout le rayon ${group.aisle.label}`"
              size="sm"
              @update:model-value="list.setSelected(group.lines, aisleSelection(group.lines) !== true)"
            />
            <UIcon v-else :name="categoryIconName(group.aisle.icon)!" class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="flex-1">{{ group.aisle.label }}</span>
            <span class="font-normal tabular-nums text-dimmed">{{ group.lines.length }}</span>
          </h3>
          <TransitionGroup tag="ul" name="line" class="divide-y divide-default">
            <li
              v-for="line in group.lines"
              :key="line.id"
              class="flex items-center gap-3 px-4 py-2.5 transition-colors sm:px-5"
              :class="[
                list.hasStores && 'select-none [-webkit-touch-callout:none]',
                list.selecting && 'cursor-pointer',
                list.selecting && list.selectedIds.has(line.id) && 'bg-primary/5',
              ]"
              @pointerdown="onLinePointerDown($event, line)"
              @pointermove="onLinePointerMove"
              @pointerup="cancelPress"
              @pointercancel="cancelPress"
              @contextmenu="onLineContextMenu"
              @click.capture="onLineClickCapture($event, line)"
            >
              <UCheckbox
                v-if="list.selecting"
                :model-value="list.selectedIds.has(line.id)"
                :aria-label="`Sélectionner ${line.label}`"
              />
              <!-- Magasins de l'article en pastilles à la suite du nom ; rien pour un article « partout ». -->
              <div class="flex min-w-0 flex-1">
                <GroceryLineName :line="line" :stores="list.storesOf(line.storeIds)" />
              </div>
              <template v-if="!list.selecting">
                <GroceryQuantityEditor :line="line" />
                <div class="flex shrink-0 items-center" data-line-actions>
                  <GroceryStoresPicker v-if="list.hasStores" :lines="[line]" :title="line.label">
                    <UButton
                      icon="i-lucide-store"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :aria-label="`${line.label} : où l'acheter`"
                    />
                  </GroceryStoresPicker>
                  <UTooltip text="J'en ai déjà">
                    <UButton
                      icon="i-lucide-house"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :aria-label="`${line.label} : j'en ai déjà`"
                      @click="list.toggleAtHome(line)"
                    />
                  </UTooltip>
                </div>
              </template>
            </li>
          </TransitionGroup>
        </div>

        <!-- Barre de la sélection : collée en bas du panneau pendant qu'on coche. -->
        <div
          v-if="list.selecting"
          class="sticky -bottom-4 z-20 flex items-center gap-2 border-t border-default bg-default px-4 py-3 sm:-bottom-6 sm:px-5 lg:bottom-0"
          role="toolbar"
          aria-label="Articles sélectionnés"
        >
          <p class="min-w-0 flex-1 text-sm tabular-nums" aria-live="polite">
            <span class="font-semibold text-highlighted">{{ list.selectedLines.length }}</span>
            <span class="text-muted"> sélectionné{{ list.selectedLines.length > 1 ? 's' : '' }}</span>
          </p>
          <UButton label="Annuler" color="neutral" variant="ghost" size="sm" @click="list.stopSelection()" />
          <GroceryStoresPicker
            v-model:open="bulkPickerOpen"
            :lines="list.selectedLines"
            :title="plural(list.selectedLines.length, 'article')"
            announce
            @changed="onBulkChanged"
          >
            <UButton
              label="Magasins…"
              icon="i-lucide-store"
              size="sm"
              :disabled="!list.selectedLines.length"
            />
          </GroceryStoresPicker>
        </div>
  
        <UCollapsible v-if="list.atHomeLines.length" v-model:open="atHomeOpen" class="border-t border-default">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-start text-sm text-muted transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
          >
            <UIcon name="i-lucide-house" class="size-4 shrink-0" aria-hidden="true" />
            <span class="flex-1">Déjà à la maison <span class="tabular-nums text-dimmed">({{ list.atHomeLines.length }})</span></span>
            <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform duration-200" :class="atHomeOpen && 'rotate-180'" />
          </button>
          <template #content>
            <ul class="divide-y divide-default border-t border-default">
              <li v-for="line in list.atHomeLines" :key="line.id" class="flex items-center gap-3 px-4 py-2 sm:px-5">
                <span class="min-w-0 flex-1 truncate text-sm text-dimmed line-through">{{ line.label }}</span>
                <span v-if="line.quantityLabel" class="shrink-0 text-sm tabular-nums text-dimmed line-through">{{ line.quantityLabel }}</span>
                <UButton
                  label="Remettre"
                  icon="i-lucide-undo-2"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`Remettre ${line.label} dans la liste`"
                  @click="list.toggleAtHome(line)"
                />
              </li>
            </ul>
          </template>
        </UCollapsible>
      </div>
    </section>
  </div>
</template>

<style scoped>
.line-enter-active,
.line-leave-active {
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.line-enter-from,
.line-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (prefers-reduced-motion: reduce) {
  .line-enter-active,
  .line-leave-active {
    transition: none;
  }
}
</style>
