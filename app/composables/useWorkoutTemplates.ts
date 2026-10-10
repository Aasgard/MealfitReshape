import { addDoc, collection, deleteDoc, doc, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { WorkoutTemplate } from '~/types/workout'

export type WorkoutTemplateInput = Pick<WorkoutTemplate, 'label' | 'exercises' | 'circuits'>

/** Programmes (séances-types) de l'utilisateur connecté, collection Firestore `workoutTemplates`, triés par nom. */
export const useWorkoutTemplates = () => {
  const db = useFirestore()
  const user = useCurrentUser()

  const stored = useCollection<WorkoutTemplate>(() =>
    user.value ? query(collection(db, 'workoutTemplates'), where('user', '==', user.value.uid)) : null)

  const templates = computed(() => stored.value
    .filter(t => Array.isArray(t.exercises))
    .map(t => ({ ...t, id: t.id, circuits: Array.isArray(t.circuits) ? t.circuits : [] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr')))

  const saveTemplate = async (input: WorkoutTemplateInput, id?: string | null) => {
    if (id) {
      await updateDoc(doc(db, 'workoutTemplates', id), { ...input, updatedAt: serverTimestamp() })
      return id
    }
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    const ref = await addDoc(collection(db, 'workoutTemplates'), {
      ...input,
      user: uid,
      visibility: 'private',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  }

  const deleteTemplate = (id: string) => deleteDoc(doc(db, 'workoutTemplates', id))

  return { templates, pending: stored.pending, error: stored.error, promise: stored.promise, saveTemplate, deleteTemplate }
}
