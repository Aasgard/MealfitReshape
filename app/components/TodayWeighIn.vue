<script setup lang="ts">
const emit = defineEmits<{
  save: [weightKg: number]
}>()

/** Saisie en cours, gardée par la page : elle survit à un changement de jour et revient après un échec d'écriture. */
const draft = defineModel<string>({ default: '' })

const inputId = useId()
const errorId = useId()
const submitted = ref(false)

const weightValue = computed(() => parsePositiveNumber(draft.value))
const error = computed(() => (submitted.value ? weightInputError(weightValue.value) : undefined))

function onSubmit() {
  submitted.value = true
  if (error.value) return
  emit('save', roundWeight(weightValue.value!))
}
</script>

<template>
  <!-- Mobile : titre et lien sur une ligne, saisie pleine largeur dessous ; sm+ : une seule ligne. -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-default bg-default py-3 pr-2.5 pl-4 sm:pl-5">
    <label :for="inputId" class="flex-1 text-xs font-semibold uppercase tracking-wide text-dimmed">
      Pesée
    </label>

    <UTooltip text="Voir le suivi du poids">
      <UButton
        to="/dashboard/suivi-poids"
        icon="i-lucide-chart-line"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Voir le suivi du poids"
        class="sm:order-last"
      />
    </UTooltip>

    <form class="flex w-full items-start gap-2 pr-1.5 sm:w-auto sm:pr-0" novalidate @submit.prevent="onSubmit">
      <div class="min-w-0 flex-1 sm:w-36 sm:flex-none">
        <UInput
          :id="inputId"
          v-model="draft"
          inputmode="decimal"
          autocomplete="off"
          enterkeyhint="done"
          placeholder="78,4"
          :color="error ? 'error' : 'neutral'"
          :highlight="!!error"
          :aria-invalid="!!error"
          :aria-describedby="error ? errorId : undefined"
          class="w-full"
          :ui="{ base: 'font-semibold tabular-nums', trailing: 'pointer-events-none' }"
        >
          <template #trailing>
            <span class="text-sm text-muted">kg</span>
          </template>
        </UInput>
      </div>
      <UButton type="submit" icon="i-lucide-check" aria-label="Enregistrer la pesée" class="shrink-0" />
    </form>

    <p v-if="error" :id="errorId" class="order-last w-full text-xs text-error" role="alert">
      {{ error }}
    </p>
  </div>
</template>
