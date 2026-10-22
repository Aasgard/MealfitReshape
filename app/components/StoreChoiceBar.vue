<script setup lang="ts">
/**
 * Choix d'un magasin (ou de « Tous ») : un rail de boutons dans un creux `bg-elevated`, l'option active en primaire,
 * comme les bascules segmentées. Chaque magasin garde sa pastille d'enseigne ; chaque option porte son reste à acheter.
 * Trop d'options pour la largeur : le rail défile à l'horizontale, l'option active ramenée dans le champ. Chaque bord
 * derrière lequel il reste des options s'estompe et porte un chevron, qui fait défiler d'une largeur de rail.
 */
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { GroceryStoreChoice } from '~/composables/useGroceryList'
import { storeColor } from '~/utils/stores'

const props = withDefaults(defineProps<{
  choices: GroceryStoreChoice[]
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string
  size?: 'sm' | 'md'
}>(), { size: 'sm' })

const model = defineModel<string>({ required: true })

const rail = useTemplateRef('rail')

/** Options masquées avant (à gauche) et après (à droite) la partie visible du rail. */
const hiddenBefore = ref(false)
const hiddenAfter = ref(false)

function measure() {
  const el = rail.value
  if (!el) return
  // 1 px de marge : les largeurs fractionnaires laissent parfois un reste de défilement invisible.
  hiddenBefore.value = el.scrollLeft > 1
  hiddenAfter.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

useEventListener(rail, 'scroll', measure, { passive: true })
useResizeObserver(rail, measure)
watch(() => props.choices.length, () => nextTick(measure))

function revealActive(behavior: ScrollBehavior = 'smooth') {
  const active = rail.value?.querySelector<HTMLElement>('[aria-pressed="true"]')
  active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior })
}

onMounted(() => {
  revealActive('instant')
  measure()
})
watch(model, () => nextTick(() => revealActive()))

/** Fait défiler vers les options masquées, d'un peu moins qu'une largeur de rail pour garder un repère. */
function scrollBy(direction: -1 | 1) {
  const el = rail.value
  if (!el) return
  el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
}

const isActive = (choice: GroceryStoreChoice) => choice.value === model.value
</script>

<template>
  <!-- `data-no-swipe` : faire défiler le rail ne bascule pas entre « Lister » et « Acheter ». -->
  <div class="relative flex max-w-full overflow-hidden rounded-lg bg-elevated" data-no-swipe>
    <div
      ref="rail"
      role="group"
      :aria-label="props.label"
      class="store-rail flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain p-1"
    >
      <button
        v-for="choice in choices"
        :key="choice.value"
        type="button"
        :aria-pressed="isActive(choice)"
        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        :class="[
          size === 'md' ? 'h-9 px-3 text-sm' : 'h-7 px-2.5 text-xs',
          isActive(choice) ? 'bg-primary text-inverted' : 'text-default hover:bg-accented/60',
        ]"
        @click="model = choice.value"
      >
        <!-- Pastille d'enseigne : sur l'option active, elle reste lisible dans un anneau clair. -->
        <span
          v-if="choice.color"
          class="size-2.5 shrink-0 rounded-full outline -outline-offset-1"
          :class="[storeColor(choice.color).dot, isActive(choice) && 'ring-2 ring-inverted/80']"
          aria-hidden="true"
        />
        {{ choice.label }}
        <span
          class="tabular-nums"
          :class="isActive(choice) ? 'text-inverted/75' : 'text-dimmed'"
        >{{ choice.count }}</span>
      </button>
    </div>

    <!-- Indices de débordement : fondu sur le bord, chevron pour faire défiler. Masqués au lecteur d'écran, qui parcourt tout le groupe. -->
    <Transition name="edge">
      <div v-if="hiddenBefore" class="pointer-events-none absolute inset-y-0 left-0 flex items-center" aria-hidden="true">
        <button
          type="button"
          tabindex="-1"
          class="pointer-events-auto flex h-full cursor-pointer items-center bg-elevated ps-1 pe-0.5 text-muted hover:text-highlighted"
          @click="scrollBy(-1)"
        >
          <UIcon name="i-lucide-chevron-left" class="size-4" />
        </button>
        <span class="h-full w-6 bg-linear-to-r from-(--ui-bg-elevated) to-transparent" />
      </div>
    </Transition>
    <Transition name="edge">
      <div v-if="hiddenAfter" class="pointer-events-none absolute inset-y-0 right-0 flex items-center" aria-hidden="true">
        <span class="h-full w-6 bg-linear-to-l from-(--ui-bg-elevated) to-transparent" />
        <button
          type="button"
          tabindex="-1"
          class="pointer-events-auto flex h-full cursor-pointer items-center bg-elevated ps-0.5 pe-1 text-muted hover:text-highlighted"
          @click="scrollBy(1)"
        >
          <UIcon name="i-lucide-chevron-right" class="size-4" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.store-rail {
  scrollbar-width: none;
}

.store-rail::-webkit-scrollbar {
  display: none;
}

.edge-enter-active,
.edge-leave-active {
  transition: opacity 150ms ease;
}

.edge-enter-from,
.edge-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .edge-enter-active,
  .edge-leave-active {
    transition: none;
  }
}
</style>
