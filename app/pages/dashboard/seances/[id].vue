<script setup lang="ts">
import { format, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useEventListener } from '@vueuse/core'
import { Timestamp } from 'firebase/firestore'
import type { Exercise, ExerciseKind, Workout, WorkoutCircuit, WorkoutExercise, WorkoutTemplate } from '~/types/workout'
import type { ExerciseInput } from '~/composables/useExercises'
import { isWorkoutEmpty, NEW_WORKOUT_ROUTE_ID } from '~/utils/workouts'

/**
 * Une séance, en direct (chrono, séries validées une à une, repos) ou saisie après coup. Rien n'est écrit sans
 * « Enregistrer » ou « Terminer » ; quitter la page avec des modifications demande confirmation.
 */
useSeoMeta({
  title: 'Dashboard - Séance - Mealfit',
  description: 'Dashboard - Séance - Mealfit',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const appConfig = useAppConfig()

const workoutId = computed(() => String(route.params.id))

const { workouts, promise: workoutsLoaded, saveWorkout, draftWorkout, deleteWorkout, exercisesFromTemplate, circuitsFromTemplate } = useWorkouts()
/** `/dashboard/seances/nouvelle` : séance passée en mémoire, créée en base seulement à l'enregistrement. */
const isNew = computed(() => workoutId.value === NEW_WORKOUT_ROUTE_ID)
const { exercises, isOwned, createExercise, promise: exercisesLoaded } = useExercises()
const { templates, saveTemplate } = useWorkoutTemplates()

await Promise.all([workoutsLoaded.value.catch(() => undefined), exercisesLoaded.value])

const stored = computed(() => workouts.value.find(w => w.id === workoutId.value) ?? null)

/** Ce qui est enregistré d'une séance, comparable d'une version à l'autre. */
const snapshot = (w: Workout) => JSON.stringify({
  label: w.label,
  date: w.date.toMillis(),
  status: w.status,
  startedAt: w.startedAt ? w.startedAt.toMillis() : w.startedAt,
  durationMin: w.durationMin,
  kcal: w.kcal,
  note: w.note,
  exercises: w.exercises,
  circuits: w.circuits,
})

/**
 * Brouillon local, seule source de l'affichage : copié une fois depuis Firestore, écrit seulement à l'enregistrement.
 * Les retours de nos propres écritures ne l'écrasent pas (on reste l'unique éditeur de la séance).
 */
const draft = ref<Workout | null>(null)
/** Dernière version enregistrée : le brouillon a des modifications tant qu'il en diffère. */
const savedSnapshot = ref('')
watch(stored, (value) => {
  if (!value || (draft.value && draft.value.id === value.id)) return
  // Copie profonde des exercices ; la date reste un Timestamp (immuable, et `structuredClone` lui ferait perdre ses méthodes).
  draft.value = { ...value, exercises: JSON.parse(JSON.stringify(value.exercises)) }
  savedSnapshot.value = snapshot(draft.value)
}, { immediate: true })
if (isNew.value) {
  draft.value = draftWorkout()
  savedSnapshot.value = snapshot(draft.value)
}

const isDirty = computed(() => !!draft.value && snapshot(draft.value) !== savedSnapshot.value)

const live = computed(() => draft.value?.status === 'IN_PROGRESS')
/**
 * Une séance terminée s'ouvre en consultation ; `?modifier` (bouton « Modifier », action du journal) la rend
 * modifiable. Une séance en direct ou pas encore enregistrée l'est toujours.
 */
const readonly = computed(() => !isNew.value && draft.value?.status === 'DONE' && route.query.modifier === undefined)
const startEditing = () => router.replace({ query: { ...route.query, modifier: null } })
const title = computed(() => draft.value ? workoutTitle(draft.value) : 'Séance')

// --- Enregistrement ---

/** Séance supprimée depuis cette page : plus rien à écrire. */
let deleted = false
const saving = ref(false)

/** Écrit le brouillon ; `false` si l'écriture a échoué (toast affiché). */
async function save(): Promise<boolean> {
  if (!draft.value || deleted) return true
  // Cardio seul : la durée est celle des sorties, une durée de séance ferait doublon.
  if (isCardioOnly.value && stats.value?.cardioMin) draft.value.durationMin = null
  saving.value = true
  try {
    await saveWorkout(draft.value)
    savedSnapshot.value = snapshot(draft.value)
    return true
  }
  catch (error) {
    toast.add({ title: 'Séance non enregistrée', description: (error as Error).message, color: 'error' })
    return false
  }
  finally {
    saving.value = false
  }
}

/** Une séance vide n'est pas enregistrée : elle disparaît en quittant la page plutôt que d'encombrer le journal. */
const isEmpty = isWorkoutEmpty

/** Séance terminée : « Enregistrer » écrit et ramène au journal. */
async function saveAndClose() {
  if (!draft.value) return
  if (isEmpty(draft.value)) {
    toast.add({ title: 'Séance vide', description: 'Ajoutez un exercice, une durée ou des kcal avant d\'enregistrer.', color: 'warning', icon: 'i-lucide-triangle-alert' })
    return
  }
  if (!await save()) return
  toast.add({ title: 'Séance enregistrée', description: title.value, color: 'success', icon: 'i-lucide-check' })
  await router.push('/dashboard/seances')
}

/** Séance en direct : « Enregistrer » écrit sans quitter, pour la reprendre plus tard ou d'un autre appareil. */
async function saveLive() {
  if (await save()) toast.add({ title: 'Séance enregistrée', description: 'Vous pourrez la reprendre plus tard.', color: 'success', icon: 'i-lucide-check' })
}

// --- Sortie de la page ---

const leaveOpen = ref(false)
let pendingLeave: string | null = null
let allowLeave = false

/** Une séance restée vide en base (créée puis abandonnée) est supprimée en partant. */
async function dropIfEmpty() {
  const saved = stored.value
  if (!deleted && saved && saved.status === 'DONE' && isEmpty(saved)) await deleteWorkout(saved.id).catch(() => undefined)
}

onBeforeRouteLeave(async (to) => {
  if (!deleted && !allowLeave && isDirty.value) {
    pendingLeave = to.fullPath
    leaveOpen.value = true
    return false
  }
  await dropIfEmpty()
})

async function confirmLeave() {
  allowLeave = true
  leaveOpen.value = false
  // La fermeture du dialog consomme son entrée d'historique : naviguer avant ramènerait ici.
  await nextTick()
  await afterOverlayBacks()
  await router.push(pendingLeave ?? '/dashboard/seances')
}

/** Rechargement ou fermeture de l'onglet avec des modifications : le navigateur demande confirmation. */
useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
  if (!isDirty.value || deleted) return
  event.preventDefault()
  event.returnValue = ''
})

