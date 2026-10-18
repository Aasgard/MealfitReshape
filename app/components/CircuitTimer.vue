<script setup lang="ts">
import type { CircuitStep } from '~/utils/workouts'
import type { WorkoutCircuit } from '~/types/workout'

/**
 * Minuteur d'un circuit (HIIT), plein écran : effort, repos, grand repos entre deux tours, enchaînés tout seuls avec
 * un bip et une vibration à chaque changement et trois bips avant la fin. Pendant un repos, on note les répétitions
 * de l'exercice qui vient de finir. Le temps est calculé sur l'horloge : une page passée en arrière-plan rattrape les
 * étapes écoulées à son retour.
 */
const props = defineProps<{
  circuit: WorkoutCircuit
  /**
   * Minuteur rapide (sans séance) : pas de saisie des répétitions, et « Quitter » ferme sans confirmation puisque rien
   * n'est enregistré.
   */
  quick?: boolean
}>()

const emit = defineEmits<{
  /** Répétitions notées et tours terminés, à reporter dans la séance. */
  update: [circuit: WorkoutCircuit]
  /** « Quitter sans enregistrer » : le circuit a été remis comme à l'ouverture ; la séance annule aussi son chrono s'il a été lancé avec le minuteur. */
  discard: []
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

/** Décompte avant le premier effort. */
const READY_SEC = 5

type Phase = 'idle' | 'ready' | 'running' | 'finished'
const phase = ref<Phase>('idle')
const steps = ref<CircuitStep[]>([])
const stepIndex = ref(0)
/** Fin de l'étape en cours (horloge) ; `pausedRemaining` quand le minuteur est en pause. */
const endAt = ref(0)
const pausedRemaining = ref<number | null>(null)
const now = ref(Date.now())

/** Circuit lancé et pas fini : fermer le minuteur (geste retour) le met en pause au lieu de l'arrêter. */
const inProgress = computed(() => phase.value === 'ready' || phase.value === 'running')

/** Le circuit tel qu'il était à l'ouverture du minuteur, rétabli par « Quitter sans enregistrer ». */
let snapshot: WorkoutCircuit | null = null

// `immediate` : la séance monte le minuteur déjà ouvert (`v-if` sur le circuit choisi) ; sans lui, les étapes ne
// seraient jamais préparées et « C'est parti » ne ferait rien.
watch(open, (isOpen) => {
  if (!isOpen) {
    // Fermé par le geste retour en plein circuit : pause, on reprendra au même endroit.
    if (inProgress.value && pausedRemaining.value === null) pausedRemaining.value = Math.max(0, endAt.value - Date.now())
    return stop()
  }
  // Réouverture d'un circuit en pause : on garde l'étape et le temps restant (« Reprendre » relance).
  if (inProgress.value) return startTicker()
  snapshot = JSON.parse(JSON.stringify(props.circuit))
  steps.value = circuitSteps(props.circuit)
  stepIndex.value = 0
  pausedRemaining.value = null
  phase.value = 'idle'
}, { immediate: true })

// --- Quitter sans enregistrer ---

/** Rien n'a encore été fait : on ferme sans confirmation. */
const hasProgress = computed(() => phase.value !== 'idle')
const discardOpen = ref(false)

function requestDiscard() {
  if (props.quick) {
    stop()
    phase.value = 'idle'
    pausedRemaining.value = null
    open.value = false
  }
  else if (hasProgress.value) discardOpen.value = true
  else open.value = false
}

/** Rétablit le circuit d'avant le minuteur (répétitions, tours) et remet le minuteur à zéro. */
async function confirmDiscard() {
  discardOpen.value = false
  stop()
  if (snapshot) emit('update', snapshot)
  emit('discard')
  phase.value = 'idle'
  pausedRemaining.value = null
  stepIndex.value = 0
  // La fermeture du dialog consomme son entrée d'historique avant celle du minuteur.
  await nextTick()
  await afterOverlayBacks()
  open.value = false
}

const step = computed(() => steps.value[stepIndex.value] ?? null)
const remainingMs = computed(() => pausedRemaining.value ?? Math.max(0, endAt.value - now.value))
const remainingSec = computed(() => Math.ceil(remainingMs.value / 1000))
const items = computed(() => props.circuit.items)

/** Exercice affiché : celui de l'effort, ou le suivant pendant un repos. */
const nextWorkStep = computed(() => steps.value.slice(stepIndex.value + 1).find(s => s.kind === 'work') ?? null)
const currentItem = computed(() => {
  if (phase.value === 'ready') return items.value[0] ?? null
  if (step.value?.kind === 'work') return items.value[step.value.itemIndex] ?? null
  return nextWorkStep.value ? items.value[nextWorkStep.value.itemIndex] ?? null : null
})
/** Exercice qui vient de finir (repos, fin) : celui dont on note les répétitions. */
const finishedStep = computed(() => {
  if (phase.value === 'finished') return steps.value.slice(0, stepIndex.value + 1).reverse().find(s => s.kind === 'work') ?? null
  return step.value && step.value.kind !== 'work' ? step.value : null
})

const roundLabel = computed(() => {
  const s = phase.value === 'ready' ? steps.value[0] : step.value ?? steps.value.at(-1)
  return s ? `Tour ${s.round + 1}/${props.circuit.rounds}` : ''
})
const itemLabel = computed(() => {
  const s = phase.value === 'ready' ? steps.value[0] : step.value?.kind === 'work' ? step.value : nextWorkStep.value
  return s ? `Exercice ${s.itemIndex + 1}/${items.value.length}` : ''
})

const phaseLabel = computed(() => {
  if (phase.value === 'ready') return 'Prêt'
  if (phase.value === 'finished') return 'Terminé'
  return step.value?.kind === 'work' ? 'Effort' : step.value?.kind === 'roundRest' ? 'Grand repos' : 'Repos'
})
/**
 * Compteur d'intensité à aiguille, à la place du nom de la phase au-dessus du chrono, en trois zones : vert (grand
 * repos, décompte), jaune (repos entre exercices), rouge (effort). Angle de l'aiguille en degrés depuis la verticale.
 */
const intensity = computed<'low' | 'mid' | 'high'>(() => {
  if (phase.value === 'running' && step.value?.kind === 'work') return 'high'
  if (phase.value === 'running' && step.value?.kind === 'rest') return 'mid'
  return 'low'
})
const needleAngle = computed(() => ({ low: -62, mid: 0, high: 62 })[intensity.value])
/** Durée totale du circuit, affichée au chrono avant le départ. */
const totalSec = computed(() => circuitDurationSec(props.circuit, props.circuit.rounds))

/** Ligne du nom : premier exercice avant le départ, exercice en cours, « Repos », « Circuit terminé ». */
const nameLine = computed(() => {
  if (phase.value === 'finished') return 'Circuit terminé'
  if (phase.value === 'idle') return items.value[0]?.label ?? '—'
  return isRest.value ? phaseLabel.value : currentItem.value?.label ?? '—'
})

/** Ligne d'information visible avant le départ, pendant un repos (exercice suivant) et à la fin. */
const infoVisible = computed(() => phase.value === 'idle' || phase.value === 'finished' || (isRest.value && !!nextItem.value))

const isWork = computed(() => phase.value === 'running' && step.value?.kind === 'work')
/** Repos (entre exercices ou entre tours) : « Repos » à la place du nom, l'exercice suivant sous les répétitions. */
const isRest = computed(() => phase.value === 'running' && !!step.value && step.value.kind !== 'work')
/** Exercice qui suit le repos en cours. */
const nextItem = computed(() => (nextWorkStep.value ? items.value[nextWorkStep.value.itemIndex] ?? null : null))

/** Part faite d'une étape : 1 avant l'étape en cours, la part écoulée pour celle-ci, 0 après. */
function stepFill(index: number) {
  if (phase.value === 'finished') return index <= stepIndex.value ? 1 : 0
  if (phase.value !== 'running') return 0
  if (index < stepIndex.value) return 1
  if (index > stepIndex.value) return 0
  const duration = steps.value[index]!.durationSec * 1000
  return duration ? Math.min(1, Math.max(0, 1 - remainingMs.value / duration)) : 1
}

/**
 * Barre de progression découpée : un segment par exercice (effort), large comme sa durée, regroupés par tour ; les
 * repos n'y figurent pas. Les tours sont repérés dessous (T1, T2…).
 */
const roundBars = computed(() => {
  const rounds = Array.from({ length: props.circuit.rounds }, (_, round) => ({
    round,
    weight: 0,
    segments: [] as { index: number, kind: CircuitStep['kind'], weight: number, fill: number }[],
  }))
  steps.value.forEach((st, index) => {
    const group = rounds[st.round]
    if (!group || st.kind !== 'work') return
    group.weight += st.durationSec
    group.segments.push({ index, kind: st.kind, weight: st.durationSec, fill: stepFill(index) })
  })
  return rounds.filter(r => r.segments.length)
})

// --- Sons et vibrations ---

/** Signal d'une nouvelle étape : aigu et double vibration pour l'effort, grave pour un repos. */
function cueStep(kind: CircuitStep['kind'] | 'end') {
  if (kind === 'work') {
    timerBeep(1320, 400)
    timerVibrate([120, 60, 120])
  }
  else if (kind === 'end') {
    timerBeep(1320, 250)
    setTimeout(() => timerBeep(1760, 600), 300)
    timerVibrate([200, 100, 200, 100, 400])
  }
  else {
    timerBeep(660, 400)
    timerVibrate(250)
  }
}

// --- Déroulé ---

let ticker: ReturnType<typeof setInterval> | undefined
let lastCueSec = 0

function stop() {
  clearInterval(ticker)
  ticker = undefined
}

/** Premier toucher : il autorise le son (geste de l'utilisateur), puis 5 s de décompte avant le premier effort. */
function begin() {
  // Réglages changés depuis l'ouverture : on repart du circuit tel qu'il est.
  steps.value = circuitSteps(props.circuit)
  if (!steps.value.length) return
  unlockTimerSound()
  phase.value = 'ready'
  endAt.value = Date.now() + READY_SEC * 1000
  lastCueSec = READY_SEC + 1
  stop()
  startTicker()
}

function startTicker() {
  if (!ticker) ticker = setInterval(tick, 200)
}

function tick() {
  now.value = Date.now()
  if (pausedRemaining.value !== null) return
  // Trois bips courts sur les 3 dernières secondes de l'étape.
  const sec = remainingSec.value
  if (sec <= 3 && sec >= 1 && sec < lastCueSec) timerBeep(880, 120)
  lastCueSec = sec
  // Rattrape toutes les étapes écoulées (page restée en arrière-plan), sans rejouer leurs signaux.
  let advanced = false
  while (phase.value !== 'finished' && now.value >= endAt.value) {
    advance()
    advanced = true
  }
  if (advanced) {
    lastCueSec = remainingSec.value + 1
    cueStep(phase.value === 'finished' ? 'end' : step.value!.kind)
  }
}

/** Étape suivante ; la fin du dernier exercice d'un tour compte ce tour comme fait. */
function advance() {
  if (phase.value === 'ready') {
    phase.value = 'running'
    stepIndex.value = 0
    endAt.value += steps.value[0]!.durationSec * 1000
    return
  }
  const current = step.value
  if (current?.kind === 'work' && current.itemIndex === items.value.length - 1) setRoundsDone(current.round + 1)
  if (stepIndex.value >= steps.value.length - 1) {
    phase.value = 'finished'
    stop()
    return
  }
  stepIndex.value++
  endAt.value += step.value!.durationSec * 1000
}

function togglePause() {
  if (pausedRemaining.value === null) {
    pausedRemaining.value = Math.max(0, endAt.value - Date.now())
  }
  else {
    endAt.value = Date.now() + pausedRemaining.value
    pausedRemaining.value = null
    startTicker()
  }
}

/** Tour de l'étape en cours (le premier pendant le décompte). */
const currentRound = computed(() => (phase.value === 'ready' ? 0 : step.value?.round ?? 0))

/**
 * Terminer le tour : il compte comme fait, et le minuteur passe au grand repos qui suit (ou au premier effort du tour
 * suivant s'il n'y a pas de repos). Au dernier tour, cela termine le circuit.
 */
function finishRound() {
  if (!inProgress.value) return
  const round = currentRound.value
  if (round >= props.circuit.rounds - 1) return finishCircuit()
  setRoundsDone(round + 1)
  const next = steps.value.findIndex(st => (st.kind === 'roundRest' && st.round === round) || (st.kind === 'work' && st.round === round + 1))
  if (next < 0) return finishCircuit()
  phase.value = 'running'
  stepIndex.value = next
  pausedRemaining.value = null
  endAt.value = Date.now() + steps.value[next]!.durationSec * 1000
  lastCueSec = remainingSec.value + 1
  startTicker()
  cueStep(steps.value[next]!.kind)
}

/** Terminer le circuit : le tour en cours compte comme fait, on passe à l'écran de fin (répétitions du dernier exercice). */
function finishCircuit() {
  if (!inProgress.value) return
  setRoundsDone(currentRound.value + 1)
  stop()
  pausedRemaining.value = null
  phase.value = 'finished'
  cueStep('end')
}

/** Passer : l'étape en cours se termine maintenant. */
function skip() {
  if (phase.value !== 'ready' && phase.value !== 'running') return
  const wasPaused = pausedRemaining.value !== null
  pausedRemaining.value = null
  endAt.value = Date.now()
  tick()
  // `tick` a pu changer la phase (fin du circuit) : TypeScript ne le voit pas.
  if (wasPaused && (phase.value as Phase) !== 'finished') togglePause()
}

// Le son est partagé avec les minuteurs de cuisine : on ne le ferme pas.
onBeforeUnmount(stop)

// --- Résultats ---

function setRoundsDone(roundsDone: number) {
  if ((props.circuit.roundsDone ?? 0) >= roundsDone) return
  emit('update', { ...props.circuit, roundsDone })
}

const repsOf = (itemIndex: number, round: number) => items.value[itemIndex]?.reps?.[round] ?? null

function setReps(itemIndex: number, round: number, value: number | null) {
  emit('update', {
    ...props.circuit,
    items: items.value.map((item, i) => {
      if (i !== itemIndex) return item
      const reps = itemReps(item, props.circuit.rounds)
      reps[round] = value
      return { ...item, reps }
    }),
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :close="false"
    :title="circuit.label || 'Circuit'"
    :ui="{ header: 'hidden', body: 'flex flex-col p-0 sm:p-0' }"
  >
    <template #body>
      <div
        class="flex min-h-full flex-1 flex-col transition-colors duration-300 motion-reduce:transition-none"
        :class="isWork ? 'bg-primary/10' : 'bg-default'"
      >
        <!-- Repères : tour, exercice. -->
        <div class="flex items-center gap-3 border-b border-default px-4 py-3 sm:px-6">
          <p class="flex-1 truncate text-sm font-semibold text-highlighted">
            {{ circuit.label || 'Circuit' }}
          </p>
          <p class="text-xs tabular-nums text-muted">
            {{ roundLabel }}<template v-if="itemLabel">
              · {{ itemLabel }}
            </template>
          </p>
        </div>
        <!-- Progression : un segment par exercice, groupés par tour (sans les repos). -->
        <div class="flex gap-1.5 px-4 pt-3 sm:px-6" aria-hidden="true">
          <div
            v-for="bar in roundBars"
            :key="bar.round"
            class="flex min-w-0 flex-col gap-1"
            :style="{ flexGrow: bar.weight, flexBasis: 0 }"
          >
            <div class="flex h-2 gap-px">
              <div
                v-for="segment in bar.segments"
                :key="segment.index"
                class="relative overflow-hidden rounded-[1px] bg-accented"
                :style="{ flexGrow: segment.weight, flexBasis: 0 }"
              >
                <div
                  class="absolute inset-y-0 start-0 bg-primary transition-[width] duration-200 ease-linear"
                  :style="{ width: `${segment.fill * 100}%` }"
                />
              </div>
            </div>
            <p
              class="truncate text-center text-[10px] font-semibold tabular-nums"
              :class="bar.round === currentRound && phase !== 'idle' && phase !== 'finished' ? 'text-primary' : 'text-dimmed'"
            >
              T{{ bar.round + 1 }}
            </p>
          </div>
        </div>

        <!--
          Ancré en haut (pas centré), et les mêmes emplacements à toutes les étapes (avant le départ, décompte, effort,
          repos, fin) : compteur, chrono, nom, boutons, répétitions, ligne d'information. Chaque emplacement a une hauteur
          fixe et reste en place, rempli ou non : rien ne bouge d'un écran à l'autre.
        -->
        <div class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-start gap-6 px-4 pt-[6dvh] pb-8 text-center">
          <!-- 1. Phase : compteur d'intensité à aiguille (texte pour les lecteurs d'écran) ; un drapeau à la fin. -->
          <p class="flex h-8 items-center justify-center text-highlighted" aria-live="assertive">
            <UIcon v-if="phase === 'finished'" name="i-lucide-flag" class="size-8 text-muted" aria-hidden="true" />
            <svg v-else viewBox="0 0 40 24" class="h-8 w-[3.33rem]" fill="none" stroke="currentColor" stroke-linecap="butt" aria-hidden="true">
              <!-- Cadran en trois zones : vert, jaune, rouge ; la zone de la phase est vive, les autres pâles. -->
              <path d="M5 21 A15 15 0 0 1 9.4 10.4" stroke-width="3" style="stroke: var(--ui-success)" :opacity="intensity === 'low' ? 1 : 0.3" />
              <path d="M9.4 10.4 A15 15 0 0 1 30.6 10.4" stroke-width="3" style="stroke: var(--ui-warning)" :opacity="intensity === 'mid' ? 1 : 0.3" />
              <path d="M30.6 10.4 A15 15 0 0 1 35 21" stroke-width="3" style="stroke: var(--ui-error)" :opacity="intensity === 'high' ? 1 : 0.3" />
              <!-- Aiguille, qui pivote entre effort et repos. -->
              <g
                class="transition-transform duration-500 ease-out motion-reduce:transition-none"
                :style="{ transform: `rotate(${needleAngle}deg)`, transformOrigin: '20px 21px' }"
              >
                <path d="M20 21 L20 9" stroke-width="2.5" stroke-linecap="round" />
              </g>
              <circle cx="20" cy="21" r="2.5" fill="currentColor" stroke="none" />
            </svg>
            <span class="sr-only">{{ phase === 'idle' ? 'Prêt à démarrer' : phaseLabel }}</span>
          </p>

          <!-- 2. Chrono : durée totale du circuit avant le départ, temps restant ensuite, 0:00 à la fin. -->
          <p
            class="text-[7rem] leading-none font-bold tracking-tight tabular-nums sm:text-[9rem]"
            :class="phase === 'idle' || phase === 'finished' ? 'text-dimmed' : 'text-highlighted'"
            role="timer"
          >
            {{ formatClock(phase === 'idle' ? totalSec : phase === 'finished' ? 0 : remainingSec) }}
          </p>

          <!--
            3. Nom, sur une hauteur fixe de deux lignes : le premier exercice avant le départ, l'exercice en cours, « Repos »
            pendant un repos, « Circuit terminé » à la fin.
          -->
          <p class="flex h-[2lh] items-center justify-center text-2xl font-bold tracking-tight" :class="isRest ? 'text-muted' : 'text-highlighted'" :title="nameLine">
            <span class="line-clamp-2 text-balance">{{ nameLine }}</span>
          </p>

          <!-- 4. Boutons : « C'est parti » avant le départ, Pause / Passer pendant le circuit, « Fermer » à la fin. -->
          <div class="flex h-12 items-center gap-3">
            <UButton
              v-if="phase === 'idle'"
              label="C'est parti"
              icon="i-lucide-play"
              size="xl"
              class="px-8"
              :disabled="!items.length"
              @click="begin"
            />
            <UButton
              v-else-if="phase === 'finished'"
              label="Fermer"
              icon="i-lucide-check"
              size="xl"
              class="px-8"
              @click="open = false"
            />
            <template v-else>
              <UButton
                :label="pausedRemaining !== null ? 'Reprendre' : 'Pause'"
                :icon="pausedRemaining !== null ? 'i-lucide-play' : 'i-lucide-pause'"
                size="xl"
                :color="pausedRemaining !== null ? 'primary' : 'neutral'"
                :variant="pausedRemaining !== null ? 'solid' : 'outline'"
                @click="togglePause"
              />
              <UButton
                label="Passer"
                icon="i-lucide-skip-forward"
                size="xl"
                color="neutral"
                variant="outline"
                @click="skip"
              />
            </template>
          </div>

          <!-- 5. Répétitions de l'exercice qui vient de finir (repos, fin) ; place gardée le reste du temps. Pas en minuteur rapide. -->
          <template v-if="!quick">
            <div v-if="finishedStep" class="flex w-full max-w-80 flex-col gap-1.5">
              <p class="w-full truncate text-lg text-muted" aria-hidden="true">
                Répétitions · <span class="font-medium text-highlighted">{{ items[finishedStep.itemIndex]?.label }}</span>
              </p>
              <NumberPadInput
                :key="`${finishedStep.round}-${finishedStep.itemIndex}`"
                :model-value="repsOf(finishedStep.itemIndex, finishedStep.round)"
                size="lg"
                placeholder="Toucher pour noter"
                :label="`${items[finishedStep.itemIndex]?.label} · tour ${finishedStep.round + 1}`"
                @update:model-value="setReps(finishedStep.itemIndex, finishedStep.round, $event)"
              />
            </div>
            <div v-else class="invisible flex w-full max-w-80 flex-col gap-1.5" aria-hidden="true">
              <p class="text-lg">
                Répétitions
              </p>
              <div class="h-14" />
            </div>
          </template>

          <!--
            6. Ligne d'information : le circuit avant le départ, l'exercice suivant pendant un repos, les tours faits à la
            fin ; place gardée pendant l'effort.
          -->
          <p
            class="w-full max-w-80 truncate text-lg text-muted"
            :class="!infoVisible && 'invisible'"
            :aria-hidden="!infoVisible"
          >
            <template v-if="phase === 'idle'">
              <span class="tabular-nums">{{ items.length }}</span> exo{{ items.length > 1 ? 's' : '' }}
              · <span class="tabular-nums">{{ circuit.rounds }}</span> tour{{ circuit.rounds > 1 ? 's' : '' }}
            </template>
            <template v-else-if="phase === 'finished'">
              <span class="font-semibold tabular-nums text-highlighted">{{ circuit.roundsDone ?? 0 }}</span>/{{ circuit.rounds }} tours faits
            </template>
            <template v-else>
              Ensuite · <span class="font-semibold text-highlighted">{{ nextItem?.label ?? '—' }}</span>
              <template v-if="nextItem">
                · <span class="tabular-nums">{{ formatSeconds(nextItem.workSec) }}</span>
              </template>
            </template>
          </p>
        </div>

        <!-- Pied fixe, en bas de l'écran : ces boutons ne bougent pas quand le contenu au-dessus change. -->
        <div
          v-if="phase !== 'finished'"
          class="flex flex-col items-center gap-2 border-t border-default px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6"
        >
          <!-- Fin anticipée : le tour, ou tout le circuit (les tours faits et les répétitions sont gardés). -->
          <div v-if="inProgress" class="grid w-full max-w-md grid-cols-2 gap-2">
            <UButton
              :label="currentRound >= circuit.rounds - 1 ? 'Terminer le dernier tour' : 'Terminer le tour'"
              icon="i-lucide-skip-forward"
              color="neutral"
              variant="outline"
              block
              @click="finishRound"
            />
            <UButton
              label="Terminer le circuit"
              icon="i-lucide-flag"
              color="neutral"
              variant="outline"
              block
              @click="finishCircuit"
            />
          </div>
          <p v-if="phase === 'idle'" class="text-xs text-dimmed">
            Bip et vibration à chaque changement, trois bips avant la fin de l'effort.
          </p>
          <UButton
            :label="inProgress && !quick ? 'Quitter sans enregistrer' : 'Quitter'"
            icon="i-lucide-x"
            :color="inProgress && !quick ? 'error' : 'neutral'"
            variant="ghost"
            @click="requestDiscard"
          />
        </div>
      </div>
    </template>
  </UModal>

  <ConfirmDialog
    v-model:open="discardOpen"
    title="Quitter sans enregistrer ?"
    description="Les répétitions notées et les tours faits depuis l'ouverture du minuteur seront effacés, ainsi que le chrono s'il a démarré avec lui."
    confirm-label="Quitter sans enregistrer"
    cancel-label="Continuer"
    confirm-color="error"
    confirm-icon="i-lucide-x"
    @confirm="confirmDiscard"
  />
</template>
