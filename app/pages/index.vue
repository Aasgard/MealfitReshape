<script setup lang="ts">
useSeoMeta({
  title: 'Accueil - Mealfit',
  description: 'Suivez vos ingrédients, vos recettes, et calculez vos besoins nutritionnels journaliers avec Mealfit.',
})

const user = useCurrentUser()

interface SlideRow {
  icon: string
  label: string
  value: string
  checked?: boolean
}

interface Slide {
  id: string
  title: string
  unit: string
  target: number
  current: number
  rows: SlideRow[]
}

const slides: Slide[] = [
  {
    id: 'today',
    title: 'Aujourd\'hui',
    unit: 'kcal',
    target: 2100,
    current: 1650,
    rows: [
      { icon: 'i-lucide-sunrise', label: 'Petit-déjeuner', value: '420 kcal' },
      { icon: 'i-lucide-sun', label: 'Déjeuner', value: '680 kcal' },
      { icon: 'i-lucide-apple', label: 'Collation', value: '200 kcal' },
      { icon: 'i-lucide-moon', label: 'Dîner', value: '350 kcal' },
    ],
  },
  {
    id: 'shopping',
    title: 'Liste de courses',
    unit: 'articles',
    target: 4,
    current: 2,
    rows: [
      { icon: 'i-lucide-drumstick', label: 'Poulet', value: '500 g', checked: true },
      { icon: 'i-lucide-wheat', label: 'Riz complet', value: '1 kg', checked: true },
      { icon: 'i-lucide-carrot', label: 'Brocolis', value: '2 pièces', checked: false },
      { icon: 'i-lucide-milk', label: 'Yaourt nature', value: 'x6', checked: false },
    ],
  },
  {
    id: 'weekly',
    title: 'Menus de la semaine',
    unit: 'jours planifiés',
    target: 7,
    current: 4,
    rows: [
      { icon: 'i-lucide-drumstick', label: 'Aujourd\'hui', value: 'Poulet basquaise' },
      { icon: 'i-lucide-carrot', label: 'Demain', value: 'Curry de légumes' },
      { icon: 'i-lucide-wheat', label: 'Mercredi', value: 'Pâtes bolognaise' },
      { icon: 'i-lucide-fish', label: 'Jeudi', value: 'Saumon grillé' },
    ],
  },
]

const ROW_BASE_DELAY = 100
const ROW_STAGGER = 70
const FILL_DELAY = 250
const FILL_DURATION = 550
const SLIDE_INTERVAL = 4200

function rowDelay(index: number) {
  return `${ROW_BASE_DELAY + index * ROW_STAGGER}ms`
}

const activeIndex = ref(0)
const rowsRevealed = ref(slides.map(() => false))
const fillRevealed = ref(slides.map(() => false))
const displayedValue = ref(slides.map(() => 0))
const hasPlayed = ref(slides.map(() => false))

let reducedMotion = false
let timer: ReturnType<typeof setInterval> | null = null
let userPaused = false

function playSlide(index: number) {
  const slide = slides[index]

  if (reducedMotion) {
    rowsRevealed.value[index] = true
    fillRevealed.value[index] = true
    displayedValue.value[index] = slide.current
    hasPlayed.value[index] = true
    return
  }

  // Double rAF: guarantees the browser paints the hidden starting state
  // before we flip to visible, so the transition is never skipped.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      rowsRevealed.value[index] = true
      fillRevealed.value[index] = true
    })
  })

  const start = performance.now() + FILL_DELAY
  const tick = (now: number) => {
    const elapsed = now - start
    if (elapsed < 0) {
      requestAnimationFrame(tick)
      return
    }
    const t = Math.min(elapsed / FILL_DURATION, 1)
    const eased = 1 - (1 - t) ** 3
    displayedValue.value[index] = Math.round(eased * slide.current)
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  hasPlayed.value[index] = true
}

function activate(index: number) {
  activeIndex.value = index
  if (!hasPlayed.value[index]) {
    playSlide(index)
  }
}

