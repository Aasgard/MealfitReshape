<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import type { KitchenTimer } from '~/composables/useKitchenTimers'

/**
 * Pastille des minuteurs de cuisine, sur toutes les pages du dashboard tant qu'il y en a un : le plus proche de la fin
 * (ou celui qui sonne, avec « Arrêter » à portée de doigt), et « +N » pour les autres. Un toucher déplie la pile.
 * Masquée sur la page Minuteurs, qui les liste déjà.
 */
const { timers, remainingMs, isRinging, remove, hasActive } = useKitchenTimers()
const route = useRoute()

// L'écran reste allumé tant qu'un minuteur tourne, même fiche fermée.
useScreenWakeLock(hasActive)

const visible = computed(() => timers.value.length > 0 && route.path !== '/dashboard/minuteurs')
const expanded = ref(false)
watch(visible, (isVisible) => { if (!isVisible) expanded.value = false })

const first = computed(() => timers.value[0] ?? null)
const firstRinging = computed(() => (first.value ? isRinging(first.value) : false))
const others = computed(() => timers.value.length - 1)
const firstClock = computed(() => (first.value ? formatClock(Math.ceil(remainingMs(first.value) / 1000)) : ''))

const panel = useTemplateRef<HTMLElement>('panel')
const collapse = () => { expanded.value = false }
onClickOutside(panel, collapse)
onKeyStroke('Escape', collapse)

/** Fiche rouverte depuis un minuteur. */
const recipeRequest = ref<{ id: string, parts?: number | null, at: number } | null>(null)
function openRecipe(recipe: NonNullable<KitchenTimer['recipe']>) {
  expanded.value = false
  recipeRequest.value = { id: recipe.id, parts: recipe.parts, at: Date.now() }
}
</script>

<template>
  <Transition
    enter-active-class="motion-safe:transition motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
    enter-from-class="opacity-0 translate-y-3"
    leave-active-class="motion-safe:transition motion-safe:duration-150 motion-safe:ease-in"
    leave-to-class="opacity-0 translate-y-3"
  >
    <div
      v-if="visible && first"
      ref="panel"
      class="pointer-events-none fixed z-40 bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-4 mx-auto max-w-sm lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-sm"
    >
      <!-- Pile dépliée -->
      <section
        v-if="expanded"
        aria-label="Minuteurs en cours"
        class="pointer-events-auto flex max-h-[min(32rem,70dvh)] flex-col overflow-hidden rounded-xl bg-default shadow-[0_12px_32px_-8px_rgb(0_0_0/0.25)] ring ring-default"
      >
        <header class="flex items-center gap-2 border-b border-default py-1.5 ps-3 pe-1.5">
          <UIcon name="i-lucide-timer" class="size-4 shrink-0 text-muted" />
          <h2 class="flex-1 text-sm font-semibold text-highlighted">Minuteurs</h2>
          <UButton
            to="/dashboard/minuteurs"
            icon="i-lucide-plus"
            label="Nouveau"
            color="neutral"
            variant="ghost"
            size="sm"
          />
          <UButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            size="lg"
            class="size-11 justify-center"
            aria-label="Replier les minuteurs"
            @click="collapse"
          />
        </header>
        <ul class="divide-y divide-default overflow-y-auto overscroll-contain">
          <li v-for="timer in timers" :key="timer.id">
            <KitchenTimerRow :timer="timer" show-recipe @open-recipe="openRecipe" />
          </li>
        </ul>
      </section>

      <!-- Pastille repliée -->
      <div
        v-else
        class="pointer-events-auto mx-auto flex w-fit max-w-full items-center rounded-full lg:me-0 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.3)] ring transition-colors"
        :class="firstRinging ? 'bg-inverted text-inverted ring-transparent' : 'bg-default ring-default'"
      >
        <button
          type="button"
          class="flex min-h-12 min-w-0 items-center gap-2.5 rounded-full py-1.5 ps-4 pe-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :aria-label="`Afficher les minuteurs (${timers.length})`"
          aria-expanded="false"
          @click="expanded = true"
        >
          <UIcon
            :name="firstRinging ? 'i-lucide-bell-ring' : 'i-lucide-timer'"
            class="size-5 shrink-0"
            :class="firstRinging ? 'motion-safe:animate-bounce' : first.endAt === null ? 'text-muted' : 'text-primary'"
          />
          <span class="min-w-0 truncate text-sm" :class="firstRinging ? 'font-semibold' : 'font-medium text-default'">
            {{ first.label }}
          </span>
          <!-- Terminé : la pastille inversée, la cloche et « Arrêter » suffisent, le nom garde la place. -->
          <span
            v-if="!firstRinging"
            class="shrink-0 text-lg font-bold tabular-nums tracking-tight"
            :class="first.endAt === null ? 'text-muted' : 'text-highlighted'"
          >{{ firstClock }}</span>
          <span
            v-if="others > 0"
            class="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums"
            :class="firstRinging ? 'bg-(--ui-text-inverted)/20' : 'bg-elevated text-muted'"
          >+{{ others }}</span>
        </button>
        <UButton
          v-if="firstRinging"
          label="Arrêter"
          color="neutral"
          variant="solid"
          size="lg"
          class="me-1.5 h-10 shrink-0 rounded-full bg-default px-4 text-highlighted hover:bg-elevated"
          @click="remove(first.id)"
        />
      </div>
    </div>
  </Transition>

  <!-- Le minuteur terminé est annoncé une fois aux lecteurs d'écran. -->
  <div class="sr-only" aria-live="assertive">
    {{ firstRinging && first ? `${first.label} terminé` : '' }}
  </div>

  <KitchenTimerRecipeReturn v-if="recipeRequest" :request="recipeRequest" />
</template>
