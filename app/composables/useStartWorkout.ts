import type { WorkoutTemplate } from '~/types/workout'
import { NEW_WORKOUT_ROUTE_ID } from '~/utils/workouts'

type WorkoutsApi = Pick<ReturnType<typeof useWorkouts>, 'inProgress' | 'createWorkout' | 'exercisesFromTemplate' | 'circuitsFromTemplate'>

/**
 * Démarrer une séance (page Séances) ou lancer un programme (page Programmes), puis l'ouvrir. Reçoit les séances déjà
 * chargées par la page plutôt que d'ouvrir une seconde lecture Firestore.
 *
 * `open` ouvre la séance dans l'éditeur en panneau de la page (id, ou `NEW_WORKOUT_ROUTE_ID` pour une séance passée) ;
 * sans lui, on navigue vers la page de la séance.
 */
export const useStartWorkout = (
  { inProgress, createWorkout, exercisesFromTemplate, circuitsFromTemplate }: WorkoutsApi,
  { open }: { open?: (workoutId: string) => void } = {},
) => {
  const router = useRouter()
  const toast = useToast()
  const starting = ref(false)

  /** Panneau de la page s'il y en a un ; sinon la page de la séance (rechargée si la navigation de l'appli échoue). */
  async function show(workoutId: string) {
    if (open) return open(workoutId)
    try {
      await router.push(`/dashboard/seances/${workoutId}`)
    }
    catch {
      window.location.assign(`/dashboard/seances/${workoutId}`)
    }
  }

  async function start(options: Parameters<typeof createWorkout>[0]) {
    // Séance passée : rien n'est écrit avant « Enregistrer ».
    if (!options.live) return show(NEW_WORKOUT_ROUTE_ID)
    if (inProgress.value) {
      toast.add({ title: 'Une séance est déjà en cours', description: 'Terminez-la avant d\'en commencer une autre.', color: 'warning', icon: 'i-lucide-timer' })
      return show(inProgress.value.id)
    }
    starting.value = true
    try {
      const id = await createWorkout(options)
      await show(id)
    }
    catch (e) {
      toast.add({ title: 'Séance non créée', description: (e as Error).message, color: 'error' })
    }
    finally {
      starting.value = false
    }
  }

  /** Séance en direct pré-remplie depuis un programme, charges reprises de la dernière fois. */
  const launch = (template: WorkoutTemplate) =>
    start({ live: true, label: template.label, templateId: template.id, exercises: exercisesFromTemplate(template), circuits: circuitsFromTemplate(template) })

  return { starting, start, launch }
}
