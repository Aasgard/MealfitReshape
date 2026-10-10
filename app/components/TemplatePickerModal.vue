<script setup lang="ts">
import type { WorkoutTemplate } from '~/types/workout'

/** Choix d'un programme à ajouter à une séance : ses exercices et ses circuits viennent s'ajouter à ceux déjà là. */
defineProps<{
  templates: WorkoutTemplate[]
}>()

const emit = defineEmits<{
  pick: [template: WorkoutTemplate]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const summary = (template: WorkoutTemplate) =>
  [...template.exercises.map(e => e.label), ...(template.circuits ?? []).map(circuitSummary)].join(' · ')

function pick(template: WorkoutTemplate) {
  emit('pick', template)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" title="Ajouter un programme" :ui="{ content: 'sm:max-w-lg', body: 'p-0 sm:p-0' }">
    <template #body>
      <div v-if="!templates.length" class="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p class="text-sm text-muted">
          Aucun programme pour l'instant.
        </p>
        <UButton label="Créer un programme" icon="i-lucide-plus" variant="outline" to="/dashboard/programmes" />
      </div>
      <ul v-else class="divide-y divide-default">
        <li v-for="template in templates" :key="template.id">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-6"
            @click="pick(template)"
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated text-highlighted" aria-hidden="true">
              <UIcon name="i-lucide-list-checks" class="size-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold text-highlighted">{{ template.label }}</span>
              <span class="block truncate text-xs text-muted">{{ summary(template) || 'Programme vide' }}</span>
            </span>
            <UIcon name="i-lucide-plus" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </template>
  </UModal>
</template>
