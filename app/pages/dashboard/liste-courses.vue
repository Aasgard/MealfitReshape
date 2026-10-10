<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { useSwipe } from '@vueuse/core'

useSeoMeta({
  title: 'Dashboard - Liste de courses - Mealfit',
  description: 'Dashboard - Liste de courses - Mealfit',
})

/**
 * Page non zoomable : en magasin, les touches rapides sur les articles et le balayage entre les modes ne doivent pas
 * zoomer, ni le focus d'un champ (iOS). Rétabli en quittant la page.
 * - balise viewport : `maximum-scale=1, user-scalable=no` (Android, focus des champs sur iOS) ;
 * - `touch-action: pan-x pan-y` sur la racine : ni pincement ni double appui, sur toute la page et les panneaux
 *   téléportés sous `body` ;
 * - événements `gesture*` de Safari annulés : iOS ignore `user-scalable=no` pour le pincement.
 * `interactive-widget=resizes-content` : sur Android, le clavier réduit la page au lieu de recouvrir les panneaux du bas.
 */
useHead({
  meta: [{ key: 'viewport', name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-content' }],
})

const preventGesture = (event: Event) => event.preventDefault()
const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const
onMounted(() => {
  document.documentElement.style.touchAction = 'pan-x pan-y'
  for (const name of GESTURE_EVENTS) document.addEventListener(name, preventGesture, { passive: false })
})
onBeforeUnmount(() => {
  document.documentElement.style.removeProperty('touch-action')
  for (const name of GESTURE_EVENTS) document.removeEventListener(name, preventGesture)
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
const clearDescription = 'Tous les articles seront retirés et les repas décochés. Ce qui a déjà été acheté reste mémorisé.'

async function onConfirmClear() {
  isClearing.value = true
  const cleared = await list.clearAll()
  isClearing.value = false
  if (cleared) clearOpen.value = false
}

/** « Terminer les courses » demande confirmation : les articles retirés ne reviennent pas. */
const finishOpen = ref(false)
function onFinish() {
  finishOpen.value = true
}

const isFinishing = ref(false)
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`
const finishDescription = computed(() => {
  const inCart = list.doneCount
  const atHome = list.atHomeLines.length
  const left = list.toBuy.length - inCart
  // Ex. : « 12 articles du panier et 3 déjà à la maison quitteront la liste… 4 articles non cochés restent à acheter. »
  const removed = [
    inCart ? `${plural(inCart, 'article')} du panier` : null,
    atHome ? `${atHome} déjà à la maison` : null,
  ].filter(Boolean).join(' et ')
  const sentences: string[] = []
  if (removed) sentences.push(`${removed} quitter${inCart + atHome > 1 ? 'ont' : 'a'} la liste, leurs repas seront marqués achetés.`)
  if (left) sentences.push(`${plural(left, 'article')} non coché${left > 1 ? 's' : ''} rest${left > 1 ? 'ent' : 'e'} à acheter.`)
  return sentences.join(' ')
})

async function onConfirmFinish() {
  isFinishing.value = true
  await list.finishShopping()
  isFinishing.value = false
  finishOpen.value = false
}
</script>

<template>
  <!-- En mode Lister sur grand écran, la page ne défile pas : chaque panneau fait défiler son contenu. -->
  <UDashboardPanel id="liste-courses" :ui="{ body: list.mode === 'prepare' ? 'lg:overflow-hidden' : undefined }">
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
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!list.lines.length"
            aria-label="Repartir de zéro"
            @click="openClear"
          >
            <span class="hidden sm:inline">Repartir de zéro</span>
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
      <div ref="swipeArea" class="mx-auto flex w-full min-w-0 max-w-6xl flex-1 touch-pan-y flex-col overflow-x-clip lg:min-h-0">
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
    title="Repartir de zéro ?"
    :description="clearDescription"
    confirm-label="Repartir de zéro"
    confirm-color="error"
    confirm-icon="i-lucide-rotate-ccw"
    :loading="isClearing"
    @confirm="onConfirmClear"
  />

  <ConfirmDialog
    v-model:open="finishOpen"
    title="Terminer les courses ?"
    :description="finishDescription"
    confirm-label="Terminer les courses"
    confirm-icon="i-lucide-check-check"
    :loading="isFinishing"
    @confirm="onConfirmFinish"
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
