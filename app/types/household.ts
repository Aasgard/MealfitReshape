import type { Timestamp } from 'firebase/firestore'

/**
 * Membre tel qu'enregistré dans `households.members`, sous son uid. Nom, e-mail et photo sont copiés à l'arrivée :
 * le document `users` des autres membres reste privé.
 */
export type HouseholdMemberDoc = {
  name: string
  email: string
  photoUrl?: string
  joinedAt: Timestamp
  /** Code saisi pour rejoindre : les règles le comparent à celui du foyer. Absent chez le créateur. */
  inviteCode?: string
}

/**
 * Un foyer de la collection Firestore `households`. `memberIds` reprend les clés de `members` : c'est lui que lisent
 * les règles de sécurité et la requête `array-contains` qui retrouve le foyer du compte connecté.
 */
export type HouseholdDoc = {
  id: string
  name: string
  ownerId: string
  /** Code d'invitation, 6 caractères sans tiret ; réservé dans `inviteCodes/{code}`. */
  inviteCode: string
  memberIds: string[]
  members: Record<string, HouseholdMemberDoc>
  createdAt: Timestamp
}

/** `inviteCodes/{code}` : retrouve un foyer à partir de son code, sans pouvoir lister les foyers. */
export type InviteCodeDoc = {
  householdId: string
  createdAt: Timestamp
}
