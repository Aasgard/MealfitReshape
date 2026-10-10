import { collection, deleteField, doc, query, serverTimestamp, updateDoc, where, writeBatch, type WriteBatch } from 'firebase/firestore'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { ShoppingItem, ShoppingItemStatus, ShoppingMealInclusion } from '~/types/shoppingList'
import { planFinish, planItemWrites, type ShoppingCatalog } from '~/utils/shoppingPlan'
import { gramsPerPiece } from '~/utils/shoppingList'

/** Limite d'écritures d'un batch Firestore. */
const BATCH_LIMIT = 500

/** Inclusion à écrire : tout sauf ce que l'écriture ajoute elle-même. */
export type InclusionDraft = Omit<ShoppingMealInclusion, 'id' | 'user' | 'updatedAt'>

/**
 * Liste de courses de l'utilisateur connecté : les articles (collection `shoppingList`) et les repas inclus
 * (`shoppingMeals`) dont ils tirent leurs apports, avec les écritures associées. Hors ligne, les écritures s'affichent
 * tout de suite (cache local de Firestore) et leurs promesses n'aboutissent qu'à la synchronisation.
 */
export const useShoppingList = () => {
  const db = useFirestore()
  const user = useCurrentUser()
  const shoppingListRef = collection(db, 'shoppingList')
  const shoppingMealsRef = collection(db, 'shoppingMeals')

  const items = useCollection<ShoppingItem>(() => {
    const uid = user.value?.uid
    if (!uid) return null
    return query(shoppingListRef, where('user', '==', uid))
  })

  const inclusions = useCollection<ShoppingMealInclusion>(() => {
    const uid = user.value?.uid
    if (!uid) return null
    return query(shoppingMealsRef, where('user', '==', uid))
  })

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  /** Applique `writes` en autant de batchs que nécessaire (un seul, donc atomique, sous 500 écritures). */
  async function commit(writes: ((batch: WriteBatch) => void)[]) {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db)
      for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch)
      await batch.commit()
    }
  }

  const inclusionId = (uid: string, mealId: string) => `${uid}_${mealId}`

  /**
   * Inclut (ou met à jour) les repas `upserts` et retire les inclusions `removals`, puis écrit les écarts d'articles
   * qui en découlent, le tout en une écriture. Renvoie ce qui n'a pas pu être compté (recette, unité introuvables...).
   */
  async function applyInclusions(upserts: InclusionDraft[], removals: ShoppingMealInclusion[], catalog: ShoppingCatalog) {
    const uid = requireUid()
    const upserted: ShoppingMealInclusion[] = upserts.map(draft => ({ ...draft, id: inclusionId(uid, draft.mealId), user: uid }))
    const changedIds = new Set([...upserted.map(i => i.id), ...removals.map(i => i.id)])
    const next = [...inclusions.value.filter(i => !changedIds.has(i.id)), ...upserted]
    const keys = [...upserted, ...removals].map(i => i.key)

    const { writes, skipped } = planItemWrites(keys, next, items.value, catalog)

    const ops: ((batch: WriteBatch) => void)[] = [
      ...upserted.map(({ id, ...data }) => (batch: WriteBatch) => batch.set(doc(shoppingMealsRef, id), { ...data, updatedAt: serverTimestamp() })),
      ...removals.map(inclusion => (batch: WriteBatch) => batch.delete(doc(shoppingMealsRef, inclusion.id))),
      ...writes.map((write) => {
        switch (write.type) {
          case 'update':
            return (batch: WriteBatch) => batch.update(doc(shoppingListRef, write.item.id), { contributions: write.contributions, updatedAt: serverTimestamp() })
          case 'delete':
            return (batch: WriteBatch) => batch.delete(doc(shoppingListRef, write.item.id))
          case 'create': {
            const ingredient = catalog.ingredientsById.get(write.ingredientId)
            const pieceGrams = ingredient ? gramsPerPiece(ingredient) : null
            return (batch: WriteBatch) => batch.set(doc(shoppingListRef), {
              user: uid,
              label: ingredient?.label ?? 'Ingrédient introuvable',
              status: 'toBuy',
              ingredientId: write.ingredientId,
              ...(ingredient?.category?.id ? { categoryId: ingredient.category.id } : {}),
              ...(pieceGrams ? { gramsPerPiece: pieceGrams } : {}),
              contributions: write.contributions,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          }
        }
      }),
    ]
    await commit(ops)
    return skipped
  }

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

  const setStatus = (item: ShoppingItem, status: ShoppingItemStatus) =>
    updateDoc(doc(shoppingListRef, item.id), { status, updatedAt: serverTimestamp() })

  /** Marquage urgent à la main ; `false` retire le champ (l'urgence calculée depuis les besoins reste). */
  const setUrgent = (item: ShoppingItem, urgent: boolean) =>
    updateDoc(doc(shoppingListRef, item.id), { urgent: urgent || deleteField(), updatedAt: serverTimestamp() })

  /** Quantité saisie à la main ; `null` revient à la quantité calculée (ou à aucune, pour un ajout manuel). */
  const setQuantity = (item: ShoppingItem, quantity: string | null) =>
    updateDoc(doc(shoppingListRef, item.id), { quantity: quantity ?? deleteField(), updatedAt: serverTimestamp() })

  /** Retire un article ajouté à la main (ceux venus des menus se retirent en décochant leurs repas). */
  function removeManual(item: ShoppingItem) {
    const batch = writeBatch(db)
    batch.delete(doc(shoppingListRef, item.id))
    return batch.commit()
  }

  /**
   * Fin des courses : supprime ce qui est dans le panier et ce qui était déjà à la maison, et marque « achetés » les
   * repas correspondants (ils ne pourront plus être décochés ni rachetés). Renvoie le nombre d'articles supprimés.
   */
  async function finishShopping(catalog: ShoppingCatalog) {
    const { removed, bought } = planFinish(items.value, inclusions.value, catalog)
    await commit([
      ...removed.map(item => (batch: WriteBatch) => batch.delete(doc(shoppingListRef, item.id))),
      ...bought.map(inclusion => (batch: WriteBatch) => batch.update(doc(shoppingMealsRef, inclusion.id), { state: 'bought', updatedAt: serverTimestamp() })),
    ])
    return removed.length
  }

  /** Repartir de zéro : supprime tous les articles et les repas inclus, sauf la trace de ceux déjà achetés. Renvoie le nombre d'articles. */
  async function clearAll() {
    const allItems = [...items.value]
    await commit([
      ...allItems.map(item => (batch: WriteBatch) => batch.delete(doc(shoppingListRef, item.id))),
      ...inclusions.value
        .filter(inclusion => inclusion.state === 'listed')
        .map(inclusion => (batch: WriteBatch) => batch.delete(doc(shoppingMealsRef, inclusion.id))),
    ])
    return allItems.length
  }

  /** Supprime les inclusions des repas d'avant `beforeDay` (`yyyy-MM-dd`) : plus attendus, ils n'ont plus rien à garder. */
  function pruneInclusions(beforeDay: string) {
    const old = inclusions.value.filter(inclusion => inclusion.date < beforeDay)
    if (!old.length) return Promise.resolve()
    return commit(old.map(inclusion => (batch: WriteBatch) => batch.delete(doc(shoppingMealsRef, inclusion.id))))
  }

  return {
    items,
    inclusions,
    applyInclusions,
    addManual,
    setStatus,
    setUrgent,
    setQuantity,
    removeManual,
    finishShopping,
    clearAll,
    pruneInclusions,
  }
}
