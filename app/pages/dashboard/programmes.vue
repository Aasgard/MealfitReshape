<script setup lang="ts">
import { differenceInCalendarDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { WorkoutTemplate } from '~/types/workout'
import type { WorkoutTemplateInput } from '~/composables/useWorkoutTemplates'

/** Programmes (séances-types) : les créer, les modifier, et en lancer un en séance en direct. */
useSeoMeta({
  title: 'Dashboard - Programmes - Mealfit',
  description: 'Dashboard - Programmes - Mealfit',
})

const toast = useToast()

const workoutsApi = useWorkouts()
const { workouts, error, promise: workoutsLoaded } = workoutsApi
const { templates, error: templatesError, promise: templatesLoaded, saveTemplate, deleteTemplate } = useWorkoutTemplates()
const { exercises, isOwned, promise: exercisesLoaded } = useExercises()
const { starting, launch } = useStartWorkout(workoutsApi)

watch([error, templatesError], ([e1, e2]) => {
  const e = e1 ?? e2
  if (e) toast.add({ title: 'Erreur', description: `Impossible de charger les programmes : ${e.message}`, color: 'error' })
})

await Promise.all([
  workoutsLoaded.value.catch(() => undefined),
  templatesLoaded.value.catch(() => undefined),
  exercisesLoaded.value,
])

/** Dernière fois de chaque exercice, rappelée dans l'éditeur. */
const hints = computed(() => {
  const map = new Map<string, string>()
  for (const exercise of exercises.value) {
    const last = lastPerformance(workouts.value, exercise.id)
    if (last) map.set(exercise.id, exercise.metric === 'CARDIO' ? formatCardio(last.exercise) : formatSets(last.exercise.sets, exercise.metric))
  }
  return map
})

const today = new Date()
function relativeDay(date: Date) {
  const offset = differenceInCalendarDays(today, date)
  if (offset === 0) return 'aujourd\'hui'
  if (offset === 1) return 'hier'
  if (offset < 7) return `il y a ${offset} jours`
  return `le ${format(date, 'd MMM', { locale: fr })}`
}

/** Dernière séance faite avec ce programme. */
const lastRun = (template: WorkoutTemplate) => {
  const run = workouts.value.find(w => w.templateId === template.id && w.status === 'DONE')
  return run ? relativeDay(run.date.toDate()) : null
}

/** Exercices du programme, puis ses circuits (« HIIT · 5 exos · 4 tours »). */
const templateSummary = (template: WorkoutTemplate) =>
  [...template.exercises.map(e => e.label), ...(template.circuits ?? []).map(circuitSummary)].join(' · ')

// --- Création, modification ---

const formOpen = ref(false)
const editing = ref<WorkoutTemplate | null>(null)
const saving = ref(false)

function openForm(template: WorkoutTemplate | null = null) {
  editing.value = template
  formOpen.value = true
}

async function onSave(input: WorkoutTemplateInput) {
  saving.value = true
  try {
    await saveTemplate(input, editing.value?.id)
    formOpen.value = false
    toast.add({ title: editing.value ? 'Programme modifié' : 'Programme créé', description: input.label, color: 'success', icon: 'i-lucide-check' })
  }
  catch (e) {
    toast.add({ title: 'Programme non enregistré', description: (e as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// --- Suppression ---

const deleting = ref<WorkoutTemplate | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)

function askDelete(template: WorkoutTemplate) {
  deleting.value = template
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deleting.value) return
  deleteBusy.value = true
  try {
    await deleteTemplate(deleting.value.id)
    deleteOpen.value = false
    toast.add({ title: 'Programme supprimé', color: 'neutral', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    toast.add({ title: 'Programme non supprimé', description: (e as Error).message, color: 'error' })
  }
  finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="programmes">
    <template #header>
      <UDashboardNavbar title="Programmes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" aria-label="Nouveau programme" @click="openForm()">
            <span class="hidden sm:inline">Nouveau programme</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div
          v-if="!templates.length"
          class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-default px-6 py-12 text-center"
        >
          <UIcon name="i-lucide-list-checks" class="size-6 text-dimmed" aria-hidden="true" />
          <p class="text-sm font-semibold text-highlighted">
            Aucun programme pour l'instant
          </p>
          <p class="max-w-sm text-sm text-muted">
            Un programme est une séance-type (« Push », « Jambes »…). Lancé, il reprend vos charges de la dernière fois.
          </p>
          <UButton label="Créer un programme" icon="i-lucide-plus" class="mt-1" @click="openForm()" />
        </div>

        <ul v-else class="divide-y divide-default overflow-hidden rounded-xl border border-default bg-default">
          <li v-for="template in templates" :key="template.id" class="flex items-center gap-1 transition-colors hover:bg-elevated/50">
            <!-- La ligne ouvre l'éditeur ; « Lancer » démarre une séance en direct. -->
            <button
              type="button"
              class="min-w-0 flex-1 cursor-pointer py-3 ps-4 pe-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:ps-5"
              @click="openForm(template)"
            >
              <p class="truncate font-semibold text-highlighted">
                {{ template.label }}
              </p>
              <p class="truncate text-xs text-dimmed">
                <span class="tabular-nums">{{ template.exercises.length }} exercice{{ template.exercises.length > 1 ? 's' : '' }}</span>
                <template v-if="template.circuits?.length">
                  · <span class="tabular-nums">{{ template.circuits.length }} circuit{{ template.circuits.length > 1 ? 's' : '' }}</span>
                </template>
                <template v-if="lastRun(template)">
                  · fait {{ lastRun(template) }}
                </template>
              </p>
              <p class="mt-0.5 truncate text-xs text-muted" :title="templateSummary(template)">
                {{ templateSummary(template) }}
              </p>
            </button>
            <div class="flex shrink-0 items-center gap-1 pe-2 sm:pe-3">
              <UButton
                label="Lancer"
                icon="i-lucide-play"
                size="sm"
                variant="soft"
                :disabled="starting"
                @click="launch(template)"
              />
              <UTooltip text="Modifier">
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Modifier ${template.label}`"
                  @click="openForm(template)"
                />
              </UTooltip>
              <UTooltip text="Supprimer">
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Supprimer ${template.label}`"
                  @click="askDelete(template)"
                />
              </UTooltip>
            </div>
          </li>
        </ul>
      </div>

      <WorkoutTemplateSlideover
        v-model:open="formOpen"
        :template="editing"
        :exercises="exercises"
        :hints="hints"
        :is-owned="isOwned"
        :saving="saving"
        @save="onSave"
      />

      <ConfirmDialog
        v-model:open="deleteOpen"
        :title="deleting ? `Supprimer « ${deleting.label} » ?` : 'Supprimer le programme ?'"
        description="Les séances déjà faites avec ce programme sont conservées."
        confirm-label="Supprimer"
        confirm-color="error"
        confirm-icon="i-lucide-trash-2"
        :loading="deleteBusy"
        @confirm="confirmDelete"
      />
    </template>
  </UDashboardPanel>
</template>
