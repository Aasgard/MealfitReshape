<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { Exercise, ExerciseKind } from '~/types/workout'

/**
 * Choix d'un ou plusieurs exercices dans le catalogue : recherche, filtre muscu / cardio, liste par groupe.
 * Chaque ligne rappelle la dernière fois que l'exercice a été fait, quand on la connaît.
 */
const props = withDefaults(defineProps<{
  exercises: Exercise[]
  /** Dernière performance par id d'exercice (« 3 × 10 × 40 kg »). */
  hints?: Map<string, string>
  /** Famille proposée à l'ouverture ; `null` = toutes. */
  initialKind?: ExerciseKind | null
  title?: string
  isOwned?: (exercise: Exercise) => boolean
  /** Propose de créer un exercice perso (le parent gère `create`). */
  allowCreate?: boolean
}>(), {
  hints: () => new Map(),
  initialKind: null,
  title: 'Ajouter des exercices',
  isOwned: () => false,
  allowCreate: true,
})

const emit = defineEmits<{
  pick: [exercises: Exercise[]]
  /** Aucun résultat : créer un exercice perso portant ce nom. */
  create: [label: string]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

// Téléphone : pas de focus automatique sur la recherche (le clavier et sa barre de remplissage ne s'ouvrent qu'à la
// demande) ; une fois le clavier ouvert, la fenêtre se cale en haut et s'arrête au-dessus de lui (voir `ui.content`).
const isTouch = useMediaQuery('(pointer: coarse)')
useKeyboardInset(() => open.value && isTouch.value)

const search = ref('')
const kind = ref<ExerciseKind | 'ALL'>('ALL')
const selectedIds = ref<string[]>([])

watch(open, (isOpen) => {
  if (!isOpen) return
  search.value = ''
  kind.value = props.initialKind ?? 'ALL'
  selectedIds.value = []
})

const kindItems = [
  { label: 'Tous', value: 'ALL', icon: 'i-lucide-layout-list' },
  { label: 'Muscu', value: 'STRENGTH', icon: 'i-lucide-dumbbell' },
  { label: 'Cardio', value: 'CARDIO', icon: 'i-lucide-heart-pulse' },
] as const

const sections = computed(() => {
  const visible = props.exercises.filter(e =>
    (kind.value === 'ALL' || e.kind === kind.value) && matchesSearch(e.label, search.value))
  return EXERCISE_GROUPS
    .map(group => ({ group, items: visible.filter(e => e.group === group.key) }))
    .filter(section => section.items.length)
})

const resultCount = computed(() => sections.value.reduce((total, s) => total + s.items.length, 0))

const byId = computed(() => new Map(props.exercises.map(e => [e.id, e])))

const toggle = (id: string) => {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(x => x !== id)
    : [...selectedIds.value, id]
}

const metricHint = (exercise: Exercise) =>
  ({ WEIGHT_REPS: 'Charge × rép.', REPS: 'Poids du corps', DURATION: 'Durée', CARDIO: 'Durée · distance' })[exercise.metric]

function submit() {
  const picked = selectedIds.value.map(id => byId.value.get(id)).filter((e): e is Exercise => !!e)
  if (!picked.length) return
  emit('pick', picked)
  open.value = false
}

function createFromSearch() {
  emit('create', search.value.trim())
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :ui="{
      content: 'top-4 -translate-y-0 max-h-[calc(100dvh-var(--keyboard-inset,0px)-2rem)] sm:top-1/2 sm:-translate-y-1/2 sm:max-w-lg',
      body: 'p-0 sm:p-0',
      footer: 'justify-between',
    }"
  >
    <template #body>
      <!-- Mobile : recherche et filtres (en icônes) sur une ligne ; sm+ : filtres en toutes lettres et compteur dessous. -->
      <div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-default bg-default p-4 sm:gap-3 sm:px-6">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Rechercher un exercice..."
          name="exercise-search"
          type="search"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
          data-form-type="other"
          data-lpignore="true"
          :autofocus="!isTouch"
          class="min-w-0 flex-1 sm:basis-full"
        />
        <div class="inline-flex shrink-0 rounded-lg bg-elevated p-1" role="radiogroup" aria-label="Famille d'exercices">
          <button
            v-for="item in kindItems"
            :key="item.value"
            type="button"
            role="radio"
            :aria-checked="kind === item.value"
            class="flex cursor-pointer items-center rounded-md px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:px-3"
            :class="kind === item.value ? 'bg-default text-primary ring ring-default' : 'text-muted hover:text-highlighted'"
            @click="kind = item.value"
          >
            <UIcon :name="item.icon" class="size-4 sm:hidden" aria-hidden="true" />
            <span class="sr-only sm:not-sr-only">{{ item.label }}</span>
          </button>
        </div>
        <p class="ms-auto hidden text-xs tabular-nums text-dimmed sm:block">
          {{ resultCount }} exercice{{ resultCount > 1 ? 's' : '' }}
        </p>
      </div>

      <div v-if="!sections.length" class="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p class="text-sm text-muted">
          Aucun exercice ne correspond à « {{ search }} ».
        </p>
        <UButton
          v-if="allowCreate && search.trim()"
          icon="i-lucide-plus"
          :label="`Créer « ${search.trim()} »`"
          variant="outline"
          @click="createFromSearch"
        />
      </div>

      <div v-else class="pb-2">
        <section v-for="section in sections" :key="section.group.key" :aria-label="section.group.label">
          <h3 class="px-4 pt-4 pb-1.5 text-xs font-semibold uppercase tracking-wide text-dimmed sm:px-6">
            {{ section.group.label }}
          </h3>
          <ul class="divide-y divide-default border-y border-default">
            <li v-for="exercise in section.items" :key="exercise.id">
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-6"
                :aria-pressed="selectedIds.includes(exercise.id)"
                @click="toggle(exercise.id)"
              >
                <span
                  class="flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors"
                  :class="selectedIds.includes(exercise.id) ? 'border-primary bg-primary text-inverted' : 'border-accented'"
                  aria-hidden="true"
                >
                  <UIcon v-if="selectedIds.includes(exercise.id)" name="i-lucide-check" class="size-3.5" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-highlighted">{{ exercise.label }}</span>
                    <ListPrivateBadge v-if="isOwned(exercise)" />
                  </span>
                  <span class="block truncate text-xs text-dimmed">
                    <template v-if="hints.get(exercise.id)">
                      Dernière fois <span class="tabular-nums text-muted">{{ hints.get(exercise.id) }}</span>
                    </template>
                    <template v-else>{{ metricHint(exercise) }}</template>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <template #footer>
      <UButton
        v-if="allowCreate"
        label="Nouvel exercice"
        icon="i-lucide-plus"
        color="neutral"
        variant="ghost"
        @click="createFromSearch"
      />
      <UButton
        class="ms-auto"
        :label="selectedIds.length ? `Ajouter (${selectedIds.length})` : 'Ajouter'"
        icon="i-lucide-check"
        :disabled="!selectedIds.length"
        @click="submit"
      />
    </template>
  </UModal>
</template>
