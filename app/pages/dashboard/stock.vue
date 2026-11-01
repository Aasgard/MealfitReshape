<script setup lang="ts">
import type { DishStorage, PreparedDish } from '~/types/preparedDish'
import { dayKeyOf } from '~/utils/menuWeek'
import { addDays, parseISO } from 'date-fns'
import { compareDishes, DISH_STORAGES, dishStorageOf, formatDishDay, formatParts, isDishDepleted, isDishPlanned, isDishShown, PARTS_EPSILON } from '~/utils/preparedDishes'
import { COOKING_DAYS, recipesToCook } from '~/utils/recipesToCook'
import { formatBaseGrams, GRAMS_EPSILON, type BaseStockState } from '~/utils/baseStock'

useSeoMeta({
  title: 'Dashboard - Stock - Mealfit',
  description: 'Dashboard - Stock - Mealfit',
})

const toast = useToast()
const { recipes, recipesById, ingredientsById } = useFoodCatalog()
const { dishes, setDishParts, setDishStorage, deleteDish } = usePreparedDishes()
const { household, loading: householdLoading } = useHousehold()

// --- Bases (pickles, sauces) : comptées en grammes, les plats des menus y puisent leur part ---
const { stocks: baseStocks, ledger: baseLedger, deleteStock: deleteBaseStock } = useBaseStocks()
/** Bocaux à afficher : ceux où il reste quelque chose, ou que des repas à venir attendent encore. */
const baseStates = computed(() => [...baseLedger.value.states.values()]
  .filter(state => state.remaining >= GRAMS_EPSILON || state.reserved >= GRAMS_EPSILON)
  .sort((a, b) => a.stock.label.localeCompare(b.stock.label, 'fr') || a.stock.preparedOn.localeCompare(b.stock.preparedOn)))
const baseModalOpen = ref(false)
const editedBaseState = ref<BaseStockState | null>(null)
const addBaseStock = () => {
  editedBaseState.value = null
  baseModalOpen.value = true
}
const editBaseStock = (state: BaseStockState) => {
  editedBaseState.value = state
  baseModalOpen.value = true
}
/** Les repas à venir en attendent plus qu'il n'en reste : le manque se prépare (voir « Cuisiner »). */
const baseShortage = (state: BaseStockState) => Math.max(0, state.reserved - state.remaining)
const removeBaseStock = async (state: BaseStockState) => {
  try {
    await deleteBaseStock(state.stock)
    toast.add({ title: 'Base retirée du stock', description: `« ${state.stock.label} »`, color: 'neutral', icon: 'i-lucide-trash-2' })
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `« ${state.stock.label} » n'a pas pu être retirée : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
  }
}

/** Membre qui a ajouté un plat, quand ce n'est pas le compte connecté (parti du foyer depuis : rien). */
const addedBy = (dish: PreparedDish) => household.value?.members.find(m => m.id === dish.owner && !m.isSelf)

watch(dishes.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger le stock : ${error.message}`, color: 'error' })
})

const isLoading = computed(() => householdLoading.value || (dishes.pending.value && !dishes.value.length) || (baseStocks.pending.value && !baseStocks.value.length))

/** Recalculé à chaque rendu : la page peut rester ouverte d'un jour à l'autre. */
const todayKey = computed(() => dayKeyOf(new Date()))

/** Plats affichés (un plat épuisé disparaît le lendemain de son dernier repas), par rangement. */
const groups = computed(() => {
  const shown = dishes.value.filter(dish => isDishShown(dish, todayKey.value))
  return DISH_STORAGES
    .map(storage => ({ storage, dishes: shown.filter(dish => dish.storage === storage.key).sort(compareDishes) }))
    .filter(group => group.dishes.length)
})

/**
 * Repas des menus autour des cuisines prévues pour le stock : une semaine avant (une fournée commencée plus tôt) jusqu'à
 * la fin de la fournée, pour tout le foyer : le stock et ses surplus sont communs. Pas de requête sans cuisine prévue.
 */
const plannedCookDays = computed(() => dishes.value
  .filter(dish => dish.batch && isDishPlanned(dish, todayKey.value))
  .map(dish => dish.preparedOn)
  .sort())
const { meals: batchMeals } = useHouseholdMealsBetween(() => {
  const days = plannedCookDays.value
  if (!days.length) return null
  return { start: addDays(parseISO(days[0]!), -(COOKING_DAYS - 1)), end: addDays(parseISO(days.at(-1)!), COOKING_DAYS - 1) }
})

/** Parts des repas des menus cuisinées dans la même fournée qu'un surplus (même recette, même jour de cuisine). */
const menuPartsByBatch = computed(() => new Map(plannedCookDays.value.length
  ? recipesToCook(batchMeals.value, COOKING_DAYS).map(item => [`${item.recipeId}|${dayKeyOf(item.days[0]!)}`, item.parts])
  : []))
