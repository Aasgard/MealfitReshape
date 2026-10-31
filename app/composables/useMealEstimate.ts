import { useCurrentUser } from 'vuefire'
import type { MacroEstimate } from '#shared/types/macroEstimate'

/** Premier nombre fini parmi les clés possibles (nombre ou chaîne numérique). */
const readNumber = (data: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = typeof data[key] === 'string' ? Number((data[key] as string).replace(',', '.')) : data[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

/**
 * Lit la réponse du serveur : un objet, ou du JSON resté en texte (selon l'hébergeur, le type de contenu peut manquer).
 * Clés françaises du contrat, ou anglaises par tolérance. `null` si une valeur manque : jamais de NaN dans les champs.
 */
const parseEstimate = (response: unknown): MacroEstimate | null => {
  let data = response
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const kcal = readNumber(record, ['kcal', 'calories'])
  const proteines = readNumber(record, ['proteines', 'protein', 'proteins'])
  const glucides = readNumber(record, ['glucides', 'carbohydrates', 'carbs'])
  const lipides = readNumber(record, ['lipides', 'fat', 'fats'])
  if (kcal === null || proteines === null || glucides === null || lipides === null) return null
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  return {
    description: text(record.description),
    longDescription: text(record.longDescription),
    kcal,
    proteines,
    glucides,
    lipides,
  }
}

/**
 * Estimation des kcal et macros d'un repas par Claude (`POST /api/estimate-macros`), à partir d'une photo réduite
 * dans le navigateur (jamais enregistrée) et/ou d'une description. Partagée par la page Scan My Meal et l'onglet Macros
 * de l'ajout d'un repas.
 */
export const useMealEstimate = () => {
  const user = useCurrentUser()
  const photo = usePhotoDraft()
  const description = ref('')

  const estimating = ref(false)
  const estimate = ref<MacroEstimate | null>(null)
  const error = ref<string>()

  const canEstimate = computed(() => !estimating.value && !photo.processing.value
    && (photo.blob.value !== null || description.value.trim() !== ''))

  /** Renvoie l'estimation, ou `null` en cas d'échec (message dans `error`). */
  const submit = async (): Promise<MacroEstimate | null> => {
    if (!canEstimate.value || !user.value) return null

    estimating.value = true
    error.value = undefined
    estimate.value = null
    try {
      const body = new FormData()
      if (photo.blob.value) body.append('photo', photo.blob.value, 'repas.jpg')
      body.append('description', description.value.trim())

      const response = await $fetch<unknown>('/api/estimate-macros', {
        method: 'POST',
        body,
        headers: { Authorization: `Bearer ${await user.value.getIdToken()}` },
      })
      const parsed = parseEstimate(response)
      if (!parsed) {
        console.error('Réponse d\'estimation inattendue :', response)
        // Page HTML au lieu de JSON : l'appli est servie en statique, la route serveur n'existe pas (build `nuxt generate`).
        const isHtml = typeof response === 'string' && /^\s*<!doctype html/i.test(response)
        error.value = isHtml
          ? 'Le service d\'estimation n\'est pas disponible sur ce déploiement.'
          : 'La réponse de l\'estimation est illisible. Réessayez.'
        return null
      }
      estimate.value = parsed
      return parsed
    } catch (cause) {
      console.error('Estimation impossible :', cause)
      // Message du serveur dans le corps JSON de l'erreur ; à défaut (hors ligne, délai dépassé), message générique.
      const serverMessage = (cause as { data?: { message?: string } }).data?.message
      error.value = serverMessage ?? 'L\'estimation a échoué. Vérifiez la connexion et réessayez.'
      return null
    } finally {
      estimating.value = false
    }
  }

  const reset = () => {
    photo.reset()
    description.value = ''
    estimate.value = null
    error.value = undefined
  }

  return { photo, description, estimating, estimate, error, canEstimate, submit, reset }
}
