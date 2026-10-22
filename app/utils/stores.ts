import { collection, getDocs, query, serverTimestamp, where, writeBatch, type Firestore } from 'firebase/firestore'
import type { Store } from '~/types/store'

/**
 * Couleurs des noms de magasin : une teinte d'identité, comme une enseigne, qui ne sert qu'aux magasins.
 * `-700` en clair et `-400` en sombre gardent au moins 4,5:1 sur le fond ; pas d'indigo, réservé à l'interaction.
 * `text` colore le nom, et la pastille (`bg-current`) dans le même élément.
 */
export const STORE_COLORS = [
  { key: 'red', label: 'Rouge', text: 'text-red-700 dark:text-red-400' },
  { key: 'orange', label: 'Orange', text: 'text-orange-700 dark:text-orange-400' },
  { key: 'amber', label: 'Ambre', text: 'text-amber-700 dark:text-amber-400' },
  { key: 'green', label: 'Vert', text: 'text-green-700 dark:text-green-400' },
  { key: 'teal', label: 'Sarcelle', text: 'text-teal-700 dark:text-teal-400' },
  { key: 'cyan', label: 'Cyan', text: 'text-cyan-700 dark:text-cyan-400' },
  { key: 'blue', label: 'Bleu', text: 'text-blue-700 dark:text-blue-400' },
  { key: 'violet', label: 'Violet', text: 'text-violet-700 dark:text-violet-400' },
  { key: 'pink', label: 'Rose', text: 'text-pink-700 dark:text-pink-400' },
  { key: 'slate', label: 'Ardoise', text: 'text-slate-700 dark:text-slate-400' },
] as const

export type StoreColor = typeof STORE_COLORS[number]['key']

const COLOR_BY_KEY = Object.fromEntries(STORE_COLORS.map(c => [c.key, c])) as Record<StoreColor, typeof STORE_COLORS[number]>

/** Couleur d'un magasin ; une clé inconnue (palette retouchée depuis) retombe sur l'ardoise. */
export const storeColor = (key: string) => COLOR_BY_KEY[key as StoreColor] ?? COLOR_BY_KEY.slate

export const STORE_NAME_MAX = 30

/** Clé de comparaison des noms : « Marché », « marche » et « MARCHÉ » sont le même magasin. */
export const storeNameKey = (name: string) =>
  name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Première couleur que n'a encore aucun magasin ; toutes prises, on reprend la palette dans l'ordre. */
export function nextStoreColor(stores: Pick<Store, 'color'>[]): StoreColor {
  const used = new Set(stores.map(s => s.color))
  return STORE_COLORS.find(c => !used.has(c.key))?.key ?? STORE_COLORS[stores.length % STORE_COLORS.length]!.key
}

/**
 * Rattache à la liste `to` (foyer ou compte) les magasins de la liste `from`, à la suite des siens. Un magasin dont le
 * nom existe déjà dans `to` est supprimé : celui de `to` le remplace.
 */
export async function moveStores(db: Firestore, from: string, to: string) {
  const ref = collection(db, 'stores')
  const [moving, staying] = await Promise.all([
    getDocs(query(ref, where('scope', '==', from))),
    getDocs(query(ref, where('scope', '==', to))),
  ])
  if (moving.empty) return
  const taken = new Set(staying.docs.map(snap => storeNameKey(snap.data().name)))
  let order = Math.max(-1, ...staying.docs.map(snap => snap.data().order ?? 0)) + 1
  const batch = writeBatch(db)
  const sorted = [...moving.docs].sort((a, b) => (a.data().order ?? 0) - (b.data().order ?? 0))
  for (const snap of sorted) {
    const key = storeNameKey(snap.data().name)
    if (taken.has(key)) {
      batch.delete(snap.ref)
      continue
    }
    taken.add(key)
    batch.update(snap.ref, { scope: to, order: order++, updatedAt: serverTimestamp() })
  }
  await batch.commit()
}