const menuPartsOf = (dish: PreparedDish) =>
  dish.recipeId && dish.batch ? menuPartsByBatch.value.get(`${dish.recipeId}|${dish.batch.cookDay}`) ?? 0 : 0

const groupSummary = (list: PreparedDish[]) => {
  const available = list.filter(dish => !isDishDepleted(dish))
  const parts = available.reduce((total, dish) => total + dish.parts, 0)
  const dishesLabel = `${available.length} plat${available.length > 1 ? 's' : ''}`
  return parts > PARTS_EPSILON ? `${dishesLabel} · ${formatParts(parts)}` : 'Tout est épuisé'
}

const formOpen = ref(false)
const editingDish = ref<PreparedDish | null>(null)
const defaultStorage = ref<DishStorage | undefined>(undefined)

const addDish = (storage?: DishStorage) => {
  editingDish.value = null
  defaultStorage.value = storage
  formOpen.value = true
}

const editDish = (dish: PreparedDish) => {
  editingDish.value = dish
  formOpen.value = true
}

const fail = (label: string) => (error: any) => {
  toast.add({ title: 'Erreur', description: `« ${label} » n'a pas pu être modifié : ${error?.message || 'une erreur est survenue'}.`, color: 'error' })
}

const changeParts = (dish: PreparedDish, parts: number) => setDishParts(dish, parts).catch(fail(dish.label))
const changeStorage = (dish: PreparedDish, storage: DishStorage) => setDishStorage(dish, storage).catch(fail(dish.label))

const dishToDelete = ref<PreparedDish | null>(null)
const deleteDialogOpen = ref(false)

const askDeleteDish = (dish: PreparedDish) => {
  dishToDelete.value = dish
  deleteDialogOpen.value = true
}

const deleteDescription = computed(() => {
  const dish = dishToDelete.value
  if (!dish) return undefined
  const left = isDishDepleted(dish) ? '' : ` Ses ${formatParts(dish.parts)} restantes seront perdues.`
  return `Les repas qui l'utilisent déjà restent dans les menus.${left}`
})

