import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

/** App Firebase dédiée : seul l'identifiant du projet est nécessaire pour vérifier un jeton, pas de compte de service. */
function firebaseAuth() {
  const app = getApps().find(a => a.name === 'api-auth')
    ?? initializeApp({ projectId: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_PROJECT_ID }, 'api-auth')
  return getAuth(app)
}

/** Vérifie le jeton Firebase de l'en-tête `Authorization: Bearer` ; 401 s'il manque ou a expiré. */
export async function requireUser(authorization: string | undefined) {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]
  if (!token) throw createError({ statusCode: 401, message: 'Connexion requise.' })
  try {
    return await firebaseAuth().verifyIdToken(token)
  } catch {
    throw createError({ statusCode: 401, message: 'Session expirée, reconnectez-vous.' })
  }
}
