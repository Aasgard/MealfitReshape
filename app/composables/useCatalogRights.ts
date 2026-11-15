import { doc } from 'firebase/firestore'
import { useCurrentUser, useDocument, useFirestore } from 'vuefire'
import type { UserDoc } from '~/types/user'

/**
 * Droits sur le catalogue (recettes et ingrédients). Tout le monde voit tout, crée et duplique ; un admin
 * (`users/{uid}.admin` à `true`) modifie et supprime tout, les autres seulement ce qu'ils ont créé (`owner`).
 * Un compte sans le champ n'est pas admin.
 *
 * Masquage d'interface seulement : les règles Firestore n'imposent rien. Tant que le document `users` n'est pas lu,
 * le compte est traité en non-admin (les actions sur ce qui n'est pas à lui apparaissent un instant après).
 */
export function useCatalogRights() {
  const db = useFirestore()
  const user = useCurrentUser()

  const userDoc = useDocument<UserDoc>(() => (user.value ? doc(db, 'users', user.value.uid) : null))
  const isAdmin = computed(() => userDoc.value?.admin === true)

  /** Le compte connecté peut modifier ou supprimer cette recette ou cet ingrédient. */
  const canEdit = (item: { owner?: string | null }) =>
    isAdmin.value || (!!item.owner && item.owner === user.value?.uid)

  return { isAdmin, canEdit }
}
