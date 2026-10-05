import { collection, deleteDoc, doc, serverTimestamp, writeBatch, type Timestamp } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { WeighIn } from '~/utils/weightTrend'

/** Document `users/{uid}/weighIns/{yyyy-MM-dd}` : l'id est le jour, ce qui garantit une pesée par jour au plus. */
type StoredWeighIn = {
  weightKg: number
  /** Absent quand la note est vide. */
  note?: string
  updatedAt?: Timestamp
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Pesées de l'utilisateur connecté et écritures associées. Toute la sous-collection est lue : la tendance, le journal
 * et la période « Tout » du graphique ont besoin de l'historique complet, et rien de calculé n'y est stocké.
 */
export const useWeighIns = () => {
  const db = useFirestore()
  const user = useCurrentUser()

  const weighInsRef = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return collection(db, 'users', uid, 'weighIns')
  }

  const stored = useCollection<StoredWeighIn>(() => (user.value ? weighInsRef() : null))

  /** Un document mal formé (id qui n'est pas un jour, poids absent) est ignoré plutôt que de casser la tendance. */
  const weighIns = computed<WeighIn[]>(() => stored.value.flatMap(({ id, weightKg, note }) =>
    ISO_DAY.test(id) && typeof weightKg === 'number' && Number.isFinite(weightKg)
      ? [{ id, date: id, weightKg, ...(note ? { note } : {}) }]
      : []))

  /**
   * Enregistre une pesée à son jour, en remplaçant celle qui s'y trouvait. `previous` (modification) est supprimée
   * dans la même écriture si la date a changé. Hors ligne, la promesse n'aboutit qu'à la synchronisation.
   */
  function saveWeighIn(value: Omit<WeighIn, 'id'>, previous?: WeighIn | null) {
    const ref = weighInsRef()
    const batch = writeBatch(db)
    if (previous && previous.date !== value.date) batch.delete(doc(ref, previous.date))
    const data: StoredWeighIn = { weightKg: value.weightKg, ...(value.note ? { note: value.note } : {}) }
    batch.set(doc(ref, value.date), { ...data, updatedAt: serverTimestamp() })
    return batch.commit()
  }

  const deleteWeighIn = (weighIn: WeighIn) => deleteDoc(doc(weighInsRef(), weighIn.date))

  return { weighIns, pending: stored.pending, error: stored.error, promise: stored.promise, saveWeighIn, deleteWeighIn }
}
