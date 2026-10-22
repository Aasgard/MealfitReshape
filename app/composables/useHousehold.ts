import { arrayRemove, arrayUnion, collection, deleteField, doc, getDoc, limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Timestamp, type Transaction } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { HouseholdDoc, InviteCodeDoc } from '~/types/household'
import type { UserDoc } from '~/types/user'

/** Membre d'un foyer. Le propriétaire seul invite, renomme et retire ; les autres peuvent partir. */
export interface HouseholdMember {
  id: string
  name: string
  email: string
  photoUrl?: string
  /** Date ISO d'arrivée dans le foyer. */
  joinedAt: string
  /** Compte connecté. */
  isSelf?: boolean
}

export interface Household {
  name: string
  /** Date ISO de création. */
  createdAt: string
  /** Code d'invitation, 6 caractères sans tiret (`K7F2QM`). */
  inviteCode: string
  /** Id du membre propriétaire. */
  ownerId: string
  members: HouseholdMember[]
}

/** Point de vue de la maquette : le compte connecté est propriétaire ou simple membre. */
export type HouseholdDemoView = 'owner' | 'member'

/** Id du compte connecté tant que son uid n'est pas connu. */
export const SELF_ID = 'self'

/** Lettres et chiffres sans ambiguïté à la lecture (ni 0/O, ni 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateInviteCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
}

/** `k7f-2qm` → `K7F2QM` ; `null` si ce n'est pas un code à 6 caractères. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-Z0-9]{6}$/.test(code) ? code : null
}

/** `K7F2QM` → `K7F-2QM` */
export const formatInviteCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`

/** Propriétaire d'abord, puis par ordre d'arrivée : l'ordre de succession se lit dans la liste. */
export function sortedMembers(household: Household): HouseholdMember[] {
  return [...household.members].sort((a, b) =>
    Number(b.id === household.ownerId) - Number(a.id === household.ownerId) || a.joinedAt.localeCompare(b.joinedAt))
}

/** Membre qui deviendrait propriétaire si le propriétaire partait : le plus ancien des autres. */
export function successorOf(household: Household): HouseholdMember | null {
  return sortedMembers(household).find(m => m.id !== household.ownerId) ?? null
}

/** Un horodatage serveur pas encore confirmé date de maintenant. */
const isoOf = (ts: Timestamp | null | undefined) => (ts ? ts.toDate() : new Date()).toISOString()

/** Foyer enregistré, vu par le compte `uid`. */
function fromDoc(stored: HouseholdDoc, uid: string): Household {
  return {
    name: stored.name,
    createdAt: isoOf(stored.createdAt),
    inviteCode: stored.inviteCode,
    ownerId: stored.ownerId,
    members: Object.entries(stored.members ?? {}).map(([id, m]) => ({
      id,
      name: m.name,
      email: m.email,
      photoUrl: m.photoUrl,
      joinedAt: isoOf(m.joinedAt),
      isSelf: id === uid,
    })),
  }
}

/** Entrée de `members` du compte connecté, arrivé maintenant ; Firestore refuse les champs `undefined`. */
const memberEntry = (self: HouseholdMember) => ({
  name: self.name,
  email: self.email,
  ...(self.photoUrl ? { photoUrl: self.photoUrl } : {}),
  joinedAt: serverTimestamp(),
})

const CAMILLE = { id: 'demo-camille', name: 'Camille Laurent', email: 'camille.laurent@exemple.fr' }
const HUGO = { id: 'demo-hugo', name: 'Hugo Martin', email: 'hugo.martin@exemple.fr' }

/** Foyer « Maison » de la maquette, vu par son propriétaire (le compte connecté) ou par un membre (propriétaire : Camille). */
function demoHousehold(self: HouseholdMember, view: HouseholdDemoView): Household {
  const base = { name: 'Maison', createdAt: '2026-03-04', inviteCode: 'K7F2QM' }
  return view === 'owner'
    ? {
        ...base,
        ownerId: self.id,
        members: [
          { ...self, joinedAt: '2026-03-04' },
          { ...CAMILLE, joinedAt: '2026-03-11' },
          { ...HUGO, joinedAt: '2026-06-18' },
        ],
      }
    : {
        ...base,
        ownerId: CAMILLE.id,
        members: [
          { ...CAMILLE, joinedAt: '2026-03-04' },
          { ...self, joinedAt: '2026-05-02' },
          { ...HUGO, joinedAt: '2026-06-18' },
        ],
      }
}

/** Données partagées par le foyer, chiffres de démonstration. */
export const HOUSEHOLD_SHARED = [
  { key: 'menus', label: 'Menus de la semaine', icon: 'i-lucide-calendar-days', to: '/dashboard/menus', value: 19, unit: 'repas', hint: 'Un seul planning, modifiable par tous.' },
  { key: 'courses', label: 'Liste de courses', icon: 'i-lucide-shopping-cart', to: '/dashboard/liste-courses', value: 23, unit: 'articles', hint: 'Cochés par celui ou celle qui fait les courses.' },
  { key: 'recettes', label: 'Recettes et ingrédients privés', icon: 'i-lucide-chef-hat', to: '/dashboard/recipes', value: 12, unit: 'recettes', extra: '5 ingrédients', hint: 'Les entrées « Privé » sont visibles par le foyer.' },
  { key: 'stock', label: 'Stock de plats préparés', icon: 'i-lucide-refrigerator', to: '/dashboard/stock', value: 7, unit: 'parts', hint: 'Chacun y pioche, ils partent avec qui les a ajoutés.' },
  { key: 'recipients', label: 'Récipients', icon: 'i-lucide-cooking-pot', to: '/dashboard/recipients', value: 6, unit: 'récipients', hint: 'Modifiables par tous, ils partent avec qui les a ajoutés.' },
] as const

/**
 * Foyer du compte connecté (un seul au plus) : celui de la collection Firestore `households` dont il est membre,
 * sinon le foyer de démonstration s'il est affiché (état en mémoire, membres fictifs).
 * Toutes les actions écrivent dans Firestore, sauf sur la démo, qu'elles ne changent qu'en mémoire.
 * `self` fournit le compte connecté, son uid pour id.
 */
export function useHousehold() {
  const db = useFirestore()
  const user = useCurrentUser()

  const stored = useCollection<HouseholdDoc>(() => {
    const uid = user.value?.uid
    if (!uid) return null
    return query(collection(db, 'households'), where('memberIds', 'array-contains', uid), limit(1))
  })
  const storedHousehold = computed(() => stored.value[0] ?? null)

  const demo = useState<Household | null>('household-demo', () => null)
  const demoView = useState<HouseholdDemoView>('household-demo-view', () => 'owner')

  const household = computed(() => {
    const uid = user.value?.uid
    return storedHousehold.value && uid ? fromDoc(storedHousehold.value, uid) : demo.value
  })
  const isDemo = computed(() => !storedHousehold.value && !!demo.value)
  const loading = computed(() => !user.value || stored.pending.value)
  /** Id du foyer enregistré, jamais celui de la démo. */
  const householdId = computed(() => storedHousehold.value?.id ?? null)
  /** Membres du foyer enregistré, le compte connecté seul sans foyer. */
  const memberIds = computed(() => storedHousehold.value?.memberIds ?? (user.value ? [user.value.uid] : []))

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  /**
   * Dernier `users/{uid}.householdId` vérifié ; `undefined` tant qu'il ne l'est pas. Les règles le lisent pour ouvrir
   * les récipients des autres membres : une requête sur leurs récipients attend qu'il soit à jour (`shared`).
   */
  const pointer = useState<string | null | undefined>('household-pointer', () => undefined)
  const shared = computed(() => !loading.value && !!householdId.value && pointer.value === householdId.value)
  const userRef = (uid: string) => doc(db, 'users', uid)
  const pointerData = (hid: string | null) => ({ householdId: hid ?? deleteField() })

  /**
   * Rattrape le pointeur : foyer créé ou rejoint avant qu'il existe, ou compte retiré du foyer par son propriétaire
   * (qui ne peut pas écrire le document `users` d'un autre).
   */
  watch([loading, householdId], async () => {
    const uid = user.value?.uid
    const hid = householdId.value
    if (loading.value || !uid || pointer.value === hid) return
    try {
      const current = ((await getDoc(userRef(uid))).data() as UserDoc | undefined)?.householdId ?? null
      if (current !== hid) await setDoc(userRef(uid), pointerData(hid), { merge: true })
      pointer.value = hid
    } catch (error) {
      console.error('Foyer non enregistré sur le compte :', error)
    }
  }, { immediate: true })

  /**
   * Réserve dans `tx` un code libre (`inviteCodes/{code}`) pour le foyer `householdId` et le renvoie.
   * Un code déjà pris, ou égal à `avoid`, est retiré au sort.
   */
  async function reserveCode(tx: Transaction, householdId: string, avoid?: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode()
      if (code === avoid) continue
      const ref = doc(db, 'inviteCodes', code)
      if ((await tx.get(ref)).exists()) continue
      tx.set(ref, { householdId, createdAt: serverTimestamp() })
      return code
    }
    throw new Error('Aucun code d\'invitation libre, réessayez.')
  }

  function setDemo(withHousehold: boolean, self: HouseholdMember) {
    demo.value = withHousehold ? demoHousehold(self, demoView.value) : null
  }

  function setDemoView(view: HouseholdDemoView, self: HouseholdMember) {
    demoView.value = view
    demo.value = demoHousehold(self, view)
  }

  /**
   * Crée le foyer avec le compte connecté pour propriétaire et seul membre, et lui réserve un code d'invitation.
   * Transaction : elle échoue hors ligne plutôt que de risquer un code déjà pris.
   */
  async function create(name: string, self: HouseholdMember) {
    const uid = requireUid()
    const ref = doc(collection(db, 'households'))
    await runTransaction(db, async (tx) => {
      const inviteCode = await reserveCode(tx, ref.id)
      tx.set(ref, {
        name,
        ownerId: uid,
        inviteCode,
        memberIds: [uid],
        members: { [uid]: memberEntry(self) },
        createdAt: serverTimestamp(),
      })
      tx.set(userRef(uid), pointerData(ref.id), { merge: true })
    })
    pointer.value = ref.id
    demo.value = null
    // Seul membre, le créateur garde sa liste de courses et ses magasins : ils deviennent ceux du foyer.
    await Promise.all([
      moveShoppingList(db, where('scope', '==', uid), ref.id)
        .catch(error => console.error('Liste de courses non reprise dans le foyer :', error)),
      moveStores(db, uid, ref.id)
        .catch(error => console.error('Magasins non repris dans le foyer :', error)),
    ])
  }

  /**
   * Rejoint le foyer du code (`K7F2QM`) et renvoie son nom. Un non-membre ne peut pas lire le foyer : le code le désigne
   * (`inviteCodes`), et l'entrée ajoutée le recopie pour que les règles le comparent à celui du foyer.
   */
  async function join(code: string, self: HouseholdMember) {
    const uid = requireUid()
    const codeSnap = await getDoc(doc(db, 'inviteCodes', code))
    if (!codeSnap.exists()) throw new Error('Ce code ne correspond à aucun foyer. Vérifiez-le auprès du propriétaire.')
    const ref = doc(db, 'households', (codeSnap.data() as InviteCodeDoc).householdId)
    const batch = writeBatch(db)
    batch.update(ref, {
      memberIds: arrayUnion(uid),
      [`members.${uid}`]: { ...memberEntry(self), inviteCode: code },
    })
    batch.set(userRef(uid), pointerData(ref.id), { merge: true })
    try {
      await batch.commit()
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'permission-denied') {
        throw new Error('Code refusé : il vient peut-être de changer. Demandez le nouveau au propriétaire.')
      }
      throw error
    }
    pointer.value = ref.id
    demo.value = null
    // Ses magasins rejoignent ceux du foyer ; un nom que le foyer a déjà n'est pas repris.
    await moveStores(db, uid, ref.id)
      .catch(error => console.error('Magasins non repris dans le foyer :', error))
    return ((await getDoc(ref)).data() as HouseholdDoc | undefined)?.name ?? ''
  }

  async function rename(name: string) {
    if (isDemo.value) {
      demo.value!.name = name
      return
    }
    const current = storedHousehold.value
    if (current) await updateDoc(doc(db, 'households', current.id), { name })
  }

  /** Remplace le code d'invitation ; l'ancien est libéré. */
  async function regenerateCode() {
    if (isDemo.value) {
      let code = generateInviteCode()
      while (code === demo.value!.inviteCode) code = generateInviteCode()
      demo.value!.inviteCode = code
      return
    }
    const current = storedHousehold.value
    if (!current) return
    await runTransaction(db, async (tx) => {
      const inviteCode = await reserveCode(tx, current.id, current.inviteCode)
      tx.delete(doc(db, 'inviteCodes', current.inviteCode))
      tx.update(doc(db, 'households', current.id), { inviteCode })
    })
  }

  /** Champs qui sortent le membre `id` du foyer. */
  const withoutMember = (id: string) => ({ memberIds: arrayRemove(id), [`members.${id}`]: deleteField() })

  /** Retire un membre (propriétaire seulement) ; son pointeur `users/{uid}.householdId` se rattrape à son retour. */
  async function removeMember(id: string) {
    if (isDemo.value) {
      demo.value!.members = demo.value!.members.filter(m => m.id !== id)
      return
    }
    const current = storedHousehold.value
    if (current) await updateDoc(doc(db, 'households', current.id), withoutMember(id))
  }

  /**
   * Si le propriétaire part, le plus ancien des autres membres le devient ; seul, il supprime le foyer et son code, et
   * reprend sa liste de courses et ses magasins. Sinon ils restent au foyer. Dans la démo, le foyer disparaît pour ce compte.
   */
  async function leave() {
    if (isDemo.value) {
      demo.value = null
      return
    }
    const current = storedHousehold.value
    const uid = requireUid()
    if (!current) return
    if (current.memberIds.length <= 1) {
      await Promise.all([moveShoppingList(db, where('scope', '==', current.id), uid), moveStores(db, current.id, uid)])
    }
    const batch = writeBatch(db)
    batch.set(userRef(uid), pointerData(null), { merge: true })
    if (current.memberIds.length <= 1) {
      batch.delete(doc(db, 'households', current.id))
      batch.delete(doc(db, 'inviteCodes', current.inviteCode))
    } else {
      const heir = current.ownerId === uid ? successorOf(fromDoc(current, uid)) : null
      batch.update(doc(db, 'households', current.id), { ...withoutMember(uid), ...(heir ? { ownerId: heir.id } : {}) })
    }
    await batch.commit()
    pointer.value = null
  }

  return { household, householdId, memberIds, shared, isDemo, loading, demoView, setDemo, setDemoView, create, join, rename, regenerateCode, removeMember, leave }
}
