import { addDoc, collection, deleteDoc, doc, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Exercise } from '~/types/workout'

export type ExerciseInput = Pick<Exercise, 'label' | 'kind' | 'group' | 'metric'>

/**
 * Exercices accessibles à l'utilisateur connecté : le catalogue intégré, les exercices publics de la collection
 * `exercises` (`owner` à `null`) et les siens. Deux requêtes d'égalité simples, sans index composite.
 */
export const useExercises = () => {
  const db = useFirestore()
  const user = useCurrentUser()

  const publicExercises = useCollection<Exercise>(() =>
    user.value ? query(collection(db, 'exercises'), where('owner', '==', null)) : null)
  const ownExercises = useCollection<Exercise>(() =>
    user.value ? query(collection(db, 'exercises'), where('owner', '==', user.value.uid)) : null)

  const exercises = computed(() => mergeExercises([...publicExercises.value, ...ownExercises.value]))
  const exercisesById = computed(() => new Map(exercises.value.map(e => [e.id, e])))

  const isOwned = (exercise: Exercise) => !!exercise.owner && exercise.owner === user.value?.uid

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  /** Un nouvel exercice est toujours perso ; le rendre public passera par une publication, comme les ingrédients. */
  const createExercise = async (input: ExerciseInput) => {
    const ref = await addDoc(collection(db, 'exercises'), {
      ...input,
      owner: requireUid(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  }

  const updateExercise = (id: string, input: ExerciseInput) =>
    updateDoc(doc(db, 'exercises', id), { ...input, updatedAt: serverTimestamp() })

  const deleteExercise = (id: string) => deleteDoc(doc(db, 'exercises', id))

  const promise = computed(() => Promise.all([
    publicExercises.promise.value.catch(() => undefined),
    ownExercises.promise.value.catch(() => undefined),
  ]))
  const error = computed(() => publicExercises.error.value ?? ownExercises.error.value)

  return { exercises, exercisesById, isOwned, createExercise, updateExercise, deleteExercise, promise, error }
}
