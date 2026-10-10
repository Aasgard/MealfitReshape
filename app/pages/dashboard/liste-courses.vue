<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { useSwipe } from '@vueuse/core'

useSeoMeta({
  title: 'Dashboard - Liste de courses - Mealfit',
  description: 'Dashboard - Liste de courses - Mealfit',
})

/**
 * Zoom bloqué sur cette page : en magasin, les touches rapides sur les articles et le balayage entre les modes ne
 * doivent pas zoomer, ni le focus d'un champ (iOS). Rétabli en quittant la page.
 * iOS ignore `user-scalable=no` pour le pincement : le `touch-pan-y` de la zone de contenu le bloque aussi.
 * `interactive-widget=resizes-content` : sur Android, le clavier réduit la page au lieu de recouvrir les panneaux du bas.
 */
useHead({
  meta: [{ key: 'viewport', name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-content' }],
})

const list = useGroceryList()
provide(GROCERY_LIST_KEY, list)

const modeItems = computed<TabsItem[]>(() => [
  { label: 'Lister', value: 'prepare', icon: 'i-lucide-list-checks' },
  {
    label: 'Acheter',
    value: 'store',
    icon: 'i-lucide-shopping-cart',
    badge: list.toBuy.length ? { label: `${list.doneCount}/${list.toBuy.length}`, color: 'neutral' as const, variant: 'subtle' as const } : undefined,
  },
])

/** Les vues glissent vers la gauche en allant vers « Acheter », vers la droite en revenant à « Lister ». */
const slideName = computed(() => (list.mode === 'store' ? 'to-store' : 'to-prepare'))

/**
 * Balayage horizontal au doigt pour changer de mode : vers la gauche « Acheter », vers la droite « Lister ».
 * Ignoré s'il part d'un champ de saisie (sélection de texte) ; un geste plutôt vertical reste un défilement.
 */
const swipeArea = useTemplateRef('swipeArea')
let swipeFromField = false
useSwipe(swipeArea, {
  threshold: 60,
  passive: true,
  onSwipeStart: (event) => {
    swipeFromField = event.target instanceof Element && !!event.target.closest('input, textarea, select, [contenteditable]')
  },
  onSwipeEnd: (_event, direction) => {
    if (swipeFromField) return
    if (direction === 'left' && list.mode === 'prepare') list.mode = 'store'
    else if (direction === 'right' && list.mode === 'store') list.mode = 'prepare'
  },
})

const clearOpen = ref(false)
function openClear() {
  clearOpen.value = true
}
const isClearing = ref(false)
const clearDescription = computed(() => {
  const count = list.lines.length
  return `${count} article${count > 1 ? 's' : ''} ser${count > 1 ? 'ont' : 'a'} supprimé${count > 1 ? 's' : ''}, y compris ceux déjà à la maison et dans le panier.`
})

async function onConfirmClear() {
  isClearing.value = true
  const cleared = await list.clearAll()
  isClearing.value = false
  if (cleared) clearOpen.value = false
}

const isFinishing = ref(false)
async function onFinish() {
  isFinishing.value = true
  await list.finishShopping()
  isFinishing.value = false
}
</script>

<template>
  <UDashboardPanel id="liste-courses">
    <template #header>
      <UDashboardNavbar title="Liste de courses">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UTabs
            v-model="list.mode"
            :items="modeItems"
            :content="false"
            variant="pill"
            size="sm"
          />
        </template>
        <template #right>
          <UButton
            v-if="list.mode === 'prepare'"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!list.lines.length"
            aria-label="Vider la liste"
            @click="openClear"
          >
            <span class="hidden sm:inline">Vider la liste</span>
          </UButton>
          <UButton
            v-else-if="list.doneCount > 0"
            icon="i-lucide-check-check"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="isFinishing"
            aria-label="Terminer les courses"
            @click="onFinish"
          >
            <span class="hidden sm:inline">Terminer les courses</span>
          </UButton>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- overflow-x-clip : le décalage du slide ne doit pas élargir la page pendant la transition. -->
      <div ref="swipeArea" class="mx-auto w-full min-w-0 max-w-6xl touch-pan-y overflow-x-clip">
        <Transition :name="slideName" mode="out-in">
          <GroceryPrepareView v-if="list.mode === 'prepare'" />
          <GroceryStoreView v-else :finishing="isFinishing" @finish="onFinish" />
        </Transition>
      </div>
    </template>
  </UDashboardPanel>

  <GroceryAddItemModal v-model:open="list.isAddItemOpen" />

  <ConfirmDialog
    v-model:open="clearOpen"
    title="Vider la liste de courses ?"
    :description="clearDescription"
    confirm-label="Vider la liste"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    :loading="isClearing"
    @confirm="onConfirmClear"
  />
</template>

<style scoped>
.to-store-enter-active,
.to-store-leave-active,
.to-prepare-enter-active,
.to-prepare-leave-active {
  transition: opacity 180ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.to-store-leave-active,
.to-prepare-leave-active {
  transition-duration: 120ms;
  transition-timing-function: ease-in;
}

.to-store-enter-from,
.to-prepare-leave-to {
  opacity: 0;
  transform: translateX(32px);
}

.to-store-leave-to,
.to-prepare-enter-from {
  opacity: 0;
  transform: translateX(-32px);
}

@media (prefers-reduced-motion: reduce) {
  .to-store-enter-active,
  .to-store-leave-active,
  .to-prepare-enter-active,
  .to-prepare-leave-active {
    transition: opacity 120ms ease;
  }

  .to-store-enter-from,
  .to-store-leave-to,
  .to-prepare-enter-from,
  .to-prepare-leave-to {
    transform: none;
  }
}
</style>
