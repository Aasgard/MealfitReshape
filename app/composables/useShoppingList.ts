import { collection, deleteField, doc, query, serverTimestamp, updateDoc, where, writeBatch, type WriteBatch } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { Ingredient } from '~/types/ingredient'
import type { ShoppingItem, ShoppingItemStatus } from '~/types/shoppingList'
import { compareShoppingSources, gramsPerPiece, type ShoppingListItem } from '~/utils/shoppingList'

/** Limite d'écritures d'un batch Firestore. */
const BATCH_LIMIT = 500

/**
 * Liste de courses de l'utilisateur connecté (collection Firestore `shoppingList`, un document par article) et écritures
 * associées. Hors ligne, les écritures s'affichent tout de suite (cache local de Firestore) et leurs promesses
 * n'aboutissent qu'à la synchronisation.
 */
export const useShoppingList = () => {
  const db = useFirestore()
  const user = useCurrentUser()
  const shoppingListRef = collection(db, 'shoppingList')

  const items = useCollection<ShoppingItem>(() => {
    const uid = user.value?.uid
    if (!uid) return null
    return query(shoppingListRef, where('user', '==', uid))
  })

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  /** Applique `writes` en autant de batchs que nécessaire. */
  async function commit(writes: ((batch: WriteBatch) => void)[]) {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db)
      for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch)
      await batch.commit()
    }
  }

  const deleteItems = (toDelete: ShoppingItem[]) =>
    commit(toDelete.map(item => batch => batch.delete(doc(shoppingListRef, item.id))))

  /** Ajoute un article saisi à la main, à acheter, avec une quantité libre facultative. */
  function addManual(label: string, categoryId?: string, quantity?: string) {
    const uid = requireUid()
    const batch = writeBatch(db)
    batch.set(doc(shoppingListRef), {
      user: uid,
      label,
      status: 'toBuy',
      ...(categoryId ? { categoryId } : {}),
      ...(quantity ? { quantity } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return batch.commit()
  }

  /**
   * Ajoute les ingrédients des menus. Un ingrédient encore à acheter dans la liste reçoit les nouvelles quantités et
   * sources ; sinon (absent, déjà à la maison, dans le panier ou de quantité saisie à la main) il est ajouté comme
   * nouvel article.
   * Renvoie le nombre d'articles créés et complétés.
   */
  async function addFromMenus(toAdd: ShoppingListItem[], ingredientsById: Map<string, Ingredient>) {
    const uid = requireUid()
    const pendingByIngredient = new Map(
      items.value
        .filter(item => item.status === 'toBuy' && item.ingredientId && !item.quantity)
        .map(item => [item.ingredientId!, item])
    )

    let created = 0
    let merged = 0
    const writes = toAdd.map((added) => {
      const existing = pendingByIngredient.get(added.ingredientId)
      const grams = (existing?.grams ?? 0) + added.grams
      const milliliters = (existing?.milliliters ?? 0) + added.milliliters
      const ingredient = ingredientsById.get(added.ingredientId)
      const pieceGrams = ingredient ? gramsPerPiece(ingredient) : null
      // Pièces recalculées sur le total : deux fois 0,5 pièce font 1 pièce, pas 2.
      const pieces = pieceGrams && grams > 0 ? Math.ceil(grams / pieceGrams - 1e-6) : undefined
      const sources = [...new Set([...(existing?.sources ?? []), ...added.sources])].sort(compareShoppingSources)
      const quantities = {
        ...(grams > 0 ? { grams } : {}),
        ...(milliliters > 0 ? { milliliters } : {}),
        ...(pieces ? { pieces } : {}),
        sources,
        updatedAt: serverTimestamp(),
      }

      if (existing) {
        merged++
        return (batch: WriteBatch) => batch.update(doc(shoppingListRef, existing.id), quantities)
      }
      created++
      return (batch: WriteBatch) => batch.set(doc(shoppingListRef), {
        user: uid,
        label: added.label,
        status: 'toBuy',
        ingredientId: added.ingredientId,
        ...(added.category?.id ? { categoryId: added.category.id } : {}),
        ...quantities,
        createdAt: serverTimestamp(),
      })
    })

    await commit(writes)
    return { created, merged }
  }

  const setStatus = (item: ShoppingItem, status: ShoppingItemStatus) =>
    updateDoc(doc(shoppingListRef, item.id), { status, updatedAt: serverTimestamp() })

  /** Quantité saisie à la main ; `null` revient à la quantité calculée depuis les menus (ou à aucune, pour un ajout manuel). */
  const setQuantity = (item: ShoppingItem, quantity: string | null) =>
    updateDoc(doc(shoppingListRef, item.id), { quantity: quantity ?? deleteField(), updatedAt: serverTimestamp() })

  /** Fin des courses : supprime ce qui est dans le panier et ce qui était déjà à la maison. Renvoie le nombre d'articles supprimés. */
  async function finishShopping() {
    const done = items.value.filter(item => item.status !== 'toBuy')
    await deleteItems(done)
    return done.length
  }

  /** Supprime tous les articles. Renvoie leur nombre. */
  async function clearAll() {
    const all = [...items.value]
    await deleteItems(all)
    return all.length
  }

  return { items, addManual, addFromMenus, setStatus, setQuantity, finishShopping, clearAll }
}
