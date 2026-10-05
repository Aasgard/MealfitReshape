<script setup lang="ts">
import { getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'
import { addDays, addWeeks, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import type { Meal } from '~/types/meal'
import { mealsOfWeek } from '~/utils/menuEntries'
import { DAYS_PER_WEEK, formatWeekLabel, WEEK_STARTS_ON, weekId } from '~/utils/menuWeek'

const props = defineProps<{
  /** Semaine dans laquelle les repas sont recopiés (la semaine affichée). */
  targetWeekStart: Date
  /** Repas déjà présents dans cette semaine : ils seront remplacés. */
  targetMealCount: number
}>()

const emit = defineEmits<{
  /** Repas de la semaine source (lundi `sourceWeekStart`) à recopier dans la semaine cible. */
  copy: [sourceWeekStart: Date, meals: Meal[]]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

/** Semaine source, la précédente à chaque ouverture. */
const sourceWeekStart = ref(subWeeks(props.targetWeekStart, 1))
watch(open, (isOpen) => {
  if (isOpen) sourceWeekStart.value = subWeeks(props.targetWeekStart, 1)
})

const isTargetWeek = computed(() => isSameWeek(sourceWeekStart.value, props.targetWeekStart, { weekStartsOn: WEEK_STARTS_ON }))

/** Saute la semaine cible : on ne copie pas une semaine sur elle-même. */
const shiftSource = (delta: 1 | -1) => {
  const next = addWeeks(sourceWeekStart.value, delta)
  sourceWeekStart.value = isSameWeek(next, props.targetWeekStart, { weekStartsOn: WEEK_STARTS_ON }) ? addWeeks(next, delta) : next
}

const pickerOpen = ref(false)
const pickedDate = computed({
  get: () => parseDate(weekId(sourceWeekStart.value)),
  set: (value: DateValue | undefined) => {
    if (!value) return
    pickerOpen.value = false
    sourceWeekStart.value = startOfWeek(value.toDate(getLocalTimeZone()), { weekStartsOn: WEEK_STARTS_ON })
  },
})

const weekLabel = (start: Date) => formatWeekLabel(start, addDays(start, DAYS_PER_WEEK - 1))

/** Repas de la semaine source, lus seulement pendant que la fenêtre est ouverte. */
const sourceMeals = useMealsBetween(() => open.value
  ? { start: sourceWeekStart.value, end: addDays(sourceWeekStart.value, DAYS_PER_WEEK - 1) }
  : null)
/** Filtre sur la semaine source : pendant le chargement d'une autre semaine, les repas précédents restent en mémoire. */
const meals = computed(() => mealsOfWeek(sourceMeals.value, sourceWeekStart.value))
const isLoading = computed(() => sourceMeals.pending.value)

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
const sourceSummary = computed(() => {
  if (isLoading.value) return 'Chargement des repas…'
  if (!meals.value.length) return 'Aucun repas cette semaine-là'
  const days = new Set(meals.value.map(meal => meal.date.toDate().toDateString())).size
  return `${meals.value.length} repas sur ${plural(days, 'jour')}`
})

const replaceWarning = computed(() => props.targetMealCount === 1
  ? `Le repas de la semaine du ${weekLabel(props.targetWeekStart)} sera remplacé.`
  : `Les ${props.targetMealCount} repas de la semaine du ${weekLabel(props.targetWeekStart)} seront remplacés.`)

const canCopy = computed(() => !isLoading.value && !isTargetWeek.value && meals.value.length > 0)

function onCopy() {
  if (!canCopy.value) return
  emit('copy', sourceWeekStart.value, meals.value)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Copier une semaine"
    :description="`Les repas de la semaine choisie sont recopiés jour pour jour dans celle du ${weekLabel(targetWeekStart)}.`"
    :ui="{ content: 'sm:max-w-md', footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
            Semaine à copier
          </p>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="outline"
              size="sm"
              square
              aria-label="Semaine précédente"
              @click="shiftSource(-1)"
            />
            <UPopover v-model:open="pickerOpen">
              <UButton
                :label="weekLabel(sourceWeekStart)"
                trailing-icon="i-lucide-chevron-down"
                color="neutral"
                variant="outline"
                size="sm"
                class="flex-1 justify-between tabular-nums"
                aria-label="Choisir la semaine à copier"
              />
              <template #content>
                <UCalendar v-model="pickedDate" :week-starts-on="1" class="p-2" />
              </template>
            </UPopover>
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="outline"
              size="sm"
              square
              aria-label="Semaine suivante"
              @click="shiftSource(1)"
            />
          </div>
          <p class="text-sm" :class="meals.length && !isLoading ? 'text-highlighted' : 'text-muted'" aria-live="polite">
            <template v-if="isTargetWeek">
              C'est la semaine affichée : choisissez-en une autre.
            </template>
            <template v-else>
              {{ sourceSummary }}
            </template>
          </p>
        </div>

        <UAlert
          v-if="targetMealCount"
          color="warning"
          variant="subtle"
          icon="i-lucide-replace"
          :title="replaceWarning"
        />
      </div>
    </template>

    <template #footer>
      <UButton
        label="Annuler"
        color="neutral"
        variant="ghost"
        @click="open = false"
      />
      <UButton
        :label="targetMealCount ? 'Remplacer' : 'Copier'"
        icon="i-lucide-copy"
        :color="targetMealCount ? 'warning' : 'primary'"
        :disabled="!canCopy"
        @click="onCopy"
      />
    </template>
  </UModal>
</template>
