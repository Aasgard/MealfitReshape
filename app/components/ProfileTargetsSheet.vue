<script setup lang="ts">
import { format } from 'date-fns'
import type { DailyTargets } from '~/utils/dailyTargets'
import { parseNonNegativeNumber, parsePositiveNumber } from '~/utils/numberInput'

/**
 * Fiche « Besoins du jour » du profil : lue comme une étiquette nutritionnelle (kcal, puis G/P/L avec leur part des kcal).
 * Les valeurs viennent du calculateur (« Définir comme objectif ») ou d'une saisie manuelle, validée explicitement
 * puisqu'elles pilotent Aujourd'hui et les Menus.
 */
const profile = useProfile()
const toast = useToast()

type MacroKey = 'carbohydrates' | 'protein' | 'fat'

const MACROS: { key: MacroKey, label: string, kcalPerGram: number, dotClass: string, barClass: string }[] = [
  { key: 'carbohydrates', label: 'Glucides', kcalPerGram: 4, dotClass: 'bg-green-500', barClass: 'bg-green-500' },
  { key: 'protein', label: 'Protéines', kcalPerGram: 4, dotClass: 'bg-red-700', barClass: 'bg-red-700' },
  { key: 'fat', label: 'Lipides', kcalPerGram: 9, dotClass: 'bg-amber-500', barClass: 'bg-amber-500' },
]

const targets = computed(() => profile.targets)

// --- Chiffres animés : comptent depuis l'ancienne fiche quand elle vient d'être remplacée ---

const KEYS = ['calories', 'carbohydrates', 'protein', 'fat'] as const
const displayed = reactive<DailyTargets>({ calories: 0, carbohydrates: 0, protein: 0, fat: 0 })
const seenRevision = useState('profile-targets-seen-revision', () => 0)
const showDeltas = ref(false)
let frame = 0

/** Valeurs vers lesquelles l'affichage tend (fin de l'animation en cours). */
const shownTarget: DailyTargets = { calories: 0, carbohydrates: 0, protein: 0, fat: 0 }

function snap(to: DailyTargets) {
  for (const key of KEYS) displayed[key] = shownTarget[key] = to[key]
}

if (targets.value) snap(targets.value)

function tween(from: DailyTargets, to: DailyTargets) {
  cancelAnimationFrame(frame)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return snap(to)
  snap(from)
  for (const key of KEYS) shownTarget[key] = to[key]
  const start = performance.now() + 120
  const tick = (now: number) => {
    const t = Math.min(Math.max((now - start) / 650, 0), 1)
    const eased = 1 - (1 - t) ** 3
    for (const key of KEYS) displayed[key] = from[key] + (to[key] - from[key]) * eased
    if (t < 1) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

function present() {
  const current = targets.value
  if (!current) return
  const isNew = profile.targetsRevision > seenRevision.value
  seenRevision.value = profile.targetsRevision
  if (isNew && import.meta.client) {
    showDeltas.value = !!profile.previousTargets
    tween(profile.previousTargets ?? { calories: 0, carbohydrates: 0, protein: 0, fat: 0 }, current)
  }
  else {
    snap(current)
  }
}

onMounted(present)
watch(() => profile.targetsRevision, present)
// Fiche arrivée de Firestore (chargement, autre appareil) : affichée telle quelle. La confirmation d'une fiche définie
// ici a les mêmes valeurs que l'animation en cours, qu'elle n'interrompt donc pas.
watch(targets, (current) => {
  if (!current || KEYS.every(key => current[key] === shownTarget[key])) return
  showDeltas.value = false
  cancelAnimationFrame(frame)
  snap(current)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))

const deltas = computed(() => {
  const prev = profile.previousTargets
  const current = targets.value
  if (!showDeltas.value || !prev || !current) return null
  return Object.fromEntries(KEYS.map(key => [key, current[key] - prev[key]])) as Record<typeof KEYS[number], number>
})

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatNumber(Math.abs(n))}`

// --- Lecture ---

const sourceLabel = computed(() => {
  const t = targets.value
  if (!t) return ''
  const today = format(new Date(), 'yyyy-MM-dd')
  const when = t.updatedAt === today ? 'aujourd\'hui' : `le ${formatDay(t.updatedAt, 'd MMMM')}`
  return { profile: `Calculés depuis votre objectif ${when}`, calculator: `Définis depuis le calculateur ${when}`, manual: `Saisis à la main ${when}` }[t.source]
})

const SOURCE_ICONS: Record<ProfileTargets['source'], string> = {
  profile: 'i-lucide-target',
  calculator: 'i-lucide-calculator',
  manual: 'i-lucide-pencil',
}

/** Besoins tirés de l'objectif : on les recalcule ici, à partir de l'objectif enregistré et de la fiche actuelle. */
function recalculate() {
  profile.saveGoal().saved.catch((error: any) => {
    toast.add({
      title: 'Erreur',
      description: `Les besoins du jour n'ont pas pu être enregistrés : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  })
}

