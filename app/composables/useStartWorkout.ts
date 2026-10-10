import type { WorkoutTemplate } from '~/types/workout'
import { NEW_WORKOUT_ROUTE_ID } from '~/utils/workouts'

type WorkoutsApi = Pick<ReturnType<typeof useWorkouts>, 'inProgress' | 'createWorkout' | 'exercisesFromTemplate' | 'circuitsFromTemplate'>

/**
 * Démarrer une séance (page Séances) ou lancer un programme (page Programmes), puis ouvrir sa page. Reçoit les
 * séances déjà chargées par la page plutôt que d'ouvrir une seconde lecture Firestore.
 */
export const useStartWorkout = ({ inProgress, createWorkout, exercisesFromTemplate, circuitsFromTemplate }: WorkoutsApi) => {
  const router = useRouter()
  const toast = useToast()
  const starting = ref(false)

  async function start(options: Parameters<typeof createWorkout>[0]) {
    // Séance passée : rien n'est écrit avant « Enregistrer » sur sa page.
    if (!options.live) return router.push(`/dashboard/seances/${NEW_WORKOUT_ROUTE_ID}`)
    if (inProgress.value) {
      toast.add({ title: 'Une séance est déjà en cours', description: 'Terminez-la avant d\'en commencer une autre.', color: 'warning', icon: 'i-lucide-timer' })
      return router.push(`/dashboard/seances/${inProgress.value.id}`)
    }
    starting.value = true
    let id: string
    try {
      id = await createWorkout(options)
    }
    catch (e) {
      toast.add({ title: 'Séance non créée', description: (e as Error).message, color: 'error' })
      starting.value = false
      return
    }
    // La séance existe : si la navigation de l'appli échoue (version de l'appli périmée sur le téléphone, serveur
    // relancé), on recharge directement sa page.
    try {
      await router.push(`/dashboard/seances/${id}`)
    }
    catch {
      window.location.assign(`/dashboard/seances/${id}`)
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
