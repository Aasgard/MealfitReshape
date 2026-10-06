<script setup lang="ts">
import { collection, doc, setDoc, updateDoc, Timestamp, deleteField } from 'firebase/firestore'
import type { Container } from '~/types/container'
import { parsePositiveNumber } from '~/utils/numberInput'
import { resizeImage } from '~/utils/imageResize'

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
const photos = useContainerPhotos()

const isEditMode = computed(() => props.container !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.container?.label}` : 'Ajouter un récipient')

const label = ref('')
const weight = ref('')
const comment = ref('')
const submitted = ref(false)
const saving = ref(false)

/** Photo choisie dans ce formulaire, déjà réduite ; `null` = on garde la photo existante (ou aucune). */
const newPhoto = ref<Blob | null>(null)
const newPhotoUrl = ref<string | null>(null)
/** L'utilisateur a retiré la photo existante. */
const photoRemoved = ref(false)
const photoProcessing = ref(false)
/** Avancement de l'envoi (0 → 1) ; `null` hors envoi. */
const uploadProgress = ref<number | null>(null)
const photoError = ref<string | null>(null)

const cameraInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)

const previewUrl = computed(() => {
  if (newPhotoUrl.value) return newPhotoUrl.value
  if (photoRemoved.value) return null
  return props.container?.imageUrl ?? null
})

function setNewPhoto(blob: Blob | null) {
  if (newPhotoUrl.value) URL.revokeObjectURL(newPhotoUrl.value)
  newPhoto.value = blob
  newPhotoUrl.value = blob ? URL.createObjectURL(blob) : null
}

onBeforeUnmount(() => setNewPhoto(null))

function resetForm() {
  const c = props.container
  label.value = c?.label ?? ''
  weight.value = c ? String(c.weight) : ''
  comment.value = c?.comment ?? ''
  setNewPhoto(null)
  photoRemoved.value = false
  photoProcessing.value = false
  uploadProgress.value = null
  photoError.value = null
  submitted.value = false
}

watch(open, (isOpen) => {
  if (isOpen) resetForm()
  else setNewPhoto(null)
})

async function onPhotoPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Vide le champ pour pouvoir choisir à nouveau le même fichier.
  input.value = ''
  if (!file) return

  photoError.value = null
  photoProcessing.value = true
  try {
    setNewPhoto(await resizeImage(file))
    photoRemoved.value = false
  } catch (error) {
    console.error('Photo illisible :', error)
    photoError.value = 'Cette image n\'a pas pu être lue. Essayez une photo JPEG ou PNG.'
  } finally {
    photoProcessing.value = false
  }
}

function removePhoto() {
  setNewPhoto(null)
  photoRemoved.value = true
  photoError.value = null
}

/** Message d'échec d'envoi selon le code Firebase Storage : une règle refusée n'est pas un problème de connexion. */
function uploadErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  switch (code) {
    case 'storage/unauthorized':
    case 'storage/unauthenticated':
      return 'Envoi refusé par les règles Firebase Storage. Vérifiez qu\'elles autorisent users/{uid}/containers, puis enregistrez à nouveau.'
    case 'storage/quota-exceeded':
      return 'Quota Firebase Storage dépassé : la photo n\'a pas été envoyée.'
    case 'storage/bucket-not-found':
    case 'storage/project-not-found':
      return 'Firebase Storage n\'est pas activé pour ce projet : la photo n\'a pas été envoyée.'
    default:
      return 'L\'envoi de la photo a échoué. Vérifiez la connexion, puis enregistrez à nouveau.'
  }
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
  if (!isValid.value || photoProcessing.value) return

  if (!user.value) {
    toast.add({ title: 'Erreur', description: 'Vous devez être connecté.', color: 'error' })
    return
  }
  const uid = user.value.uid
  const existing = props.container
  const containerId = existing?.id ?? doc(collection(db, 'containers')).id
  const trimmedLabel = label.value.trim()

  saving.value = true
  photoError.value = null

  let uploaded: { url: string; path: string } | null = null
  if (newPhoto.value) {
    uploadProgress.value = 0
    try {
      uploaded = await photos.upload(uid, containerId, newPhoto.value, (ratio) => { uploadProgress.value = ratio })
    } catch (error) {
      console.error('Envoi de la photo échoué :', error)
      photoError.value = uploadErrorMessage(error)
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
        <!-- Photo -->
        <div class="flex flex-col gap-2">
          <p class="text-sm font-medium text-default">Photo (optionnel)</p>
          <div class="relative h-44 overflow-hidden rounded-xl border border-default bg-accented">
            <img
              v-if="previewUrl"
              :src="previewUrl"
              alt="Aperçu de la photo du récipient"
              class="size-full object-cover"
            >
            <div v-else class="flex size-full flex-col items-center justify-center gap-2 text-dimmed">
              <UIcon name="i-lucide-cooking-pot" class="size-7" />
              <p class="text-xs">Une photo aide à reconnaître le bon récipient.</p>
            </div>

            <div v-if="photoProcessing" class="absolute inset-0 flex items-center justify-center bg-default/70">
              <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
            </div>

            <div
              v-if="uploadProgress !== null"
              class="absolute inset-x-3 bottom-3 h-2 rounded-full bg-default/80 overflow-hidden"
              role="progressbar"
              aria-label="Envoi de la photo"
              :aria-valuenow="Math.round(uploadProgress * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="h-full rounded-full bg-primary transition-all duration-500" :style="{ width: `${uploadProgress * 100}%` }" />
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <!-- La capture directe n'a de sens que sur un appareil tactile (téléphone, tablette). -->
            <UButton
              label="Prendre une photo"
              icon="i-lucide-camera"
              color="neutral"
              variant="outline"
              size="sm"
              class="hidden pointer-coarse:inline-flex"
              :disabled="saving || photoProcessing"
              @click="cameraInput?.click()"
            />
            <UButton
              :label="previewUrl ? 'Remplacer l\'image' : 'Choisir une image'"
              icon="i-lucide-image-up"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="saving || photoProcessing"
              @click="galleryInput?.click()"
            />
            <UButton
              v-if="previewUrl"
              label="Retirer"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="saving || photoProcessing"
              @click="removePhoto"
            />
          </div>
          <p v-if="photoError" class="text-xs text-error" role="alert">
            {{ photoError }}
          </p>

          <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1" aria-hidden="true" @change="onPhotoPicked">
          <input ref="galleryInput" type="file" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true" @change="onPhotoPicked">
        </div>

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
        :disabled="photoProcessing"
        @click="handleSubmit"
      />
    </template>
  </USlideover>
</template>
