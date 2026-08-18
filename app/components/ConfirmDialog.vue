<script setup lang="ts">
/**
 * Dialog de confirmation générique (oui / non).
 *
 * Le dialog se ferme seul à l'annulation, mais **reste ouvert après `confirm`** :
 * c'est au parent de le fermer une fois son action terminée, ce qui permet
 * d'afficher `loading` pendant un traitement asynchrone.
 */
type ConfirmColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

withDefaults(defineProps<{
  /** Question posée à l'utilisateur, affichée en titre. */
  title: string
  /** Précision sur les conséquences de l'action. */
  description?: string
  /** Libellé du bouton de validation. */
  confirmLabel?: string
  /** Libellé du bouton d'annulation. */
  cancelLabel?: string
  /** Couleur du bouton de validation : `error` pour une action destructive. */
  confirmColor?: ConfirmColor
  /** Icône du bouton de validation. */
  confirmIcon?: string
  /** Verrouille le dialog et affiche un spinner sur le bouton de validation. */
  loading?: boolean
}>(), {
  confirmLabel: 'Confirmer',
  cancelLabel: 'Annuler',
  confirmColor: 'primary',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const open = defineModel<boolean>('open', { default: false })

/** Évite d'émettre `cancel` quand la fermeture fait suite à une confirmation. */
let confirmed = false

watch(open, (isOpen) => {
  if (isOpen) confirmed = false
  else if (!confirmed) emit('cancel')
})

const onConfirm = () => {
  confirmed = true
  emit('confirm')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!loading"
    :close="!loading"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        :label="cancelLabel"
        color="neutral"
        variant="ghost"
        :disabled="loading"
        @click="open = false"
      />
      <UButton
        :label="confirmLabel"
        :color="confirmColor"
        :icon="confirmIcon"
        :loading="loading"
        @click="onConfirm"
      />
    </template>
  </UModal>
</template>
