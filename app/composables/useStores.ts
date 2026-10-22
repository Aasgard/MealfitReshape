import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Store } from '~/types/store'
import { STORE_NAME_MAX, nextStoreColor, storeNameKey, type StoreColor } from '~/utils/stores'

/**
 * Magasins où le foyer fait ses courses (collection `stores`), rattachés à la même liste que les courses : celle du
 * foyer, sinon celle du compte. Ils suivent la liste quand le foyer change (`moveStores`). Hors ligne, les écritures
 * s'affichent tout de suite (cache local de Firestore).
 */
export function useStores() {
  const db = useFirestore()
  const user = useCurrentUser()
  const { householdId, loading: householdLoading } = useHousehold()
  const storesRef = collection(db, 'stores')

  /** Liste lue et écrite : celle du foyer, sinon celle du compte ; `null` tant que le foyer n'est pas connu. */
  const scope = computed(() => {
    const uid = user.value?.uid
    if (!uid || householdLoading.value) return null
    return householdId.value ?? uid
  })

  const stored = useCollection<Store>(() => scope.value ? query(storesRef, where('scope', '==', scope.value)) : null)

  const stores = computed(() => [...stored.value].sort((a, b) =>
    a.order - b.order || (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity)))

  const loading = computed(() => !scope.value || (stored.pending.value && !stored.value.length))

  const requireScope = () => {
    if (!scope.value || !user.value) throw new Error('Les magasins ne sont pas encore chargés.')
    return { scope: scope.value, uid: user.value.uid }
  }

  /** Message d'erreur du nom `name`, ou `undefined` s'il convient ; `exceptId` : le magasin qu'on renomme. */
  function nameError(name: string, exceptId?: string): string | undefined {
    const trimmed = name.trim()
    if (!trimmed) return 'Donnez un nom au magasin.'
    if (trimmed.length > STORE_NAME_MAX) return `${STORE_NAME_MAX} caractères au plus.`
    const twin = stores.value.find(s => s.id !== exceptId && storeNameKey(s.name) === storeNameKey(trimmed))
    return twin ? `« ${twin.name} » est déjà dans la liste.` : undefined
  }

  async function add(name: string) {
    const { scope, uid } = requireScope()
    const order = Math.max(-1, ...stores.value.map(s => s.order)) + 1
    await setDoc(doc(storesRef), {
      scope,
      name: name.trim().replace(/\s+/g, ' '),
      color: nextStoreColor(stores.value),
      order,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const rename = (store: Store, name: string) =>
    updateDoc(doc(storesRef, store.id), { name: name.trim().replace(/\s+/g, ' '), updatedAt: serverTimestamp() })

  const setColor = (store: Store, color: StoreColor) =>
    updateDoc(doc(storesRef, store.id), { color, updatedAt: serverTimestamp() })

  /** Range les magasins dans l'ordre `ordered` ; seuls ceux dont le rang change sont écrits. */
  async function reorder(ordered: Store[]) {
    const batch = writeBatch(db)
    let changed = false
    ordered.forEach((store, order) => {
      if (store.order === order) return
      batch.update(doc(storesRef, store.id), { order, updatedAt: serverTimestamp() })
      changed = true
    })
    if (changed) await batch.commit()
  }

  const remove = (store: Store) => deleteDoc(doc(storesRef, store.id))

  /** Remet un magasin supprimé, sous le même id (« Annuler »). */
  function restore(store: Store) {
    const { id, ...data } = store
    return setDoc(doc(storesRef, id), { ...data, updatedAt: serverTimestamp() })
  }

  return { stores, loading, nameError, add, rename, setColor, reorder, remove, restore }
}
