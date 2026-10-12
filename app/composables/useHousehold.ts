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

const today = () => new Date().toISOString().slice(0, 10)

const CAMILLE = { id: 'demo-camille', name: 'Camille Laurent', email: 'camille.laurent@exemple.fr' }
const HUGO = { id: 'demo-hugo', name: 'Hugo Martin', email: 'hugo.martin@exemple.fr' }

/** Foyer « Maison » de la maquette, vu par son propriétaire (le compte connecté) ou par un membre (propriétaire : Camille). */
function demoHousehold(self: HouseholdMember, view: HouseholdDemoView): Household {
  const base = { name: 'Maison', createdAt: '2026-03-04', inviteCode: 'K7F2QM' }
  return view === 'owner'
    ? {
        ...base,
        ownerId: SELF_ID,
        members: [
          { ...self, id: SELF_ID, joinedAt: '2026-03-04' },
          { ...CAMILLE, joinedAt: '2026-03-11' },
          { ...HUGO, joinedAt: '2026-06-18' },
        ],
      }
    : {
        ...base,
        ownerId: CAMILLE.id,
        members: [
          { ...CAMILLE, joinedAt: '2026-03-04' },
          { ...self, id: SELF_ID, joinedAt: '2026-05-02' },
          { ...HUGO, joinedAt: '2026-06-18' },
        ],
      }
}

/** Données partagées par le foyer, chiffres de démonstration. */
export const HOUSEHOLD_SHARED = [
  { key: 'menus', label: 'Menus de la semaine', icon: 'i-lucide-calendar-days', to: '/dashboard/menus', value: 19, unit: 'repas', hint: 'Un seul planning, modifiable par tous.' },
  { key: 'courses', label: 'Liste de courses', icon: 'i-lucide-shopping-cart', to: '/dashboard/liste-courses', value: 23, unit: 'articles', hint: 'Cochés par celui ou celle qui fait les courses.' },
  { key: 'recettes', label: 'Recettes et ingrédients privés', icon: 'i-lucide-chef-hat', to: '/dashboard/recipes', value: 12, unit: 'recettes', extra: '5 ingrédients', hint: 'Les entrées « Privé » sont visibles par le foyer.' },
  { key: 'stock', label: 'Stock de plats préparés', icon: 'i-lucide-refrigerator', to: '/dashboard/stock', value: 7, unit: 'parts', hint: 'Au frigo et au congélateur, pour tout le monde.' },
] as const

/**
 * Foyer du compte connecté (un seul au plus). Maquette : état en mémoire, membres fictifs.
 * `self` fournit le compte connecté (id `SELF_ID`).
 */
export function useHousehold() {
  const household = useState<Household | null>('household', () => null)
  const demoView = useState<HouseholdDemoView>('household-demo-view', () => 'owner')
  const demoSeeded = useState('household-demo-seeded', () => false)

  /** Premier passage : la maquette s'ouvre sur un foyer rempli, vu par son propriétaire. */
  function seed(self: HouseholdMember) {
    if (demoSeeded.value) return
    demoSeeded.value = true
    household.value = demoHousehold(self, demoView.value)
  }

  function setDemo(withHousehold: boolean, self: HouseholdMember) {
    household.value = withHousehold ? demoHousehold(self, demoView.value) : null
  }

  function setDemoView(view: HouseholdDemoView, self: HouseholdMember) {
    demoView.value = view
    household.value = demoHousehold(self, view)
  }

  /** Créer un foyer en fait le propriétaire. */
  function create(name: string, self: HouseholdMember) {
    demoView.value = 'owner'
    household.value = {
      name,
      createdAt: today(),
      inviteCode: generateInviteCode(),
      ownerId: SELF_ID,
      members: [{ ...self, id: SELF_ID, joinedAt: today() }],
    }
  }

  /** Maquette : tout code bien formé mène au foyer de démonstration, comme simple membre arrivé aujourd'hui. */
  function join(self: HouseholdMember) {
    demoView.value = 'member'
    const demo = demoHousehold(self, 'member')
    household.value = { ...demo, members: demo.members.map(m => (m.id === SELF_ID ? { ...m, joinedAt: today() } : m)) }
  }

  function rename(name: string) {
    if (household.value) household.value.name = name
  }

  function regenerateCode() {
    if (!household.value) return
    let code = generateInviteCode()
    while (code === household.value.inviteCode) code = generateInviteCode()
    household.value.inviteCode = code
  }

  function removeMember(id: string) {
    if (household.value) household.value.members = household.value.members.filter(m => m.id !== id)
  }

  /**
   * Si le propriétaire part, le plus ancien des autres membres le devient ; seul, il supprime le foyer.
   * Dans la maquette, le foyer disparaît de toute façon pour ce compte.
   */
  function leave() {
    household.value = null
  }

  return { household, demoView, seed, setDemo, setDemoView, create, join, rename, regenerateCode, removeMember, leave }
}
