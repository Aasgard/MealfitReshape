import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'

/**
 * Photos des récipients dans Firebase Storage, sous `users/{uid}/containers/{containerId}/{horodatage}.jpg`.
 * Chaque envoi a un nom neuf : remplacer une photo ne sert jamais l'ancienne depuis un cache.
 */
export const useContainerPhotos = () => {
  const storage = useFirebaseStorage()

  /** Envoie la photo et renvoie son URL de téléchargement et son chemin ; `onProgress` reçoit 0 → 1. */
  const upload = (uid: string, containerId: string, blob: Blob, onProgress?: (ratio: number) => void) => {
    const path = `users/${uid}/containers/${containerId}/${Date.now()}.jpg`
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
      console.warn('Photo de récipient non supprimée :', path, error)
    }
  }

  return { upload, remove }
}