// A manual pick hands control to the visitor; the loop should not fight them for it.
function goTo(index: number) {
  userPaused = true
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  activate(index)
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  playSlide(0)

  if (reducedMotion) return

  timer = setInterval(() => {
    if (userPaused) return
    activate((activeIndex.value + 1) % slides.length)
  }, SLIDE_INTERVAL)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="min-h-screen bg-default">
    <header class="border-b border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <NuxtLink to="/" class="font-bold tracking-tight text-highlighted">
          MEALFIT <span class="text-primary">RESHAPE</span>
        </NuxtLink>

        <UButton v-if="!user" to="/login" label="Se connecter" color="neutral" variant="outline" />
      </div>
    </header>

    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <p class="text-xs font-semibold tracking-widest text-primary uppercase">
            Nutrition &amp; activité physique
          </p>

          <h1 class="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-highlighted leading-[1.1]">
            Gérez votre alimentation et votre activité physique
          </h1>

          <p class="mt-6 text-lg text-muted max-w-lg">
            Suivez vos ingrédients, vos recettes, et calculez vos besoins nutritionnels journaliers.
            Une question pour démarrer — le reste se remplit au fil de l'eau.
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <UButton v-if="user" to="/dashboard" label="Accéder à mon dashboard" size="lg" />
            <template v-else>
              <UButton to="/login" label="Commencer" size="lg" />
              <NuxtLink
                to="/dashboard"
                class="text-sm text-muted hover:text-highlighted transition-colors"
              >
                Déjà inscrit ? <span class="text-primary font-medium">Voir le dashboard</span>
              </NuxtLink>
            </template>
          </div>
        </div>

        <div
          class="relative aspect-square flex items-center justify-center p-6 sm:p-10 rounded-lg border border-default overflow-hidden"
          aria-hidden="true"
        >
          <div
            class="absolute inset-0"
            style="background: radial-gradient(circle at 30% 20%, var(--ui-color-primary-100), transparent 60%);"
          />

          <div class="relative w-full max-w-sm">
            <div class="overflow-hidden">
              <div
                class="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                :style="{ transform: `translateX(-${activeIndex * 100}%)` }"
              >
                <div
                  v-for="(slide, index) in slides"
                  :key="slide.id"
                  class="w-full shrink-0 px-3"
                >
                  <div class="rounded-lg border border-default bg-elevated shadow-lg overflow-hidden">
                    <div class="flex items-center justify-between px-5 py-4 border-b border-default">
                      <p class="text-sm font-semibold text-highlighted">
                        {{ slide.title }}
                      </p>
                      <p class="text-xs text-muted tabular-nums">
                        {{ displayedValue[index] }} / {{ slide.target }} {{ slide.unit }}
                      </p>
                    </div>

                    <div class="flex flex-col gap-3 p-5">
                      <div
                        v-for="(row, rowIndex) in slide.rows"
                        :key="row.label"
                        class="flex items-center gap-3 transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.16,1,0.3,1)]"
                        :style="{
                          opacity: rowsRevealed[index] ? 1 : 0,
                          transform: rowsRevealed[index] ? 'translateY(0)' : 'translateY(8px)',
                          transitionDelay: rowDelay(rowIndex),
                        }"
                      >
                        <div class="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary shrink-0">
                          <UIcon :name="row.icon" class="size-4" />
                        </div>
                        <p
                          class="text-sm flex-1"
                          :class="row.checked ? 'text-muted line-through' : 'text-highlighted'"
                        >
                          {{ row.label }}
                        </p>
                        <p class="text-sm text-muted">
                          {{ row.value }}
                        </p>
                      </div>
                    </div>

                    <div class="px-5 pb-4">
                      <div class="h-1.5 rounded-full bg-primary/10 overflow-hidden">
                        <div
                          class="h-full rounded-full bg-primary origin-left transition-transform duration-550 ease-[cubic-bezier(0.16,1,0.3,1)] delay-250"
                          :style="{ transform: `scaleX(${fillRevealed[index] ? slide.current / slide.target : 0})` }"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-center gap-1.5 pt-4">
              <button
                v-for="(slide, index) in slides"
                :key="slide.id"
                type="button"
                tabindex="-1"
                class="size-1.5 rounded-full transition-colors"
                :class="index === activeIndex ? 'bg-primary' : 'bg-primary/20 hover:bg-primary/40'"
                :aria-label="`Voir : ${slide.title}`"
                @click="goTo(index)"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
