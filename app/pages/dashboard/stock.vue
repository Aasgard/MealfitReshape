<script setup lang="ts">
import type { DishStorage, PreparedDish } from '~/types/preparedDish'
import { dayKeyOf } from '~/utils/menuWeek'
import { addDays, parseISO } from 'date-fns'
import { compareDishes, DISH_STORAGES, formatParts, isDishDepleted, isDishPlanned, isDishShown, PARTS_EPSILON } from '~/utils/preparedDishes'
import { COOKING_DAYS, recipesToCook } from '~/utils/recipesToCook'

useSeoMeta({
  title: 'Dashboard - Stock - Mealfit',
  description: 'Dashboard - Stock - Mealfit',
})

const toast = useToast()
const { recipes, recipesById, ingredientsById } = useFoodCatalog()
const { dishes, setDishParts, setDishStorage, deleteDish } = usePreparedDishes()

watch(dishes.error, (error) => {
  if (!error) return
  toast.add({ title: 'Erreur', description: `Impossible de charger le stock : ${error.message}`, color: 'error' })
})

const isLoading = computed(() => dishes.pending.value && !dishes.value.length)

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
 * la fin de la fournée. Pas de requête sans cuisine prévue.
 */
const plannedCookDays = computed(() => dishes.value
  .filter(dish => dish.batch && isDishPlanned(dish, todayKey.value))
  .map(dish => dish.preparedOn)
  .sort())
const batchMeals = useMealsBetween(() => {
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
          v-else-if="!groups.length"
          class="py-12"
          icon="i-lucide-archive"
          title="Aucun plat en stock"
          description="Ajoutez un plat déjà préparé, ou une recette à cuisiner plus tard pour le stock (avec une date à venir). Des parts en plus d'une recette des menus se prévoient aussi depuis « Cuisiner » sur l'accueil. Pris dans un repas, un plat du stock ne se cuisine pas et ne s'achète pas."
          :actions="[{ label: 'Ajouter un plat', icon: 'i-lucide-plus', onClick: () => addDish() }]"
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
                @edit="editDish(dish)"
                @delete="askDeleteDish(dish)"
                @set-parts="changeParts(dish, $event)"
                @set-storage="changeStorage(dish, $event)"
              />
            </ul>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>

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
