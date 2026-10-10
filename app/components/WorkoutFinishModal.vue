<script setup lang="ts">
/**
 * Fin d'une séance en direct : durée (le chrono, corrigeable), kcal dépensées lues sur la montre, et ce qui sera
 * retiré (séries laissées vides).
 */
const props = defineProps<{
  elapsedMin: number
  /** Kcal déjà connues de la séance, reprises dans la case. */
  kcal?: number | null
  /** Séries laissées vides : elles ne seront pas gardées. */
  emptySets: number
  saving?: boolean
}>()

const emit = defineEmits<{
  finish: [value: { durationMin: number | null, kcal: number | null }]
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const durationMin = ref<number | null>(null)
const kcal = ref<number | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  durationMin.value = Math.max(1, Math.round(props.elapsedMin))
  kcal.value = props.kcal ?? null
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Terminer la séance"
    description="Les kcal se lisent sur votre montre ou dans Strava ; vous pourrez les ajouter plus tard."
    :dismissible="!saving"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-default bg-(--ui-border)">
          <label class="flex flex-col gap-1.5 bg-default p-3">
            <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">Durée</span>
            <WorkoutNumberInput v-model="durationMin" unit="min" integer label="Durée de la séance en minutes" />
          </label>
          <label class="flex flex-col gap-1.5 bg-default p-3">
            <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">Dépensé</span>
            <WorkoutNumberInput v-model="kcal" unit="kcal" integer label="Kcal dépensées" />
          </label>
        </div>
        <p v-if="emptySets" class="flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {{ emptySets }} série{{ emptySets > 1 ? 's' : '' }} vide{{ emptySets > 1 ? 's' : '' }} ne {{ emptySets > 1 ? 'seront' : 'sera' }} pas gardée{{ emptySets > 1 ? 's' : '' }}.
        </p>
      </div>
    </template>

    <template #footer>
      <UButton label="Continuer la séance" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton
        label="Terminer"
        icon="i-lucide-flag"
        :loading="saving"
        @click="emit('finish', { durationMin, kcal })"
      />
    </template>
  </UModal>
</template>