// --- Chrono et repos ---

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => { ticker = setInterval(() => (now.value = Date.now()), 1000) })
onBeforeUnmount(() => clearInterval(ticker))

/** Début du chrono ; `null` tant que la séance n'est pas démarrée. */
const startMillis = computed(() => draft.value ? workoutStartMillis(draft.value) : null)
const started = computed(() => startMillis.value !== null)
const elapsedSec = computed(() => startMillis.value !== null ? (now.value - startMillis.value) / 1000 : 0)

/** « Démarrer » lance le chrono et l'enregistre tout de suite : la séance se reprend d'un autre appareil au bon temps. */
const startingChrono = ref(false)
async function startChrono() {
  if (!draft.value) return
  const nowStamp = Timestamp.now()
  draft.value.startedAt = nowStamp
  // La séance date de son vrai début, pas de sa préparation.
  draft.value.date = nowStamp
  startingChrono.value = true
  const ok = await save()
  startingChrono.value = false
  if (!ok) draft.value.startedAt = null
}
const restStartedAt = ref<number | null>(null)
const restSec = computed(() => restStartedAt.value ? (now.value - restStartedAt.value) / 1000 : null)

/** Garde l'écran allumé pendant une séance en direct (téléphone posé sur le banc). */
let wakeLock: { release: () => Promise<void> } | null = null
async function syncWakeLock() {
  try {
    if (live.value && !wakeLock && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      wakeLock = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen')
    }
    else if (!live.value && wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  }
  catch {
    // Refusé (économie d'énergie, navigateur) : l'écran s'éteindra comme d'habitude.
  }
}
watch(live, syncWakeLock)
onMounted(syncWakeLock)
// Le navigateur rend le verrou quand la page passe en arrière-plan : on le redemande au retour.
useEventListener(document, 'visibilitychange', () => {
  wakeLock = null
  void syncWakeLock()
})
onBeforeUnmount(() => { void wakeLock?.release().catch(() => undefined) })

// --- Exercices ---

const previousFor = (exercise: WorkoutExercise) => draft.value
  ? lastPerformance(workouts.value, exercise.exerciseId, { before: draft.value.date.toMillis(), excludeId: draft.value.id })
  : null

const hints = computed(() => {
  const map = new Map<string, string>()
  for (const exercise of exercises.value) {
    const last = lastPerformance(workouts.value, exercise.id, { excludeId: draft.value?.id })
    if (last) map.set(exercise.id, exercise.metric === 'CARDIO' ? formatCardio(last.exercise) : formatSets(last.exercise.sets, exercise.metric))
  }
  return map
})

const pickerOpen = ref(false)
/** Circuit qui reçoit les exercices choisis ; `null` = exercices classiques de la séance. */
const pickerCircuitKey = ref<string | null>(null)
const openPicker = (circuitKey: string | null = null) => {
  pickerCircuitKey.value = circuitKey
  pickerOpen.value = true
}
const pickerKind = computed<ExerciseKind | null>(() => {
  if (pickerCircuitKey.value) return 'STRENGTH'
  if (!draft.value?.exercises.length) return null
  return isCardioWorkout(draft.value) ? 'CARDIO' : 'STRENGTH'
})

function addExercises(list: Pick<Exercise, 'id' | 'label' | 'group' | 'metric'>[]) {
  if (!draft.value) return
  if (pickerCircuitKey.value) return addToCircuit(pickerCircuitKey.value, list)
  const added = list.map(e => newWorkoutExercise(e, {
    previous: lastPerformance(workouts.value, e.id, { before: draft.value!.date.toMillis(), excludeId: draft.value!.id })?.exercise,
  }))
  draft.value.exercises = [...draft.value.exercises, ...added]
  nextTick(() => document.getElementById(`exercise-${added[0]?.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

// --- Circuits (HIIT) ---

/** Nouveau circuit : réglages ouverts, et choix de ses exercices tout de suite. */
function addCircuit() {
  if (!draft.value) return
  const circuit = { ...newCircuit(), roundsDone: 0 }
  draft.value.circuits = [...draft.value.circuits, circuit]
  openPicker(circuit.key)
}

/** Les exercices ajoutés reprennent le temps d'effort du dernier exercice du circuit. */
function addToCircuit(key: string, list: Pick<Exercise, 'id' | 'label' | 'group'>[]) {
  const circuit = draft.value?.circuits.find(c => c.key === key)
  if (!circuit) return
  const workSec = circuit.items.at(-1)?.workSec
  updateCircuit(key, { ...circuit, items: [...circuit.items, ...list.map(e => circuitItemFrom(e, workSec))] })
}

const updateCircuit = (key: string, value: WorkoutCircuit) => {
  if (draft.value) draft.value.circuits = draft.value.circuits.map(c => (c.key === key ? value : c))
}
const removeCircuit = (key: string) => {
  if (draft.value) draft.value.circuits = draft.value.circuits.filter(c => c.key !== key)
}

/** Minuteur d'un circuit ; le lancer démarre aussi le chrono de la séance s'il ne tourne pas encore. */
const timerCircuitKey = ref<string | null>(null)
const timerOpen = ref(false)
const timerCircuit = computed(() => draft.value?.circuits.find(c => c.key === timerCircuitKey.value) ?? null)
/** Chrono lancé par le minuteur (et date d'avant) : « Quitter sans enregistrer » le remet comme avant. */
let chronoBeforeTimer: { date: Timestamp } | null = null

async function openTimer(key: string) {
  timerCircuitKey.value = key
  timerOpen.value = true
  if (live.value && !started.value && draft.value) {
    chronoBeforeTimer = { date: draft.value.date }
    await startChrono()
  }
}

// Minuteur refermé (circuit fini, en pause) : le chrono qu'il a lancé fait désormais partie de la séance.
watch(timerOpen, (isOpen) => {
  if (!isOpen) chronoBeforeTimer = null
})

/** Minuteur quitté sans enregistrer : il a rétabli le circuit ; on annule aussi le chrono qu'il avait démarré. */
async function onTimerDiscard() {
  if (!chronoBeforeTimer || !draft.value) return
  draft.value.startedAt = null
  draft.value.date = chronoBeforeTimer.date
  chronoBeforeTimer = null
  await save()
}

// --- Programmes ---

const templatePickerOpen = ref(false)

/**
 * Ajoute un programme à la séance : ses exercices (charges de la dernière fois) et ses circuits viennent après ceux
 * déjà là. Une séance sans nom ni programme prend ceux du programme.
 */
function addTemplate(template: WorkoutTemplate) {
  if (!draft.value) return
  const exercises = exercisesFromTemplate(template)
  draft.value.exercises = [...draft.value.exercises, ...exercises]
  draft.value.circuits = [...draft.value.circuits, ...circuitsFromTemplate(template)]
  if (!draft.value.label.trim()) draft.value.label = template.label
  if (!draft.value.templateId) draft.value.templateId = template.id
  toast.add({ title: 'Programme ajouté', description: template.label, color: 'success', icon: 'i-lucide-check' })
  const first = exercises[0]
  if (first) nextTick(() => document.getElementById(`exercise-${first.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

/** Les trois façons de remplir une séance vide, présentées à égalité. */
const emptyChoices = [
  { title: 'Exercices', description: 'Muscu ou sortie cardio ; les charges de la dernière fois sont reprises.', icon: 'i-lucide-dumbbell', action: () => openPicker() },
  { title: 'Circuit HIIT', description: 'Exercices enchaînés en temps, en plusieurs tours, avec minuteur.', icon: 'i-lucide-repeat', action: () => addCircuit() },
  { title: 'Programme', description: 'Une séance-type déjà prête : ses exercices et ses circuits.', icon: 'i-lucide-list-checks', action: () => (templatePickerOpen.value = true) },
]

const hasContent = computed(() => !!draft.value && (draft.value.exercises.length > 0 || draft.value.circuits.length > 0))

const updateExercise = (index: number, value: WorkoutExercise) => {
  if (draft.value) draft.value.exercises.splice(index, 1, value)
}
const removeExercise = (index: number) => draft.value?.exercises.splice(index, 1)
const moveExercise = (index: number, direction: -1 | 1) => {
  const list = draft.value?.exercises
  const target = index + direction
  if (!list || target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item!)
}

// Création d'un exercice perso depuis le sélecteur : il est ajouté tout de suite à la séance.
const exerciseFormOpen = ref(false)
const exerciseFormLabel = ref('')
const exerciseSaving = ref(false)
function openExerciseForm(label: string) {
  exerciseFormLabel.value = label
  exerciseFormOpen.value = true
}
async function onCreateExercise(input: ExerciseInput) {
  exerciseSaving.value = true
  try {
    const id = await createExercise(input)
    addExercises([{ id, ...input }])
    exerciseFormOpen.value = false
    toast.add({ title: 'Exercice créé', description: input.label, color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    toast.add({ title: 'Exercice non créé', description: (error as Error).message, color: 'error' })
  }
  finally {
    exerciseSaving.value = false
  }
}

// --- Relevé ---

const stats = computed(() => draft.value ? workoutStats(draft.value) : null)
/** Séance saisie après coup qui n'a que du cardio : pas de durée propre, c'est celle des sorties (`workoutDuration`). */
const isCardioOnly = computed(() => !!draft.value && draft.value.status === 'DONE' && isCardioWorkout(draft.value) && !draft.value.circuits.length)
/** Durée des sorties, sinon celle de la séance (chrono) ; celle de la séance est retirée à l'enregistrement si elle fait doublon. */
const shownDuration = computed(() => isCardioOnly.value
  ? stats.value?.cardioMin || draft.value?.durationMin || null
  : draft.value ? workoutDuration(draft.value) : null)
const volume = computed(() => stats.value?.volumeKg ? formatVolume(stats.value.volumeKg) : null)
const dateInput = computed({
  get: () => draft.value ? format(draft.value.date.toDate(), 'yyyy-MM-dd') : '',
  set: (value: string) => {
    if (!draft.value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    const [y, m, d] = value.split('-').map(Number)
    const current = draft.value.date.toDate()
    draft.value.date = Timestamp.fromDate(new Date(y!, m! - 1, d!, current.getHours(), current.getMinutes()))
  },
})
const todayIso = format(new Date(), 'yyyy-MM-dd')
const readonlyDate = computed(() => draft.value ? format(draft.value.date.toDate(), 'd MMM yyyy', { locale: fr }) : '')
const startedLabel = computed(() => {
  if (!draft.value) return ''
  if (startMillis.value === null) return 'À démarrer'
  const date = new Date(startMillis.value)
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM HH:mm', { locale: fr })
})

// --- Fin de séance ---

const finishOpen = ref(false)
const finishing = ref(false)
/** Séries laissées vides : retirées en terminant. */
const emptySets = computed(() => draft.value?.exercises.reduce((total, e) =>
  total + (e.metric === 'CARDIO' ? 0 : e.sets.filter(s => !isSetFilled(s, e.metric)).length), 0) ?? 0)

async function finish({ durationMin, kcal }: { durationMin: number | null, kcal: number | null }) {
  if (!draft.value) return
  finishing.value = true
  // En cas d'échec, la séance reste en cours telle qu'elle était.
  const before = { ...draft.value, exercises: draft.value.exercises }
  // Toute série remplie est gardée, cochée ou non ; seules les séries vides sont retirées.
  draft.value.exercises = draft.value.exercises
    .map(e => e.metric === 'CARDIO' ? e : { ...e, sets: e.sets.filter(s => isSetFilled(s, e.metric)).map(s => ({ ...s, done: true })) })
    .filter(e => e.metric === 'CARDIO' || e.sets.length)
  draft.value.durationMin = durationMin
  draft.value.kcal = kcal
  draft.value.status = 'DONE'
  const ok = await save()
  finishing.value = false
  if (!ok) {
    draft.value = before
    return
  }
  finishOpen.value = false
  restStartedAt.value = null
  toast.add({ title: 'Séance terminée', description: title.value, color: 'success', icon: 'i-lucide-flag' })
  // Retour au journal, une fois consommée l'entrée d'historique de la fenêtre (sinon le retour ramènerait ici).
  await nextTick()
  await afterOverlayBacks()
  await router.push('/dashboard/seances')
}

// --- Actions ---

const deleteOpen = ref(false)
async function confirmDelete() {
  if (!draft.value) return
  // Le brouillon reste affiché jusqu'à la navigation ; `deleted` coupe l'enregistrement et le nettoyage en sortie.
  deleted = true
  await deleteWorkout(draft.value.id)
  deleteOpen.value = false
  toast.add({ title: 'Séance supprimée', color: 'neutral', icon: 'i-lucide-trash-2' })
  // La fermeture du dialog consomme son entrée d'historique : naviguer avant ramènerait ici.
  await nextTick()
  await afterOverlayBacks()
  await router.replace('/dashboard/seances')
}

async function saveAsTemplate() {
  if (!draft.value?.exercises.length) return
  try {
    await saveTemplate({
      label: title.value,
      exercises: draft.value.exercises.map(e => ({
        key: newKey(),
        exerciseId: e.exerciseId,
        label: e.label,
        group: e.group,
        metric: e.metric,
        sets: e.metric === 'CARDIO' ? 1 : Math.max(1, e.sets.length),
        target: e.metric === 'DURATION' ? e.sets[0]?.durationSec ?? null : e.metric === 'CARDIO' ? null : e.sets[0]?.reps ?? null,
      })),
      // Le programme garde les réglages du circuit, pas ce qui a été fait.
      circuits: draft.value.circuits.map(({ roundsDone: _done, ...c }) => ({ ...c, key: newKey(), items: c.items.map(({ reps: _reps, ...item }) => ({ ...item, key: newKey() })) })),
    })
    toast.add({ title: 'Programme créé', description: `« ${title.value} » se lance depuis Séances.`, color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    toast.add({ title: 'Programme non créé', description: (error as Error).message, color: 'error' })
  }
}

/** Une séance pas encore enregistrée n'a rien à supprimer : la croix suffit à l'abandonner. */
const canDelete = computed(() => !isNew.value || !!stored.value)
</script>

<template>
  <UDashboardPanel id="seance">
    <template #header>
      <UDashboardNavbar :title="title" :ui="{ title: 'truncate' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <p v-if="isDirty" class="hidden text-xs text-dimmed sm:block">
            Non enregistrée
          </p>
          <!-- Consultation : on passe en modification d'un clic. -->
          <UButton
            v-if="draft && readonly"
            label="Modifier"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            @click="startEditing"
          />
          <UButton
            v-else-if="draft && !live"
            label="Enregistrer"
            icon="i-lucide-check"
            :loading="saving"
            @click="saveAndClose"
          />
          <UButton
            v-else-if="draft"
            label="Enregistrer"
            icon="i-lucide-save"
            color="neutral"
            variant="outline"
            :disabled="!isDirty"
            :loading="saving && !finishing"
            @click="saveLive"
          />
          <!-- Actions secondaires en icônes, à portée directe (pas de menu). -->
          <UTooltip v-if="draft" text="Enregistrer comme programme">
            <UButton
              icon="i-lucide-list-plus"
              color="neutral"
              variant="ghost"
              :disabled="!hasContent"
              aria-label="Enregistrer comme programme"
              @click="saveAsTemplate"
            />
          </UTooltip>
          <UTooltip v-if="draft && canDelete" text="Supprimer la séance">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              aria-label="Supprimer la séance"
              @click="deleteOpen = true"
            />
          </UTooltip>
          <!-- Fermer, comme la croix des fiches ingrédient et recette ; la sortie demande confirmation s'il reste des modifications. -->
          <UButton
            :icon="appConfig.ui.icons.close"
            color="neutral"
            variant="ghost"
            to="/dashboard/seances"
            aria-label="Fermer la séance"
          />
        </template>
      </UDashboardNavbar>

      <!--
        En direct : chrono et repos restent visibles au défilement. Le chrono attend « Démarrer », qui devient
        « Terminer » une fois lancé, à portée de pouce.
      -->
      <div v-if="draft && live" class="flex items-center gap-4 border-b border-default bg-default px-4 py-2.5 sm:px-6">
        <div class="flex items-baseline gap-2">
          <span class="relative flex size-2 self-center" aria-hidden="true">
            <span v-if="started" class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
            <span class="relative inline-flex size-2 rounded-full" :class="started ? 'bg-primary' : 'bg-accented'" />
          </span>
          <p
            class="text-2xl font-bold tracking-tight tabular-nums"
            :class="started ? 'text-highlighted' : 'text-dimmed'"
            role="timer"
            aria-label="Durée de la séance"
          >
            {{ formatClock(elapsedSec) }}
          </p>
        </div>
        <p v-if="restSec !== null" class="flex items-baseline gap-1.5 border-l border-default ps-4 text-sm text-muted" role="timer">
          <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">Repos</span>
          <span class="font-semibold tabular-nums text-highlighted">{{ formatClock(restSec) }}</span>
        </p>
        <UButton
          v-if="started"
          label="Terminer"
          icon="i-lucide-flag"
          class="ms-auto"
          @click="finishOpen = true"
        />
        <UButton
          v-else
          label="Démarrer"
          icon="i-lucide-play"
          class="ms-auto"
          :loading="startingChrono"
          @click="startChrono"
        />
      </div>
    </template>

    <template #body>
      <UEmpty
        v-if="!draft"
        class="py-12"
        icon="i-lucide-dumbbell"
        title="Séance introuvable"
        description="Elle a peut-être été supprimée."
        :actions="[{ label: 'Voir les séances', icon: 'i-lucide-arrow-left', to: '/dashboard/seances' }]"
      />

      <div v-else class="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-24">
        <!--
          Relevé de la séance : une grille réglée, chaque chiffre avec son unité. Mobile : 2 × 2, la durée en haut à
          droite et la dépense dessous ; sm+ : 4 colonnes, date, durée, dépense, séries.
        -->
        <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-default bg-(--ui-border) sm:grid-cols-4">
          <div class="flex items-center justify-between gap-x-2 gap-y-1.5 bg-default p-3 sm:flex-col sm:items-stretch sm:justify-start sm:p-4">
            <dt class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
              <UIcon name="i-lucide-calendar" class="size-4 shrink-0" aria-hidden="true" />
              <span class="sr-only sm:not-sr-only">{{ live ? 'Début' : 'Date' }}</span>
            </dt>
            <dd class="flex min-h-10 items-center justify-end whitespace-nowrap sm:justify-start">
              <span v-if="live" class="text-sm text-highlighted">{{ startedLabel }}</span>
              <span v-else-if="readonly" class="text-sm text-highlighted">{{ readonlyDate }}</span>
              <!--
                La date s'affiche comme en consultation ; le champ natif, invisible par-dessus, ouvre le calendrier du
                téléphone (et `showPicker` celui du navigateur sur ordinateur).
              -->
              <label v-else class="relative cursor-pointer border-b border-dashed border-accented text-sm text-highlighted focus-within:border-solid focus-within:border-primary">
                {{ readonlyDate }}
                <input
                  v-model="dateInput"
                  type="date"
                  :max="todayIso"
                  class="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Date de la séance"
                  @click="($event.target as HTMLInputElement).showPicker?.()"
                >
              </label>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-x-2 gap-y-1.5 bg-default p-3 sm:flex-col sm:items-stretch sm:justify-start sm:p-4">
            <dt class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
              <UIcon name="i-lucide-timer" class="size-4 shrink-0" aria-hidden="true" />
              <span class="sr-only sm:not-sr-only">Durée</span>
            </dt>
            <dd class="flex min-h-10 items-center justify-end whitespace-nowrap sm:justify-start">
              <p v-if="live" class="flex items-baseline gap-1">
                <span class="text-lg font-bold tabular-nums" :class="started ? 'text-highlighted' : 'text-dimmed'">{{ started ? Math.floor(elapsedSec / 60) : '—' }}</span>
                <span v-if="started" class="text-xs text-muted">min</span>
              </p>
              <!-- Consultation, ou séance de cardio seulement (sa durée est celle de ses sorties, saisie dans leur bloc). -->
              <p v-else-if="readonly || isCardioOnly" class="flex items-baseline gap-1" title="Durée des sorties ci-dessous">
                <span class="text-lg font-bold tabular-nums" :class="shownDuration ? 'text-highlighted' : 'text-dimmed'">
                  {{ shownDuration ? formatMinutes(shownDuration) : '—' }}
                </span>
              </p>
              <p v-else class="flex items-baseline gap-1">
                <span class="w-12"><WorkoutNumberInput v-model="draft.durationMin" bare integer label="Durée en minutes" /></span>
                <span class="text-xs text-muted">min</span>
              </p>
            </dd>
          </div>
          <div class="order-4 sm:order-none flex items-center justify-between gap-x-2 gap-y-1.5 bg-default p-3 sm:flex-col sm:items-stretch sm:justify-start sm:p-4">
            <dt class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
              <UIcon name="i-lucide-zap" class="size-4 shrink-0" aria-hidden="true" />
              <span class="sr-only sm:not-sr-only">Dépensé</span>
            </dt>
            <dd class="flex min-h-10 items-center justify-end whitespace-nowrap sm:justify-start">
              <!-- En direct, les kcal se lisent sur la montre à la fin : elles se saisissent dans « Terminer ». -->
              <p v-if="live" class="flex items-baseline gap-1" title="À saisir en terminant la séance">
                <span class="text-lg font-bold tabular-nums" :class="draft.kcal !== null ? 'text-highlighted' : 'text-dimmed'">{{ draft.kcal ?? '—' }}</span>
                <span v-if="draft.kcal !== null" class="text-xs text-muted">kcal</span>
              </p>
              <p v-else-if="readonly" class="flex items-baseline gap-1">
                <span class="text-lg font-bold tabular-nums" :class="draft.kcal !== null ? 'text-highlighted' : 'text-dimmed'">{{ draft.kcal ?? '—' }}</span>
                <span v-if="draft.kcal !== null" class="text-xs text-muted">kcal</span>
              </p>
              <p v-else class="flex items-baseline gap-1">
                <span class="w-14"><WorkoutNumberInput v-model="draft.kcal" bare integer label="Kcal dépensées" /></span>
                <span class="text-xs text-muted">kcal</span>
              </p>
            </dd>
          </div>
          <div class="order-3 sm:order-none flex items-center justify-between gap-x-2 gap-y-1.5 bg-default p-3 sm:flex-col sm:items-stretch sm:justify-start sm:p-4">
            <dt class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
              <UIcon :name="volume ? 'i-lucide-weight' : stats?.distanceKm ? 'i-lucide-route' : !stats?.sets && draft.circuits.length ? 'i-lucide-repeat' : 'i-lucide-layers'" class="size-4 shrink-0" aria-hidden="true" />
              <span class="sr-only sm:not-sr-only">{{ volume ? 'Volume' : stats?.distanceKm ? 'Distance' : !stats?.sets && draft.circuits.length ? 'Tours' : 'Séries' }}</span>
            </dt>
            <dd class="flex min-h-10 items-center justify-end whitespace-nowrap sm:justify-start">
              <p class="flex items-baseline gap-1">
                <template v-if="volume">
                  <span class="text-lg font-bold tabular-nums text-highlighted">{{ volume.value }}</span>
                  <span class="text-xs text-muted">{{ volume.unit }}<span class="hidden sm:inline"> · {{ stats!.sets }} séries</span></span>
                </template>
                <template v-else-if="stats?.distanceKm">
                  <span class="text-lg font-bold tabular-nums text-highlighted">{{ formatDecimal(stats.distanceKm, 2) }}</span>
                  <span class="text-xs text-muted">km</span>
                </template>
                <template v-else-if="!stats?.sets && draft.circuits.length">
                  <span class="text-lg font-bold tabular-nums" :class="stats?.rounds ? 'text-highlighted' : 'text-dimmed'">{{ stats?.rounds || '—' }}</span>
                  <span v-if="stats?.rounds" class="text-xs text-muted">tour{{ stats.rounds > 1 ? 's' : '' }}</span>
                </template>
                <template v-else>
                  <span class="text-lg font-bold tabular-nums" :class="stats?.sets ? 'text-highlighted' : 'text-dimmed'">{{ stats?.sets || '—' }}</span>
                  <span v-if="stats?.sets" class="text-xs text-muted">{{ live ? 'validées' : 'séries' }}</span>
                </template>
              </p>
            </dd>
          </div>
        </dl>

        <UFormField v-if="!readonly" label="Nom de la séance">
          <UInput v-model="draft.label" :placeholder="workoutTitle({ label: '', exercises: draft.exercises, circuits: draft.circuits })" name="workout-label" type="search" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" spellcheck="false" data-form-type="other" data-lpignore="true" :ui="{ base: NAME_FIELD_BASE }" class="w-full" />
        </UFormField>

        <p v-if="readonly && !hasContent" class="rounded-xl border border-dashed border-default p-4 text-sm text-muted">
          Aucun exercice dans cette séance.
        </p>

        <!--
          Séance vide : trois tuiles identiques (même style, même poids visuel), aucune option mise en avant. Côte à côte
          à partir de lg, empilées en dessous.
        -->
        <section v-else-if="!hasContent" aria-labelledby="empty-title" class="flex flex-col gap-3">
          <h2 id="empty-title" class="text-sm font-medium text-highlighted">
            Ajouter à la séance
          </h2>
          <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <button
              v-for="choice in emptyChoices"
              :key="choice.title"
              type="button"
              class="flex cursor-pointer items-start gap-3 rounded-xl border border-default bg-default p-4 text-start transition-colors hover:border-primary/50 hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @click="choice.action"
            >
              <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-elevated text-highlighted" aria-hidden="true">
                <UIcon :name="choice.icon" class="size-5" />
              </span>
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="font-semibold text-highlighted">{{ choice.title }}</span>
                <span class="text-sm text-muted">{{ choice.description }}</span>
              </span>
            </button>
          </div>
        </section>

        <TransitionGroup
          v-if="draft.exercises.length"
          tag="div"
          class="flex flex-col gap-4"
          move-class="transition-transform duration-300 ease-out motion-reduce:transition-none"
        >
          <WorkoutExerciseBlock
            v-for="(exercise, index) in draft.exercises"
            :id="`exercise-${exercise.key}`"
            :key="exercise.key"
            class="scroll-mt-32"
            :exercise="exercise"
            :live="live"
            :readonly="readonly"
            :previous="previousFor(exercise)"
            :can-move-up="index > 0"
            :can-move-down="index < draft.exercises.length - 1"
            @update="updateExercise(index, $event)"
            @remove="removeExercise(index)"
            @move="moveExercise(index, $event)"
            @set-done="restStartedAt = Date.now()"
          />
        </TransitionGroup>

        <!-- Circuits (HIIT), après les exercices. -->
        <CircuitBlock
          v-for="circuit in draft.circuits"
          :key="circuit.key"
          :circuit="circuit"
          :live="live"
          :readonly="readonly"
          @update="updateCircuit(circuit.key, $event)"
          @remove="removeCircuit(circuit.key)"
          @add-exercises="openPicker(circuit.key)"
          @start-timer="openTimer(circuit.key)"
        />

        <!--
          Côte à côte, à égalité ; sur téléphone, icône au-dessus d'un libellé court pour tenir à trois (le libellé
          complet reste lu par les lecteurs d'écran).
        -->
        <div v-if="!readonly && hasContent" class="grid grid-cols-3 gap-2 sm:gap-3">
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="lg"
            block
            class="flex-col gap-1 px-1 sm:flex-row sm:gap-1.5 sm:px-3"
            aria-label="Ajouter des exercices"
            @click="openPicker()"
          >
            <span class="sm:hidden">Exercices</span>
            <span class="hidden sm:inline">Ajouter des exercices</span>
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="lg"
            block
            class="flex-col gap-1 px-1 sm:flex-row sm:gap-1.5 sm:px-3"
            aria-label="Ajouter un circuit"
            @click="addCircuit"
          >
            <span class="sm:hidden">Circuit</span>
            <span class="hidden sm:inline">Ajouter un circuit</span>
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="lg"
            block
            class="flex-col gap-1 px-1 sm:flex-row sm:gap-1.5 sm:px-3"
            aria-label="Ajouter un programme"
            @click="templatePickerOpen = true"
          >
            <span class="sm:hidden">Programme</span>
            <span class="hidden sm:inline">Ajouter un programme</span>
          </UButton>
        </div>

        <section v-if="readonly && draft.note.trim()" class="flex flex-col gap-1.5">
          <h2 class="text-sm font-medium text-highlighted">
            Note
          </h2>
          <p class="whitespace-pre-line text-sm text-muted">
            {{ draft.note }}
          </p>
        </section>
        <UFormField v-else-if="!readonly" label="Note">
          <UTextarea v-model="draft.note" :rows="2" autoresize placeholder="Sensations, réglages de machine, douleur…" class="w-full" />
        </UFormField>
      </div>

      <TemplatePickerModal v-model:open="templatePickerOpen" :templates="templates" @pick="addTemplate" />

      <ExercisePickerModal
        v-model:open="pickerOpen"
        :exercises="exercises"
        :hints="hints"
        :initial-kind="pickerKind"
        :title="pickerCircuitKey ? 'Exercices du circuit' : undefined"
        :is-owned="isOwned"
        @pick="addExercises"
        @create="openExerciseForm"
      />

      <!-- Un minuteur par circuit (`key`) : celui laissé en pause ne reprend pas sur un autre circuit. -->
      <CircuitTimer
        v-if="timerCircuit"
        :key="timerCircuit.key"
        v-model:open="timerOpen"
        :circuit="timerCircuit"
        @update="updateCircuit(timerCircuit.key, $event)"
        @discard="onTimerDiscard"
      />

      <ExerciseFormSlideover
        v-model:open="exerciseFormOpen"
        :initial-label="exerciseFormLabel"
        :initial-kind="pickerKind"
        :saving="exerciseSaving"
        @save="onCreateExercise"
      />

      <WorkoutFinishModal
        v-model:open="finishOpen"
        :elapsed-min="elapsedSec / 60"
        :kcal="draft?.kcal ?? null"
        :empty-sets="emptySets"
        :saving="finishing"
        @finish="finish"
      />

      <ConfirmDialog
        v-model:open="deleteOpen"
        title="Supprimer cette séance ?"
        description="Ses exercices et ses séries seront supprimés définitivement."
        confirm-label="Supprimer"
        confirm-color="error"
        confirm-icon="i-lucide-trash-2"
        @confirm="confirmDelete"
      />

      <ConfirmDialog
        v-model:open="leaveOpen"
        title="Quitter sans enregistrer ?"
        description="Les modifications de cette séance seront perdues."
        confirm-label="Quitter sans enregistrer"
        cancel-label="Rester"
        confirm-color="error"
        @confirm="confirmLeave"
      />
    </template>
  </UDashboardPanel>
</template>
