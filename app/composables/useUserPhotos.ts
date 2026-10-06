import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'

/** Dossiers Storage des photos privées d'un utilisateur, un par type de document. */
export type PhotoFolder = 'containers' | 'recipes'

/**
 * Photos d'un utilisateur dans Firebase Storage, sous `users/{uid}/{folder}/{docId}/{horodatage}.jpg`.
 * Chaque envoi a un nom neuf : remplacer une photo ne sert jamais l'ancienne depuis un cache.
 */
export const useUserPhotos = (folder: PhotoFolder) => {
  const storage = useFirebaseStorage()

  /** Envoie la photo et renvoie son URL de téléchargement et son chemin ; `onProgress` reçoit 0 → 1. */
  const upload = (uid: string, docId: string, blob: Blob, onProgress?: (ratio: number) => void) => {
    const path = `users/${uid}/${folder}/${docId}/${Date.now()}.jpg`
    const task = uploadBytesResumable(storageRef(storage, path), blob, { contentType: 'image/jpeg' })

    return new Promise<{ url: string; path: string }>((resolve, reject) => {
      task.on(
        'state_changed',
        snapshot => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
        reject,
        async () => {
          try {
            resolve({ url: await getDownloadURL(task.snapshot.ref), path })
          } catch (error) {
            reject(error)
          }
        },
      )
    })
  }

  /** Supprime une photo ; un échec n'est que journalisé (fichier orphelin sans conséquence pour l'utilisateur). */
  const remove = async (path: string | undefined) => {
    if (!path) return
    try {
      await deleteObject(storageRef(storage, path))
    } catch (error) {
      console.warn('Photo non supprimée :', path, error)
    }
  }

  /** Message d'échec d'envoi selon le code Firebase Storage : une règle refusée n'est pas un problème de connexion. */
  const uploadErrorMessage = (error: unknown): string => {
    const code = (error as { code?: string } | null)?.code
    switch (code) {
      case 'storage/unauthorized':
      case 'storage/unauthenticated':
        return `Envoi refusé par les règles Firebase Storage. Vérifiez qu'elles autorisent users/{uid}/${folder}, puis enregistrez à nouveau.`
      case 'storage/quota-exceeded':
        return 'Quota Firebase Storage dépassé : la photo n\'a pas été envoyée.'
      case 'storage/bucket-not-found':
      case 'storage/project-not-found':
        return 'Firebase Storage n\'est pas activé pour ce projet : la photo n\'a pas été envoyée.'
      default:
        return 'L\'envoi de la photo a échoué. Vérifiez la connexion, puis enregistrez à nouveau.'
    }
  }

  return { upload, remove, uploadErrorMessage }
}
