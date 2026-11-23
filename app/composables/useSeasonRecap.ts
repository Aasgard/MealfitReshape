import { format } from 'date-fns'
import { doc, getDoc, setDoc, type DocumentReference } from 'firebase/firestore'
import { useCurrentUser, useFirestore } from 'vuefire'
import type { UserDoc } from '~/types/user'

/**
 * Récapitulatif de saison (fruits et légumes qui arrivent ou s'en vont) : ouvert d'office à la première visite d'un
 * nouveau mois, ou à la demande depuis la page Ingrédients. Le mois vu est retenu sur le profil (`users.seasonRecapSeenMonth`).
 */
export function useSeasonRecap() {
  const db = useFirestore()
  const user = useCurrentUser()
  const open = useState('season-recap-open', () => false)

  const userRef = () => (user.value ? doc(db, 'users', user.value.uid) as DocumentReference<UserDoc> : null)
  const thisMonth = () => format(new Date(), 'yyyy-MM')

  /** Retient le mois courant comme vu ; hors ligne, l'écriture part à la synchronisation. */
  function markSeen() {
    const ref = userRef()
    if (!ref) return
    setDoc(ref, { seasonRecapSeenMonth: thisMonth() }, { merge: true })
      .catch(error => console.error('Enregistrement du récapitulatif de saison impossible', error))
  }

  /**
   * Vrai si le récapitulatif du mois n'a pas encore été vu. Au tout premier usage (champ absent), le mois est retenu
   * sans rien montrer : un nouveau compte n'est pas accueilli par une liste. Un échec de lecture ne montre rien.
   */
  async function isDue() {
    const ref = userRef()
    if (!ref) return false
    try {
      const seen = (await getDoc(ref)).data()?.seasonRecapSeenMonth
      if (seen === thisMonth()) return false
      if (!seen) {
        markSeen()
        return false
      }
      return true
    }
    catch (error) {
      console.error('Lecture du récapitulatif de saison impossible', error)
      return false
    }
  }

  return { open, isDue, markSeen }
}