function kcalShare(key: MacroKey, values: DailyTargets) {
  const macro = MACROS.find(m => m.key === key)!
  return values.calories > 0 ? (values[key] * macro.kcalPerGram) / values.calories : 0
}

/** Rapporté au même poids que l'objectif (actuel ou visé), pour retrouver les g/kg choisis. */
const proteinPerKg = computed(() => {
  const weight = proteinBasisWeightKg(profile.goal, profile.currentWeightKg)
  return targets.value && weight ? targets.value.protein / weight : null
})

function coherence(values: DailyTargets) {
  const fromMacros = macroKcal(values)
  const gap = fromMacros - values.calories
  const ok = values.calories > 0 && Math.abs(gap) <= values.calories * MACRO_KCAL_TOLERANCE
  return { fromMacros, gap, ok }
}

const readCoherence = computed(() => (targets.value ? coherence(targets.value) : null))

/** Répartition fixe (celle de l'accueil, voir `MEAL_KCAL_SHARES`) en attendant qu'elle vienne des réglages. */
const mealSplit = computed(() => {
  const t = targets.value
  if (!t) return []
  return MEAL_KCAL_SHARES.map(({ mealType, label, share }) => ({
    key: mealType,
    label,
    share: Math.round(share * 100),
    kcal: Math.round(t.calories * share),
  }))
})

// --- Édition manuelle ---

const editing = ref(false)
const draft = reactive({ calories: '', carbohydrates: '', protein: '', fat: '' })
const submitted = ref(false)

function startEdit() {
  const t = targets.value
  draft.calories = t ? String(t.calories) : ''
  draft.carbohydrates = t ? String(t.carbohydrates) : ''
  draft.protein = t ? String(t.protein) : ''
  draft.fat = t ? String(t.fat) : ''
  submitted.value = false
  editing.value = true
  nextTick(() => document.getElementById('target-calories')?.focus())
}

const parsedDraft = computed(() => ({
  calories: parsePositiveNumber(draft.calories),
  carbohydrates: parseNonNegativeNumber(draft.carbohydrates),
  protein: parseNonNegativeNumber(draft.protein),
  fat: parseNonNegativeNumber(draft.fat),
}))

const draftErrors = computed(() => {
  const errors: Partial<Record<typeof KEYS[number], string>> = {}
  for (const key of KEYS) {
    if (parsedDraft.value[key] !== null) continue
    errors[key] = draft[key].trim() ? 'Nombre invalide' : 'Requis'
  }
  return errors
})

const draftValues = computed<DailyTargets | null>(() => {
  const p = parsedDraft.value
  if (p.calories === null || p.carbohydrates === null || p.protein === null || p.fat === null) return null
  return p as DailyTargets
})

const draftCoherence = computed(() => (draftValues.value ? coherence(draftValues.value) : null))

function fitCarbs() {
  const p = parsedDraft.value
  if (p.calories === null || p.protein === null || p.fat === null) return
  draft.carbohydrates = String(Math.max(0, Math.round((p.calories - p.protein * 4 - p.fat * 9) / 4)))
}

function stopEdit() {
  editing.value = false
  nextTick(() => document.getElementById('targets-edit')?.focus())
}

