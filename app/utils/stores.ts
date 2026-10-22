import { arrayUnion, collection, getDocs, query, serverTimestamp, where, writeBatch, type Firestore } from 'firebase/firestore'
import type { Store } from '~/types/store'

/**
 * Couleurs des magasins : une teinte d'identité, comme une enseigne, qui ne sert qu'aux magasins. Six teintes douces
 * (rouge, orange, jaune, vert, bleu, violet), sans indigo, réservé à l'interaction.
 * - `dot` : la teinte claire et peu saturée des pastilles, seule marque de couleur d'un magasin (son nom reste en
 *   encre neutre), cernée d'un filet de sa teinte pour rester visible sur fond clair ; un peu plus foncée en sombre ;
 * - `text` : la même teinte, soutenue, pour l'anneau qui marque la couleur choisie dans les réglages.
 */
export const STORE_COLORS = [
  {
    key: 'red',
    label: 'Rouge',
    text: 'text-[oklch(52%_0.12_25)] dark:text-[oklch(80%_0.08_25)]',
    dot: 'bg-[oklch(86%_0.07_25)] outline-[oklch(52%_0.12_25/0.35)] dark:bg-[oklch(55%_0.09_25)] dark:outline-transparent',
  },
  {
    key: 'orange',
    label: 'Orange',
    text: 'text-[oklch(54%_0.11_50)] dark:text-[oklch(82%_0.08_55)]',
    dot: 'bg-[oklch(87%_0.075_55)] outline-[oklch(54%_0.11_50/0.35)] dark:bg-[oklch(60%_0.09_55)] dark:outline-transparent',
  },
  {
    key: 'yellow',
    label: 'Jaune',
    text: 'text-[oklch(53%_0.1_85)] dark:text-[oklch(86%_0.09_95)]',
    dot: 'bg-[oklch(92%_0.09_95)] outline-[oklch(53%_0.1_85/0.35)] dark:bg-[oklch(66%_0.09_95)] dark:outline-transparent',
  },
  {
    key: 'green',
    label: 'Vert',
    text: 'text-[oklch(51%_0.09_150)] dark:text-[oklch(82%_0.08_150)]',
    dot: 'bg-[oklch(87%_0.07_150)] outline-[oklch(51%_0.09_150/0.35)] dark:bg-[oklch(57%_0.08_150)] dark:outline-transparent',
  },
  {
    key: 'blue',
    label: 'Bleu',
    text: 'text-[oklch(50%_0.11_250)] dark:text-[oklch(80%_0.07_245)]',
    dot: 'bg-[oklch(86%_0.06_245)] outline-[oklch(50%_0.11_250/0.35)] dark:bg-[oklch(55%_0.08_245)] dark:outline-transparent',
  },
  {
    key: 'violet',
    label: 'Violet',
    text: 'text-[oklch(50%_0.12_300)] dark:text-[oklch(80%_0.08_300)]',
    dot: 'bg-[oklch(85%_0.07_300)] outline-[oklch(50%_0.12_300/0.35)] dark:bg-[oklch(55%_0.09_300)] dark:outline-transparent',
  },
] as const

export type StoreColor = typeof STORE_COLORS[number]['key']

const COLOR_BY_KEY = Object.fromEntries(STORE_COLORS.map(c => [c.key, c])) as Record<StoreColor, typeof STORE_COLORS[number]>

/** Clés de l'ancienne palette (dix teintes), ramenées à la plus proche des six. */
const LEGACY_COLORS: Record<string, StoreColor> = { amber: 'yellow', teal: 'green', cyan: 'blue', pink: 'red', slate: 'blue' }

/** Couleur d'un magasin ; une ancienne clé retombe sur la teinte la plus proche, une clé inconnue sur le bleu. */
export const storeColor = (key: string) =>
  COLOR_BY_KEY[key as StoreColor] ?? COLOR_BY_KEY[LEGACY_COLORS[key] ?? 'blue']

export const STORE_NAME_MAX = 30

/** Clé de comparaison des noms : « Marché », « marche » et « MARCHÉ » sont le même magasin. */
export const storeNameKey = (name: string) =>
  name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Première couleur que n'a encore aucun magasin ; toutes prises, on reprend la palette dans l'ordre. */
export function nextStoreColor(stores: Pick<Store, 'color'>[]): StoreColor {
  const used = new Set(stores.map(s => storeColor(s.color).key))
  return STORE_COLORS.find(c => !used.has(c.key))?.key ?? STORE_COLORS[stores.length % STORE_COLORS.length]!.key
}

/**
 * Rattache à la liste `to` (foyer ou compte) les magasins de la liste `from`, à la suite des siens. Un magasin dont le
 * nom existe déjà dans `to` est supprimé : celui de `to` le remplace et reprend ses ingrédients.
 */
export async function moveStores(db: Firestore, from: string, to: string) {
  const ref = collection(db, 'stores')
  const [moving, staying] = await Promise.all([
    getDocs(query(ref, where('scope', '==', from))),
    getDocs(query(ref, where('scope', '==', to))),
  ])
  if (moving.empty) return
  const taken = new Set(staying.docs.map(snap => storeNameKey(snap.data().name)))
  const stayingByKey = new Map(staying.docs.map(snap => [storeNameKey(snap.data().name), snap.ref]))
  let order = Math.max(-1, ...staying.docs.map(snap => snap.data().order ?? 0)) + 1
  const batch = writeBatch(db)
  const sorted = [...moving.docs].sort((a, b) => (a.data().order ?? 0) - (b.data().order ?? 0))
  for (const snap of sorted) {
    const key = storeNameKey(snap.data().name)
    if (taken.has(key)) {
      // Les ingrédients qu'on y achetait rejoignent la mémoire du magasin du même nom.
      const ingredientIds: string[] = snap.data().ingredientIds ?? []
      const twin = stayingByKey.get(key)
      if (twin && ingredientIds.length) batch.update(twin, { ingredientIds: arrayUnion(...ingredientIds), updatedAt: serverTimestamp() })
      batch.delete(snap.ref)
      continue
    }
    taken.add(key)
    batch.update(snap.ref, { scope: to, order: order++, updatedAt: serverTimestamp() })
  }
  await batch.commit()
}
