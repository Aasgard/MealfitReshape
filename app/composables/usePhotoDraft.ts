import { resizeImage } from '~/utils/imageResize'

/**
 * Photo choisie dans un formulaire, pas encore envoyée : réduite dans le navigateur,
 * avec une URL locale pour l'aperçu (libérée à chaque remplacement et au démontage).
 */
export const usePhotoDraft = () => {
  /** Photo réduite ; `null` = aucune nouvelle photo. */
  const blob = ref<Blob | null>(null)
  const objectUrl = ref<string | null>(null)
  const processing = ref(false)
  const error = ref<string | null>(null)

  const set = (value: Blob | null) => {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    blob.value = value
    objectUrl.value = value ? URL.createObjectURL(value) : null
  }

  /** Réduit le fichier choisi ; renvoie `false` s'il n'a pas pu être lu (message dans `error`). */
  const pick = async (file: File) => {
    error.value = null
    processing.value = true
    try {
      set(await resizeImage(file))
      return true
    } catch (cause) {
      console.error('Photo illisible :', cause)
      error.value = 'Cette image n\'a pas pu être lue. Essayez une photo JPEG ou PNG.'
      return false
    } finally {
      processing.value = false
    }
  }

  const reset = () => {
    set(null)
    processing.value = false
    error.value = null
  }

  onBeforeUnmount(() => set(null))

  return { blob, objectUrl, processing, error, set, pick, reset }
}
