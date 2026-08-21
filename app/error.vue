<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const user = useCurrentUser()

const is404 = computed(() => props.error.status === 404)
const canRetry = computed(() => (props.error.status ?? 500) >= 500)
const homeLink = computed(() => (user.value ? '/dashboard' : '/'))

interface FactRow {
  icon: string
  label: string
  value: string
  countTo?: number
  suffix?: string
}

const headline = computed(() => (is404.value ? 'Page introuvable.' : 'Une erreur est survenue.'))

const description = computed(() =>
  is404.value
    ? 'L\'adresse a peut-être été mal recopiée, ou la page a été déplacée depuis.'
    : 'Quelque chose s\'est mal passé de notre côté. Ce n\'est pas vous, c\'est nous.'
)

const facts = computed<FactRow[]>(() =>
  is404.value
    ? [
        { icon: 'i-lucide-flame', label: 'Frustration', value: '60 %', countTo: 60, suffix: ' %' },
        { icon: 'i-lucide-search-x', label: 'Solutions trouvées', value: '0', countTo: 0 },
        { icon: 'i-lucide-coffee', label: 'Cafés recommandés', value: '1', countTo: 1 },
        { icon: 'i-lucide-keyboard', label: 'Faute de frappe probable', value: 'élevée' },
      ]
    : [
        { icon: 'i-lucide-flame', label: 'Frustration', value: '100 %', countTo: 100, suffix: ' %' },
        { icon: 'i-lucide-wrench', label: 'Développeurs notifiés', value: '1', countTo: 1 },
        { icon: 'i-lucide-coffee', label: 'Cafés recommandés', value: '2', countTo: 2 },
        { icon: 'i-lucide-shield-check', label: 'Confiance en nous', value: 'intacte' },
      ]
)

useSeoMeta({
  title: () => (is404.value ? 'Page introuvable - Mealfit' : 'Erreur - Mealfit'),
  description: 'Une erreur est survenue sur Mealfit.',
})

function goHome() {
  clearError({ redirect: homeLink.value })
}

function retry() {
  clearError()
}

const ROW_BASE_DELAY = 100
const ROW_STAGGER = 80
const COUNT_DURATION = 450

function rowDelay(index: number) {
  return `${ROW_BASE_DELAY + index * ROW_STAGGER}ms`
}

const rowsRevealed = ref(false)
const displayedCounts = ref(facts.value.map(fact => fact.countTo ?? 0))

onMounted(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (reducedMotion) {
    rowsRevealed.value = true
    return
  }

  displayedCounts.value = facts.value.map(() => 0)

  // Double rAF: guarantees the browser paints the hidden starting state
  // before we flip to visible, so the transition is never skipped.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      rowsRevealed.value = true
    })
  })

  facts.value.forEach((fact, index) => {
    if (fact.countTo === undefined) return

    const start = performance.now() + ROW_BASE_DELAY + index * ROW_STAGGER
    const tick = (now: number) => {
      const elapsed = now - start
      if (elapsed < 0) {
        requestAnimationFrame(tick)
        return
      }
      const t = Math.min(elapsed / COUNT_DURATION, 1)
      const eased = 1 - (1 - t) ** 3
      displayedCounts.value[index] = Math.round(eased * fact.countTo!)
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
})
</script>

<template>
  <div class="min-h-screen bg-default flex flex-col">
    <header class="border-b border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
        <button type="button" class="font-bold tracking-tight text-highlighted" @click="goHome">
          MEALFIT <span class="text-primary">RESHAPE</span>
        </button>
      </div>
    </header>

    <div class="flex-1 flex items-center justify-center px-4 py-16">
      <div class="w-full max-w-md">
        <div class="flex flex-col items-center text-center gap-2">
          <div class="flex items-center justify-center size-12 rounded-lg bg-primary/10 text-primary">
            <UIcon
              :name="is404 ? 'i-lucide-search-x' : 'i-lucide-server-crash'"
              class="size-6"
              :class="is404 ? 'motion-safe:animate-[mealfit-404-look_0.7s_ease-out_0.2s_1_both]' : 'motion-safe:animate-[mealfit-500-flicker_0.6s_linear_0.2s_1_both]'"
            />
          </div>
          <h1 class="mt-2 text-2xl font-bold tracking-tight text-highlighted">
            {{ headline }}
          </h1>
          <p class="text-muted max-w-sm">
            {{ description }}
          </p>
        </div>

        <div class="mt-8 rounded-lg border border-default bg-elevated overflow-hidden">
          <div class="px-5 py-3 border-b border-default">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              Fiche nutritionnelle de cette erreur
            </p>
          </div>
          <div class="flex flex-col">
            <div
              v-for="(fact, index) in facts"
              :key="fact.label"
              data-fact-row
              class="flex items-center gap-3 px-5 py-3 border-b border-default last:border-b-0 transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.16,1,0.3,1)]"
              :style="{
                opacity: rowsRevealed ? 1 : 0,
                transform: rowsRevealed ? 'translateY(0)' : 'translateY(8px)',
                transitionDelay: rowDelay(index),
              }"
            >
              <div class="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary shrink-0">
                <UIcon :name="fact.icon" class="size-4" />
              </div>
              <p class="text-sm text-highlighted flex-1">
                {{ fact.label }}
              </p>
              <p class="text-sm font-medium text-muted tabular-nums">
                {{ fact.countTo !== undefined ? `${displayedCounts[index]}${fact.suffix ?? ''}` : fact.value }}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <UButton
            :label="user ? 'Retour au dashboard' : 'Retour à l\'accueil'"
            size="lg"
            @click="goHome"
          />
          <UButton
            v-if="canRetry"
            label="Réessayer"
            size="lg"
            color="neutral"
            variant="outline"
            @click="retry"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes mealfit-404-look {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(-12deg); }
  50% { transform: rotate(10deg); }
  75% { transform: rotate(-5deg); }
  100% { transform: rotate(0deg); }
}

@keyframes mealfit-500-flicker {
  0%, 100% { opacity: 1; }
  15% { opacity: 0.25; }
  30% { opacity: 1; }
  42% { opacity: 0.2; }
  55% { opacity: 1; }
  70% { opacity: 0.5; }
  85% { opacity: 1; }
}
</style>
