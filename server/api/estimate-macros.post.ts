import Anthropic from '@anthropic-ai/sdk'
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { MacroEstimate } from '#shared/types/macroEstimate'

/**
 * Estime les kcal et macros d'un repas à partir d'une photo et/ou d'une description, avec Claude.
 * Corps multipart : `photo` (image, facultative) et `description` (texte, facultatif), l'un des deux au moins.
 * Réservé aux comptes connectés (jeton Firebase en `Authorization: Bearer`) : chaque appel est facturé.
 * La photo ne fait que transiter : rien n'est stocké.
 */

// Les descriptions viennent avant les chiffres : Claude détaille ce qu'il a reconnu avant de compter.
const ESTIMATE_FORMAT = betaJSONSchemaOutputFormat({
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'Nom court du repas reconnu, en quelques mots (ex. « Pâtes carbonara et salade verte »).',
    },
    longDescription: {
      type: 'string',
      description: 'Détail du repas : chaque aliment avec son poids estimé, la cuisson et les matières grasses supposées.',
    },
    kcal: { type: 'number', description: 'Énergie totale du repas, en kcal.' },
    proteines: { type: 'number', description: 'Protéines totales, en grammes.' },
    glucides: { type: 'number', description: 'Glucides totaux, en grammes.' },
    lipides: { type: 'number', description: 'Lipides totaux, en grammes.' },
  },
  required: ['description', 'longDescription', 'kcal', 'proteines', 'glucides', 'lipides'],
  additionalProperties: false,
})

const SYSTEM_PROMPT = `Tu es un nutritionniste. On te donne la photo d'un repas, sa description, ou les deux.
Estime l'énergie (kcal) et les macronutriments (protéines, glucides, lipides, en grammes) de la totalité de ce qui est montré ou décrit.

- Identifie chaque aliment et estime son poids d'après la taille de l'assiette, des couverts et des contenants visibles.
- Les quantités et précisions données dans la description priment sur ce que tu déduis de la photo.
- Compte les matières grasses de cuisson, les sauces et les assaisonnements probables, même s'ils ne se voient pas.
- Appuie-toi sur des valeurs de référence (table CIQUAL) pour chaque aliment, puis additionne.
- Donne une estimation réaliste, ni prudente ni généreuse.

Réponds en français.
- \`description\` : le nom du repas tel que tu l'as reconnu, en quelques mots.
- \`longDescription\` : quelques phrases ou une courte liste, une ligne par aliment (« 180 g de pâtes cuites »…), avec les hypothèses de cuisson et de matières grasses, pour qu'on puisse vérifier ce que tu as compté.`

/** Images que l'API accepte ; le client envoie normalement du JPEG (photo réduite dans le navigateur). */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type ImageType = typeof IMAGE_TYPES[number]

/** Sous la limite de 4,5 Mo des fonctions Vercel, en laissant la place au reste du corps. */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024
const MAX_DESCRIPTION_LENGTH = 2000

/** App Firebase dédiée : seul l'identifiant du projet est nécessaire pour vérifier un jeton, pas de compte de service. */
function firebaseAuth() {
  const app = getApps().find(a => a.name === 'estimate-macros')
    ?? initializeApp({ projectId: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_PROJECT_ID }, 'estimate-macros')
  return getAuth(app)
}

async function requireUser(authorization: string | undefined) {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]
  if (!token) throw createError({ statusCode: 401, message: 'Connexion requise.' })
  try {
    return await firebaseAuth().verifyIdToken(token)
  } catch {
    throw createError({ statusCode: 401, message: 'Session expirée, reconnectez-vous.' })
  }
}

export default defineEventHandler(async (event): Promise<MacroEstimate> => {
  await requireUser(getHeader(event, 'authorization'))

  const parts = await readMultipartFormData(event) ?? []
  const photo = parts.find(p => p.name === 'photo' && p.data.length > 0)
  const description = parts.find(p => p.name === 'description')?.data.toString('utf8').trim() ?? ''

  if (!photo && !description) {
    throw createError({ statusCode: 400, message: 'Ajoutez une photo ou une description du repas.' })
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw createError({ statusCode: 400, message: 'Description trop longue.' })
  }
  if (photo && !IMAGE_TYPES.includes(photo.type as ImageType)) {
    throw createError({ statusCode: 400, message: 'Format de photo non pris en charge.' })
  }
  if (photo && photo.data.length > MAX_PHOTO_BYTES) {
    throw createError({ statusCode: 413, message: 'Photo trop lourde.' })
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (photo) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: photo.type as ImageType, data: photo.data.toString('base64') },
    })
  }
  content.push({
    type: 'text',
    text: description
      ? `Description du repas : ${description}`
      : 'Pas de description : estime d\'après la photo seule.',
  })

  // Clé lue dans ANTHROPIC_API_KEY (variable d'environnement Vercel, jamais exposée au navigateur).
  const client = new Anthropic()
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Estimation courte : l'effort bas garde une réponse en quelques secondes.
      output_config: { effort: 'low', format: ESTIMATE_FORMAT },
      // Si les filtres de sécurité refusent la requête, l'API la rejoue sur un autre modèle.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw createError({ statusCode: 502, message: 'Claude n\'a pas pu estimer ce repas.' })
    }

    const { description: label, longDescription, kcal, proteines, glucides, lipides } = response.parsed_output
    const round = (n: number) => Math.max(0, Math.round(n))
    return {
      description: label.trim(),
      longDescription: longDescription.trim(),
      kcal: round(kcal),
      proteines: round(proteines),
      glucides: round(glucides),
      lipides: round(lipides),
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw createError({ statusCode: 429, message: 'Trop de demandes, réessayez dans un instant.' })
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Estimation Claude impossible :', error.status, error.message)
      throw createError({ statusCode: 502, message: 'Le service d\'estimation ne répond pas.' })
    }
    throw error
  }
})