function save() {
  submitted.value = true
  if (!draftValues.value) return
  profile.setTargets(draftValues.value, 'manual').catch((error: any) => {
    toast.add({
      title: 'Erreur',
      description: `Les besoins du jour n'ont pas pu être enregistrés : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  })
  stopEdit()
}

const KCAL_FIELD = { key: 'calories' as const, label: 'Énergie', unit: 'kcal' }
</script>

<template>
  <section aria-labelledby="targets-title" class="flex flex-col rounded-xl border border-default bg-default">
    <header class="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 id="targets-title" class="text-lg font-bold tracking-tight text-highlighted">
          Besoins du jour
        </h2>
        <p v-if="targets && !editing" class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon :name="SOURCE_ICONS[targets.source]" class="size-3.5 shrink-0" />
          {{ sourceLabel }}
        </p>
        <p v-else-if="editing" class="text-xs text-muted">
          Ces valeurs servent d'objectif pour chaque journée.
        </p>
      </div>
      <UButton
        v-if="targets && !editing"
        id="targets-edit"
        label="Modifier"
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="sm"
        @click="startEdit"
      />
    </header>

    <!-- Lecture : étiquette nutritionnelle -->
    <template v-if="targets && !editing">
      <div class="flex flex-wrap items-baseline gap-x-2 px-4 pt-4 pb-5 sm:px-5">
        <span class="text-5xl font-bold tracking-tight tabular-nums text-highlighted">{{ formatNumber(displayed.calories) }}</span>
        <span class="text-sm text-muted">kcal par jour</span>
        <span v-if="deltas && deltas.calories !== 0" class="text-sm font-semibold tabular-nums text-primary">
          {{ signed(deltas.calories) }}
        </span>
      </div>

      <div class="grid grid-cols-[minmax(0,1fr)_auto_3.5rem] gap-x-4 border-y border-default px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dimmed sm:px-5">
        <span>Macros</span>
        <span class="text-end">Quantité</span>
        <span class="text-end">% kcal</span>
      </div>

      <ul class="flex flex-col divide-y divide-default">
        <li v-for="macro in MACROS" :key="macro.key" class="flex flex-col gap-2 px-4 py-3 sm:px-5">
          <div class="grid grid-cols-[minmax(0,1fr)_auto_3.5rem] items-baseline gap-x-4">
            <span class="flex min-w-0 items-center gap-2 text-sm text-highlighted">
              <span class="size-2 shrink-0 rounded-full" :class="macro.dotClass" />
              {{ macro.label }}
              <span v-if="macro.key === 'protein' && proteinPerKg" class="truncate text-xs text-dimmed tabular-nums">
                {{ formatNumber(proteinPerKg, 1) }} g/kg
              </span>
            </span>
            <span class="text-end text-sm tabular-nums">
              <span v-if="deltas && deltas[macro.key] !== 0" class="me-1.5 text-xs font-semibold text-primary">{{ signed(deltas[macro.key]) }}</span>
              <span class="font-semibold text-highlighted">{{ formatNumber(displayed[macro.key]) }}</span>
              <span class="text-muted"> g</span>
            </span>
            <span class="text-end text-sm tabular-nums text-muted">{{ Math.round(kcalShare(macro.key, targets) * 100) }} %</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-accented" aria-hidden="true">
            <div
              class="h-full rounded-full transition-[width] duration-500 ease-out"
              :class="macro.barClass"
              :style="{ width: `${Math.min(kcalShare(macro.key, displayed) * 100, 100)}%` }"
            />
          </div>
        </li>
      </ul>

      <p
        v-if="readCoherence"
        class="flex items-start gap-1.5 border-t border-default px-4 py-3 text-xs sm:px-5"
        :class="readCoherence.ok ? 'text-muted' : 'text-warning'"
      >
        <UIcon :name="readCoherence.ok ? 'i-lucide-check' : 'i-lucide-triangle-alert'" class="mt-px size-3.5 shrink-0" />
        <span>
          Les macros apportent <span class="font-semibold tabular-nums">{{ formatNumber(readCoherence.fromMacros) }} kcal</span>
          <template v-if="readCoherence.ok">, en accord avec l'objectif.</template>
          <template v-else>, soit {{ signed(readCoherence.gap) }} kcal par rapport à l'objectif.</template>
        </span>
      </p>

      <div class="flex flex-col gap-3 border-t border-default px-4 py-4 sm:px-5">
        <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
          Par repas
        </p>
        <ul class="grid gap-px overflow-hidden rounded-lg border border-default bg-border" :class="mealSplit.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'">
          <li v-for="meal in mealSplit" :key="meal.key" class="flex flex-col gap-0.5 bg-default px-3 py-2.5">
            <span class="truncate text-xs text-muted">{{ meal.label }}</span>
            <span class="flex items-baseline gap-1">
              <span class="text-base font-semibold tabular-nums text-highlighted">{{ formatNumber(meal.kcal) }}</span>
              <span class="text-xs text-dimmed">kcal</span>
            </span>
            <span class="text-xs tabular-nums text-dimmed">{{ meal.share }} %</span>
          </li>
        </ul>
      </div>

      <div
        v-if="profile.targetsStale"
        class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-default bg-elevated/50 px-4 py-3 sm:px-5"
      >
        <p class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon name="i-lucide-refresh-cw" class="size-3.5 shrink-0" />
          Votre fiche a changé depuis ce calcul.
        </p>
        <UButton
          v-if="targets.source === 'profile'"
          label="Recalculer"
          color="primary"
          variant="link"
          size="xs"
          icon="i-lucide-refresh-cw"
          class="-me-2"
          @click="recalculate"
        />
        <UButton
          v-else
          to="/dashboard/besoins-journaliers"
          label="Recalculer"
          color="primary"
          variant="link"
          size="xs"
          trailing-icon="i-lucide-arrow-right"
          class="-me-2"
        />
      </div>
      <div v-else class="flex justify-end border-t border-default px-4 py-2.5 sm:px-5">
        <UButton
          to="/dashboard/besoins-journaliers"
          label="Recalculer dans le calculateur"
          icon="i-lucide-calculator"
          color="neutral"
          variant="ghost"
          size="xs"
          class="-me-2"
        />
      </div>
    </template>

    <!-- Édition -->
    <form v-else-if="editing" class="flex flex-col" novalidate @submit.prevent="save">
      <div class="mt-3 border-t border-default">
        <SettingRow :label="KCAL_FIELD.label" for="target-calories" :error="submitted ? draftErrors.calories : undefined">
          <UInput
            id="target-calories"
            v-model="draft.calories"
            inputmode="numeric"
            placeholder="2000"
            class="w-32"
            :ui="{ base: 'text-end tabular-nums pe-12', trailing: 'pe-3' }"
          >
            <template #trailing>
              <span class="text-xs text-dimmed">kcal</span>
            </template>
          </UInput>
        </SettingRow>
        <div class="divide-y divide-default border-t border-default">
          <SettingRow
            v-for="macro in MACROS"
            :key="macro.key"
            :label="macro.label"
            :for="`target-${macro.key}`"
            :error="submitted ? draftErrors[macro.key] : undefined"
          >
            <UInput
              :id="`target-${macro.key}`"
              v-model="draft[macro.key]"
              inputmode="numeric"
              placeholder="0"
              class="w-32"
              :ui="{ base: 'text-end tabular-nums pe-8', trailing: 'pe-3' }"
            >
              <template #trailing>
                <span class="text-xs text-dimmed">g</span>
              </template>
            </UInput>
          </SettingRow>
        </div>
      </div>

      <div
        v-if="draftCoherence"
        class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-default px-4 py-3 text-xs sm:px-5"
        :class="draftCoherence.ok ? 'text-muted' : 'text-warning'"
      >
        <p class="flex items-center gap-1.5">
          <UIcon :name="draftCoherence.ok ? 'i-lucide-check' : 'i-lucide-triangle-alert'" class="size-3.5 shrink-0" />
          <span>
            Macros : <span class="font-semibold tabular-nums">{{ formatNumber(draftCoherence.fromMacros) }} kcal</span>
            <template v-if="!draftCoherence.ok"> ({{ signed(draftCoherence.gap) }})</template>
          </span>
        </p>
        <UButton
          v-if="!draftCoherence.ok"
          label="Ajuster les glucides"
          color="neutral"
          variant="outline"
          size="xs"
          @click="fitCarbs"
        />
      </div>

      <div class="flex justify-end gap-2 border-t border-default px-4 py-3 sm:px-5">
        <UButton label="Annuler" color="neutral" variant="ghost" @click="stopEdit" />
        <UButton type="submit" label="Valider" icon="i-lucide-check" />
      </div>
    </form>

    <!-- Aucun besoin défini -->
    <div v-else class="flex flex-col gap-2 px-4 pt-3 pb-5 sm:px-5">
      <p class="max-w-prose text-sm text-muted text-pretty">
        Aucun besoin défini. Ils sont calculés à l'enregistrement de votre objectif, à partir de votre fiche corporelle.
      </p>
      <p v-if="!profile.isBodyComplete" class="text-xs text-dimmed">
        Complétez d'abord la fiche : date de naissance, taille et poids.
      </p>
    </div>
  </section>
</template>