const confirmDeleteDish = async () => {
  const dish = dishToDelete.value
  deleteDialogOpen.value = false
  if (!dish) return
  try {
    await deleteDish(dish)
    toast.add({ title: 'Plat retiré du stock', description: `« ${dish.label} »`, color: 'neutral', icon: 'i-lucide-trash-2' })
  } catch (error: any) {
    toast.add({ title: 'Erreur', description: `« ${dish.label} » n'a pas pu être retiré : ${error.message || 'une erreur est survenue'}.`, color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="stock">
    <template #header>
      <UDashboardNavbar title="Stock">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="primary" icon="i-lucide-plus" @click="addDish()">
            <span class="max-sm:hidden">Ajouter un plat</span>
            <span class="sm:hidden">Ajouter</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6">
        <template v-if="isLoading">
          <div v-for="i in 2" :key="`skeleton-${i}`" class="flex flex-col gap-3">
            <USkeleton class="h-6 w-40" />
            <div class="flex flex-col divide-y divide-default overflow-hidden rounded-xl border border-default">
              <div v-for="j in 2" :key="j" class="flex items-center gap-3 p-4">
                <USkeleton class="size-10 shrink-0 rounded-full" />
                <div class="flex flex-1 flex-col gap-2">
                  <USkeleton class="h-4 w-1/2" />
                  <USkeleton class="h-3 w-3/4" />
                </div>
                <USkeleton class="h-8 w-28" />
              </div>
            </div>
          </div>
        </template>

        <UEmpty
          v-else-if="!groups.length && !baseStates.length"
          class="py-12"
          icon="i-lucide-archive"
          title="Aucun plat en stock"
          description="Ajoutez un plat déjà préparé, ou une recette à cuisiner plus tard pour le stock (avec une date à venir). Des parts en plus d'une recette des menus se prévoient aussi depuis « Cuisiner » sur l'accueil. Pris dans un repas, un plat du stock ne se cuisine pas et ne s'achète pas."
          :actions="[{ label: 'Ajouter un plat', icon: 'i-lucide-plus', onClick: () => addDish() }, { label: 'Mettre une base au stock', icon: 'i-lucide-cooking-pot', color: 'neutral', variant: 'outline', onClick: addBaseStock }]"
        />

        <template v-else>
          <section
            v-for="group in groups"
            :key="group.storage.key"
            class="flex flex-col gap-3"
            :aria-labelledby="`stock-${group.storage.key}`"
          >
            <div class="flex items-center justify-between gap-3">
              <h2 :id="`stock-${group.storage.key}`" class="flex items-baseline gap-2 text-lg font-bold tracking-tight text-highlighted">
                <UIcon :name="group.storage.icon" class="size-5 shrink-0 self-center text-primary" aria-hidden="true" />
                {{ group.storage.label }}
                <span class="text-sm font-normal tracking-normal text-dimmed tabular-nums">{{ groupSummary(group.dishes) }}</span>
              </h2>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Ajouter un plat : ${group.storage.label.toLowerCase()}`"
                @click="addDish(group.storage.key)"
              />
            </div>

            <ul class="divide-y divide-default overflow-hidden rounded-xl border border-default bg-default">
              <PreparedDishRow
                v-for="dish in group.dishes"
                :key="dish.id"
                :dish="dish"
                :image-url="dish.recipeId ? recipesById.get(dish.recipeId)?.imageUrl : undefined"
                :today-key="todayKey"
                :recipe-persons="dish.recipeId ? recipesById.get(dish.recipeId)?.persons : undefined"
                :menu-parts="menuPartsOf(dish)"
                :added-by="addedBy(dish)"
                @edit="editDish(dish)"
                @delete="askDeleteDish(dish)"
                @set-parts="changeParts(dish, $event)"
                @set-storage="changeStorage(dish, $event)"
              />
            </ul>
          </section>

          <!-- Bases : un bocal par ligne, en grammes ; toucher la ligne corrige ce qu'il reste. -->
          <section class="flex flex-col gap-3" aria-labelledby="stock-bases">
            <div class="flex items-center justify-between gap-3">
              <h2 id="stock-bases" class="flex items-baseline gap-2 text-lg font-bold tracking-tight text-highlighted">
                <UIcon name="i-lucide-cooking-pot" class="size-5 shrink-0 self-center text-primary" aria-hidden="true" />
                Bases
                <span class="text-sm font-normal tracking-normal text-dimmed tabular-nums">
                  {{ baseStates.length ? `${baseStates.length} bocal${baseStates.length > 1 ? 'x' : ''}` : 'pickles, sauces, pestos…' }}
                </span>
              </h2>
              <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" aria-label="Mettre une base au stock" @click="addBaseStock" />
            </div>

            <ul v-if="baseStates.length" class="divide-y divide-default overflow-hidden rounded-xl border border-default bg-default">
              <li v-for="state in baseStates" :key="state.stock.id" class="flex items-center">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 p-4 pe-2 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :aria-label="`Corriger ${state.stock.label}, reste ${formatBaseGrams(state.remaining)}`"
                  @click="editBaseStock(state)"
                >
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accented text-muted" aria-hidden="true">
                    <UIcon :name="dishStorageOf(state.stock.storage).icon" class="size-4" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold text-highlighted">{{ state.stock.label }}</p>
                    <p class="truncate text-xs text-dimmed">
                      {{ dishStorageOf(state.stock.storage).label }} · préparée le {{ formatDishDay(state.stock.preparedOn) }}
                      <template v-if="state.stock.comment"> · {{ state.stock.comment }}</template>
                    </p>
                  </div>
                  <div class="flex shrink-0 flex-col items-end">
                    <p class="text-sm font-semibold tabular-nums text-highlighted">{{ formatBaseGrams(state.remaining) }}</p>
                    <p v-if="baseShortage(state) >= GRAMS_EPSILON" class="text-xs tabular-nums text-warning">
                      manque {{ formatBaseGrams(baseShortage(state)) }}
                    </p>
                    <p v-else-if="state.reserved >= GRAMS_EPSILON" class="text-xs tabular-nums text-dimmed">
                      dont {{ formatBaseGrams(state.reserved) }} réservés
                    </p>
                  </div>
                </button>
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  class="me-2 shrink-0 text-dimmed"
                  :aria-label="`Retirer ${state.stock.label} du stock`"
                  @click="removeBaseStock(state)"
                />
              </li>
            </ul>
            <p v-else class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-muted text-pretty">
              Une base préparée d'avance (bocal de pickles, pot de pesto) se range ici, en grammes. Les plats des menus qui
              l'utilisent y puisent leur part : ses ingrédients ne s'ajoutent aux courses que s'il n'en reste pas assez.
            </p>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>

  <BaseStockModal v-model:open="baseModalOpen" :stock="editedBaseState" :recipes="recipes" />

  <PreparedDishFormSlideover
    v-model:open="formOpen"
    :dish="editingDish"
    :recipes="recipes"
    :ingredients-by-id="ingredientsById"
    :default-storage="defaultStorage"
    :menu-parts-of="(recipeId, cookDay) => menuPartsByBatch.get(`${recipeId}|${cookDay}`) ?? 0"
  />

  <ConfirmDialog
    v-model:open="deleteDialogOpen"
    :title="dishToDelete ? `Retirer « ${dishToDelete.label} » du stock ?` : 'Retirer ce plat du stock ?'"
    :description="deleteDescription"
    confirm-label="Retirer"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    @confirm="confirmDeleteDish"
  />
</template>
