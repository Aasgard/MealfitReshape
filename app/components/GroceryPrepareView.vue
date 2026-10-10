<script setup lang="ts">
/**
 * Mode « Lister » : à gauche les repas planifiés dont on ajoute les ingrédients à la liste, à droite la liste par rayon.
 * Ici pas de case à cocher sur les articles : « J'en ai déjà » les range dans un groupe à part,
 * pour ne jamais confondre avec la case « dans le panier » du mode magasin.
 */
import type { GroceryLine } from '~/utils/groceryList'

const list = useInjectedGroceryList()

const inputDate = useTemplateRef('inputDate')
const atHomeOpen = ref(false)

/** Ouvert d'office quand la liste est vide au chargement : c'est par là qu'on la remplit. */
const sourceOpen = ref(true)
const stopInitialOpen = watch(() => list.isLoading, (loading) => {
  if (loading) return
  sourceOpen.value = !list.lines.length
  queueMicrotask(() => stopInitialOpen())
}, { immediate: true })

function openAddItem() {
  list.isAddItemOpen = true
}

const groups = computed(() => {
  const result: { aisle: GroceryLine['aisle'], lines: GroceryLine[] }[] = []
  for (const line of list.toBuy) {
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

const ingredientCount = computed(() => list.fromMenus.items.length)
const sourceSummary = computed(() => {
  if (list.isLoadingMeals) return 'Chargement des repas…'
  if (!list.mealRows.length) return 'Aucun repas sur la période'
  return `${list.mealRows.length} repas · ${plural(ingredientCount.value, 'ingrédient')}`
})
const addLabel = computed(() => {
  if (list.isSelectionAdded) return 'Ajouté à la liste'
  return ingredientCount.value ? `Ajouter ${plural(ingredientCount.value, 'ingrédient')} à la liste` : 'Aucun ingrédient à ajouter'
})
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <!-- Source : repas planifiés sur la période, à ajouter à la liste. -->
    <UCollapsible
      v-model:open="sourceOpen"
      class="flex flex-col rounded-xl border border-default bg-default lg:sticky lg:top-0"
    >
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-3 rounded-xl p-4 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
      >
        <span class="flex-1">
          <span class="block text-lg font-bold tracking-tight text-highlighted">Ajouter depuis les menus</span>
          <span class="block text-xs tabular-nums text-dimmed">{{ sourceSummary }}</span>
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 shrink-0 text-muted transition-transform duration-200"
          :class="sourceOpen && 'rotate-180'"
        />
      </button>

      <template #content>
        <div class="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
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
                Repas à inclure
              </p>
              <UButton
                v-if="list.selectableMealRows.length"
                :label="list.areAllMealsIncluded ? 'Tout décocher' : 'Tout cocher'"
                color="neutral"
                variant="link"
                size="xs"
                @click="list.toggleAllMeals()"
              />
            </div>
            <ul class="divide-y divide-default">
              <li v-for="row in list.mealRows" :key="row.key" class="flex items-center gap-3">
                <label class="flex min-w-0 flex-1 items-center gap-3 py-2" :class="row.isSelectable ? 'cursor-pointer' : 'cursor-not-allowed'">
                  <UCheckbox
                    :model-value="row.isSelectable && !list.excludedMealKeys.has(row.key)"
                    :disabled="!row.isSelectable"
                    @update:model-value="list.setMealIncluded(row.key, $event === true)"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-sm"
                    :class="row.isSelectable && !list.excludedMealKeys.has(row.key) ? 'text-highlighted' : 'text-dimmed'"
                  >{{ row.label }}</span>
                </label>
                <!-- Les parts d'une recette se modifient (appui long ou clic) ; hors du label pour ne pas cocher la ligne. -->
                <GroceryPartsEditor v-if="row.parts" :row="row" />
                <span v-else-if="row.quantityLabel" class="shrink-0 text-xs tabular-nums text-dimmed">{{ row.quantityLabel }}</span>
              </li>
            </ul>
          </div>
          <p v-else class="rounded-lg border border-dashed border-default px-4 py-6 text-center text-sm text-muted">
            {{ list.range ? 'Aucun repas planifié sur cette période.' : 'Choisissez une période complète.' }}
          </p>

          <p v-if="list.skipped.length" class="flex gap-2 text-xs text-muted">
            <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>Non inclus : {{ list.skipped.join(', ') }}.</span>
          </p>

          <div v-if="list.mealRows.length" class="flex flex-col gap-1.5">
            <UButton
              :label="addLabel"
              :icon="list.isSelectionAdded ? 'i-lucide-check' : 'i-lucide-list-plus'"
              :variant="list.isSelectionAdded ? 'subtle' : 'solid'"
              :loading="list.isAddingFromMenus"
              :disabled="!ingredientCount || list.isSelectionAdded"
              block
              @click="list.addFromMenus()"
            />
            <p class="text-xs text-dimmed">
              Un ingrédient déjà à acheter voit sa quantité complétée.
            </p>
          </div>

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
    <section aria-labelledby="to-buy-title" class="flex flex-col rounded-xl border border-default bg-default">
      <div class="flex items-center justify-between gap-3 p-4 sm:px-5">
        <div class="min-w-0">
          <h2 id="to-buy-title" class="text-lg font-bold tracking-tight text-highlighted">
            À acheter
          </h2>
          <p class="text-xs tabular-nums text-dimmed">
            {{ plural(list.toBuy.length, 'article') }} · {{ plural(groups.length, 'rayon') }}
          </p>
        </div>
        <UButton
          label="Ajouter un article"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          class="shrink-0"
          @click="openAddItem"
        />
      </div>

      <p v-if="list.isLoading" class="border-t border-default px-6 py-10 text-center text-sm text-muted">
        Chargement de la liste…
      </p>
      <p v-else-if="!list.toBuy.length" class="border-t border-default px-6 py-10 text-center text-sm text-muted">
        {{ list.atHomeLines.length
          ? 'Tout ce qui reste est déjà à la maison.'
          : 'La liste est vide. Ajoutez les ingrédients de vos menus, ou un article à la main.' }}
      </p>

      <div v-for="group in groups" :key="group.aisle.id" class="flex flex-col">
        <h3 class="flex items-center gap-2 border-y border-default bg-elevated/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted sm:px-5">
          <UIcon :name="categoryIconName(group.aisle.icon)!" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="flex-1">{{ group.aisle.label }}</span>
          <span class="font-normal tabular-nums text-dimmed">{{ group.lines.length }}</span>
        </h3>
        <TransitionGroup tag="ul" name="line" class="divide-y divide-default">
          <li v-for="line in group.lines" :key="line.id" class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <div class="flex min-w-0 flex-1">
              <GroceryLineName :line="line" />
            </div>
            <GroceryQuantityEditor :line="line" />
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
          </li>
        </TransitionGroup>
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
