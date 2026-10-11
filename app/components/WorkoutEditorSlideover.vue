<script setup lang="ts">
import type WorkoutEditor from './WorkoutEditor.vue'

/**
 * L'éditeur de séance en panneau latéral, ouvert depuis le journal : démarrer maintenant, saisir une séance passée,
 * reprendre la séance en cours, modifier une séance. Le fermer avec des modifications (croix, clic à côté, Échap,
 * geste retour) passe par la confirmation de l'éditeur.
 */
const props = withDefaults(defineProps<{
  /** Id de la séance, ou `NEW_WORKOUT_ROUTE_ID` ; `null` = rien à afficher. */
  workoutId: string | null
  editing?: boolean
}>(), {
  editing: false,
})

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const editor = ref<InstanceType<typeof WorkoutEditor> | null>(null)
/** Fermeture voulue par l'éditeur (enregistrée, terminée, supprimée, ou confirmée) : on ne la retient pas. */
let closing = false

/** Fermé par le geste retour avec des modifications : on rouvre, et l'éditeur demande confirmation. */
watch(open, (isOpen) => {
  if (!isOpen && !closing && editor.value?.isDirty) {
    open.value = true
    void editor.value.requestClose()
  }
  closing = false
})

function onClose() {
  closing = true
  open.value = false
}

/** Croix du panneau, clic à côté, Échap : l'éditeur décide (confirmation s'il y a des modifications). */
const requestClose = () => {
  if (editor.value) void editor.value.requestClose()
  else onClose()
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :dismissible="false"
    :ui="{ content: 'sm:max-w-2xl' }"
    @close:prevent="requestClose"
  >
    <template #content>
      <div class="flex h-full min-h-0 flex-col">
        <Suspense>
          <WorkoutEditor
            v-if="props.workoutId"
            :key="props.workoutId"
            ref="editor"
            :workout-id="props.workoutId"
            :editing="props.editing"
            layout="modal"
            @close="onClose"
          />
          <template #fallback>
            <div class="flex flex-1 items-center justify-center p-6">
              <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-dimmed" aria-label="Chargement" />
            </div>
          </template>
        </Suspense>
      </div>
    </template>
  </USlideover>
</template>
