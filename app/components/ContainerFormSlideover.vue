<script setup lang="ts">
import { collection, doc, setDoc, updateDoc, Timestamp, deleteField } from 'firebase/firestore'
import type { Container } from '~/types/container'
import { parsePositiveNumber } from '~/utils/numberInput'

/**
 * Slideover d'ajout/modification d'un récipient — un seul composant pour les deux modes.
 * `container` nul = création ; non nul = édition (le formulaire est pré-rempli à l'ouverture).
 * La photo est réduite dans le navigateur, envoyée dans Storage, puis le document Firestore est écrit.
 */
const props = defineProps<{
  container: Container | null
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const LABEL_MAX = 40
const COMMENT_MAX = 200

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const photos = useUserPhotos('containers')

const isEditMode = computed(() => props.container !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.container?.label}` : 'Ajouter un récipient')

const label = ref('')
const weight = ref('')
const comment = ref('')
const submitted = ref(false)
const saving = ref(false)

/** Photo choisie dans ce formulaire, déjà réduite ; vide = on garde la photo existante (ou aucune). */
const photo = usePhotoDraft()
/** L'utilisateur a retiré la photo existante. */
const photoRemoved = ref(false)
/** Avancement de l'envoi (0 → 1) ; `null` hors envoi. */
const uploadProgress = ref<number | null>(null)

const previewUrl = computed(() => {
  if (photo.objectUrl.value) return photo.objectUrl.value
  if (photoRemoved.value) return null
  return props.container?.imageUrl ?? null
})

function resetForm() {
  const c = props.container
  label.value = c?.label ?? ''
  weight.value = c ? String(c.weight) : ''
  comment.value = c?.comment ?? ''
  photo.reset()
  photoRemoved.value = false
  uploadProgress.value = null
  submitted.value = false
}

watch(open, (isOpen) => {
  if (isOpen) resetForm()
  else photo.set(null)
})

async function onPhotoPicked(file: File) {
  if (await photo.pick(file)) photoRemoved.value = false
}

function removePhoto() {
  photo.reset()
  photoRemoved.value = true
}

const labelError = computed(() => (submitted.value && !label.value.trim()) ? 'Requis' : undefined)
const weightError = computed(() => {
  if (!submitted.value) return undefined
  if (!weight.value.trim()) return 'Requis'
  return parsePositiveNumber(weight.value) === null ? 'Poids en grammes, ex : 1250' : undefined
})

const isValid = computed(() => !!label.value.trim() && parsePositiveNumber(weight.value) !== null)

async function handleSubmit() {
  submitted.value = true
  if (!isValid.value || photo.processing.value) return

  if (!user.value) {
    toast.add({ title: 'Erreur', description: 'Vous devez être connecté.', color: 'error' })
    return
  }
  const uid = user.value.uid
  const existing = props.container
  const containerId = existing?.id ?? doc(collection(db, 'containers')).id
  const trimmedLabel = label.value.trim()

  saving.value = true
  photo.error.value = null

  let uploaded: { url: string; path: string } | null = null
  if (photo.blob.value) {
    uploadProgress.value = 0
    try {
      uploaded = await photos.upload(uid, containerId, photo.blob.value, (ratio) => { uploadProgress.value = ratio })
    } catch (error) {
      console.error('Envoi de la photo échoué :', error)
      photo.error.value = photos.uploadErrorMessage(error)
      saving.value = false
      uploadProgress.value = null
      return
    }
  }

  try {
    const now = Timestamp.now()
    const trimmedComment = comment.value.trim()
    const payload: Record<string, unknown> = {
      label: trimmedLabel,
      weight: Math.round(parsePositiveNumber(weight.value)!),
      updatedAt: now,
    }

    if (trimmedComment) payload.comment = trimmedComment
    else if (existing) payload.comment = deleteField()

    if (uploaded) {
      payload.imageUrl = uploaded.url
      payload.imagePath = uploaded.path
    } else if (existing && photoRemoved.value) {
      payload.imageUrl = deleteField()
      payload.imagePath = deleteField()
    }

    if (existing) {
      await updateDoc(doc(db, 'containers', existing.id), payload)
      toast.add({ title: 'Modifié', description: `« ${trimmedLabel} » a été mis à jour`, color: 'success' })
    } else {
      await setDoc(doc(db, 'containers', containerId), { ...payload, owner: uid, createdAt: now })
      toast.add({ title: 'Ajouté', description: `« ${trimmedLabel} » a été ajouté à vos récipients`, color: 'success' })
    }

    // L'ancienne photo n'est plus référencée : remplacée ou retirée.
    if (existing?.imagePath && (uploaded || photoRemoved.value)) photos.remove(existing.imagePath)

    open.value = false
  } catch (error: any) {
    // Le document n'a pas été écrit : la photo envoyée ne serait référencée nulle part.
    if (uploaded) photos.remove(uploaded.path)
    toast.add({
      title: 'Erreur',
      description: error.message || `Une erreur est survenue lors de ${isEditMode.value ? 'la modification' : 'l\'ajout'}.`,
      color: 'error'
    })
  } finally {
    saving.value = false
    uploadProgress.value = null
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :dismissible="!saving"
    :close="!saving"
  >
    <template #body>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="handleSubmit">
        <PhotoField
          label="Photo (optionnel)"
          :preview-url="previewUrl"
          alt="Aperçu de la photo du récipient"
          placeholder-icon="i-lucide-cooking-pot"
          placeholder-text="Une photo aide à reconnaître le bon récipient."
          :processing="photo.processing.value"
          :upload-progress="uploadProgress"
          :error="photo.error.value"
          :disabled="saving"
          @pick="onPhotoPicked"
          @remove="removePhoto"
        />

        <UFormField label="Nom" :error="labelError">
          <UInput
            v-model="label"
            placeholder="ex : Cocotte en fonte grise"
            :maxlength="LABEL_MAX"
            size="md"
            variant="outline"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Poids à vide"
          :error="weightError"
          help="Pesé vide sur la balance de cuisine. C'est la tare retirée à chaque pesée."
        >
          <UInput
            v-model="weight"
            type="text"
            inputmode="decimal"
            placeholder="ex : 1250"
            size="md"
            variant="outline"
            class="w-40"
            :ui="{ base: 'text-right tabular-nums pe-8' }"
          >
            <template #trailing>
              <span class="text-sm text-dimmed">g</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField label="Commentaire (optionnel)" :hint="`${comment.length}/${COMMENT_MAX}`">
          <UTextarea
            v-model="comment"
            :rows="2"
            :maxlength="COMMENT_MAX"
            placeholder="ex : Couvercle non compris, passe au four"
            variant="outline"
            class="w-full"
          />
        </UFormField>

        <!-- Permet de valider avec la touche Entrée depuis un champ. -->
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton
        :label="uploadProgress !== null ? 'Envoi de la photo...' : 'Enregistrer'"
        color="primary"
        :loading="saving"
        :disabled="photo.processing.value"
        @click="handleSubmit"
      />
    </template>
  </USlideover>
</template>
