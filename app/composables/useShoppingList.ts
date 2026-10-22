import { arrayRemove, arrayUnion, collection, deleteField, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch, type Firestore, type QueryFieldFilterConstraint, type WriteBatch } from 'firebase/firestore'
import { useLocalStorage } from '@vueuse/core'
import { useCollection, useCurrentUser, useFirestore } from 'vuefire'
import type { ShoppingItem, ShoppingItemStatus, ShoppingMealInclusion } from '~/types/shoppingList'
import { planFinish, planItemWrites, type ShoppingCatalog } from '~/utils/shoppingPlan'
import { gramsPerPiece } from '~/utils/shoppingList'

/** Limite d'écritures d'un batch Firestore. */
const BATCH_LIMIT = 500

/** Inclusion à écrire : tout sauf ce que l'écriture ajoute elle-même. */
export type InclusionDraft = Omit<ShoppingMealInclusion, 'id' | 'scope' | 'updatedAt'>

const inclusionId = (scope: string, mealId: string) => `${scope}_${mealId}`

/** Applique `writes` en autant de batchs que nécessaire (un seul, donc atomique, sous 500 écritures). */
async function commitWrites(db: Firestore, writes: ((batch: WriteBatch) => void)[]) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch)
    await batch.commit()
  }
}

/**
 * Rattache à la liste `to` (foyer ou compte) les articles et les repas inclus que retient `filter` ; `manualOnly` ne
 * reprend que les ajouts manuels. L'id d'une inclusion contient sa liste : elle est recréée sous le nouvel id.
 * Les documents d'avant les listes de foyer (rattachés par `user`) passent au passage à `scope` / `addedBy`.
 */
export async function moveShoppingList(db: Firestore, filter: QueryFieldFilterConstraint, to: string, { manualOnly = false } = {}) {
  const [items, inclusions] = await Promise.all([
    getDocs(query(collection(db, 'shoppingList'), filter)),
    manualOnly ? null : getDocs(query(collection(db, 'shoppingMeals'), filter)),
  ])
  const writes: ((batch: WriteBatch) => void)[] = []
  for (const snap of items.docs) {
    const { user, ingredientId } = snap.data()
    if (manualOnly && ingredientId) continue
    const legacy = user ? { user: deleteField(), ...(ingredientId ? {} : { addedBy: user }) } : {}
    writes.push(batch => batch.update(snap.ref, { scope: to, ...legacy }))
  }
  for (const snap of inclusions?.docs ?? []) {
    const { user: _legacy, ...data } = snap.data()
    const ref = doc(db, 'shoppingMeals', inclusionId(to, data.mealId))
    writes.push(batch => batch.set(ref, { ...data, scope: to }))
    if (ref.id !== snap.id) writes.push(batch => batch.delete(snap.ref))
  }
  await commitWrites(db, writes)
}

/**
 * Liste de courses du foyer du compte connecté (la sienne sans foyer) : les articles (collection `shoppingList`) et les
 * repas inclus (`shoppingMeals`) dont ils tirent leurs apports, avec les écritures associées. Tous les membres lisent et
 * écrivent la même liste. Hors ligne, les écritures s'affichent tout de suite (cache local de Firestore) et leurs
 * promesses n'aboutissent qu'à la synchronisation.
 */
export const useShoppingList = () => {
  const db = useFirestore()
  const user = useCurrentUser()
  const { householdId, loading: householdLoading } = useHousehold()
  const shoppingListRef = collection(db, 'shoppingList')
  const shoppingMealsRef = collection(db, 'shoppingMeals')
  /** Magasins du foyer : un article venu d'un ingrédient reprend ceux qu'on a retenus pour lui. */
  const shoppingStores = useStores()

  /** Liste lue et écrite : celle du foyer, sinon celle du compte ; `null` tant que le foyer n'est pas connu. */
  const scope = computed(() => {
    const uid = user.value?.uid
    if (!uid || householdLoading.value) return null
    return householdId.value ?? uid
  })

  const items = useCollection<ShoppingItem>(() => scope.value ? query(shoppingListRef, where('scope', '==', scope.value)) : null)

  const inclusions = useCollection<ShoppingMealInclusion>(() => scope.value ? query(shoppingMealsRef, where('scope', '==', scope.value)) : null)

  /** Articles et inclusions d'avant les listes de foyer, rattachés par `user` : repris une fois dans la liste courante. */
  const legacyMoved = useState('shopping-legacy-moved', () => false)
  watch(scope, (current) => {
    const uid = user.value?.uid
    if (!current || !uid || legacyMoved.value) return
    legacyMoved.value = true
    moveShoppingList(db, where('user', '==', uid), current).catch((error) => {
      legacyMoved.value = false
      console.error('Ancienne liste de courses non reprise :', error)
    })
  }, { immediate: true })

  const requireUid = () => {
    const uid = user.value?.uid
    if (!uid) throw new Error('Vous devez être connecté.')
    return uid
  }

  const requireScope = () => {
    if (!scope.value) throw new Error('La liste de courses n\'est pas encore chargée.')
    return scope.value
  }

  const commit = (writes: ((batch: WriteBatch) => void)[]) => commitWrites(db, writes)

  /**
   * Inclut (ou met à jour) les repas `upserts` et retire les inclusions `removals`, puis écrit les écarts d'articles
   * qui en découlent, le tout en une écriture. Renvoie ce qui n'a pas pu être compté (recette, unité introuvables...).
   */
  async function applyInclusions(upserts: InclusionDraft[], removals: ShoppingMealInclusion[], catalog: ShoppingCatalog) {
    const scope = requireScope()
    const upserted: ShoppingMealInclusion[] = upserts.map(draft => ({ ...draft, id: inclusionId(scope, draft.mealId), scope }))
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
            const storeIds = shoppingStores.storesForIngredient(write.ingredientId)
            return (batch: WriteBatch) => batch.set(doc(shoppingListRef), {
              scope,
              label: ingredient?.label ?? 'Ingrédient introuvable',
              status: 'toBuy',
              ingredientId: write.ingredientId,
              ...(ingredient?.category?.id ? { categoryId: ingredient.category.id } : {}),
              ...(pieceGrams ? { gramsPerPiece: pieceGrams } : {}),
              ...(storeIds.length ? { storeIds } : {}),
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

  /**
   * Ajoute un article saisi à la main, à acheter, avec quantité libre, marquage urgent, échéance et magasins facultatifs
   * (vides : partout).
   */
  function addManual(label: string, options: { categoryId?: string, quantity?: string, urgent?: boolean, neededBy?: string, linkedIngredientId?: string, storeIds?: string[] } = {}) {
    const { categoryId, quantity, urgent, neededBy, linkedIngredientId } = options
    const storeIds = shoppingStores.knownStoreIds(options.storeIds)
    const scope = requireScope()
    const batch = writeBatch(db)
    batch.set(doc(shoppingListRef), {
      scope,
      addedBy: requireUid(),
      label,
      status: 'toBuy',
      ...(categoryId ? { categoryId } : {}),
      ...(quantity ? { quantity } : {}),
      ...(urgent ? { urgent } : {}),
      ...(neededBy ? { neededBy } : {}),
      ...(linkedIngredientId ? { linkedIngredientId } : {}),
      ...(storeIds.length ? { storeIds } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return batch.commit()
  }

  /**
   * Ajoute le complément d'un ingrédient (« Vérifier un article ») : un ajout manuel, à acheter, rangé dans le rayon de
   * l'ingrédient. S'il y a déjà un complément à acheter, il grossit (échéance la plus proche, urgent s'il l'un l'est).
   */
  function addComplement(
    ingredient: { id: string, label: string, categoryId?: string },
    amount: { grams: number, milliliters: number },
    options: { quantity: string, neededBy: string, urgent: boolean },
  ) {
    const scope = requireScope()
    const existing = items.value.find(item => item.status === 'toBuy' && item.complementOf?.ingredientId === ingredient.id)
    if (existing?.complementOf) {
      const neededBy = existing.neededBy && existing.neededBy < options.neededBy ? existing.neededBy : options.neededBy
      return updateDoc(doc(shoppingListRef, existing.id), {
        complementOf: {
          ingredientId: ingredient.id,
          grams: existing.complementOf.grams + amount.grams,
          milliliters: existing.complementOf.milliliters + amount.milliliters,
        },
        quantity: options.quantity,
        neededBy,
        ...(options.urgent ? { urgent: true } : {}),
        updatedAt: serverTimestamp(),
      })
    }
    const storeIds = shoppingStores.storesForIngredient(ingredient.id)
    const batch = writeBatch(db)
    batch.set(doc(shoppingListRef), {
      scope,
      addedBy: requireUid(),
      label: `${ingredient.label} (complément)`,
      status: 'toBuy',
      ...(ingredient.categoryId ? { categoryId: ingredient.categoryId } : {}),
      quantity: options.quantity,
      neededBy: options.neededBy,
      ...(options.urgent ? { urgent: true } : {}),
      complementOf: { ingredientId: ingredient.id, ...amount },
      ...(storeIds.length ? { storeIds } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return batch.commit()
  }

  /** `storeId` : magasin où l'article est mis au panier (`inCart`) ; absent, ou autre statut, le champ est retiré. */
  const setStatus = (item: ShoppingItem, status: ShoppingItemStatus, storeId?: string | null) =>
    updateDoc(doc(shoppingListRef, item.id), {
      status,
      inCartAt: status === 'inCart' && storeId ? storeId : deleteField(),
      updatedAt: serverTimestamp(),
    })

  /**
   * Ajoute (`on`) ou retire un magasin de plusieurs articles, en une écriture. Ajouter un magasin à un article
   * « partout » le restreint à ce magasin ; retirer le dernier le rend « partout ».
   */
  function setItemsStore(targets: ShoppingItem[], storeId: string, on: boolean) {
    return commit(targets.map(item => (batch: WriteBatch) => batch.update(doc(shoppingListRef, item.id), {
      storeIds: on ? arrayUnion(storeId) : arrayRemove(storeId),
      updatedAt: serverTimestamp(),
    })))
  }

  /** Remplace les magasins de plusieurs articles, en une écriture ; vide : partout. */
  function setItemsStores(changes: { item: ShoppingItem, storeIds: string[] }[]) {
    return commit(changes.map(({ item, storeIds }) => (batch: WriteBatch) => batch.update(doc(shoppingListRef, item.id), {
      storeIds: storeIds.length ? storeIds : deleteField(),
      updatedAt: serverTimestamp(),
    })))
  }

  /** Marquage urgent à la main ; `false` retire le champ (l'urgence calculée depuis les besoins reste). */
  const setUrgent = (item: ShoppingItem, urgent: boolean) =>
    updateDoc(doc(shoppingListRef, item.id), { urgent: urgent || deleteField(), updatedAt: serverTimestamp() })

  /** Échéance d'un ajout manuel (`yyyy-MM-dd`) ; `null` la retire. */
  const setNeededBy = (item: ShoppingItem, neededBy: string | null) =>
    updateDoc(doc(shoppingListRef, item.id), { neededBy: neededBy ?? deleteField(), updatedAt: serverTimestamp() })

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
   * `storeId` : seul le panier de ce magasin est soldé ; les paniers en cours ailleurs restent.
   */
  async function finishShopping(catalog: ShoppingCatalog, storeId?: string | null) {
    const { removed, bought } = planFinish(items.value, inclusions.value, catalog, storeId)
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

  /**
   * Un repas d'une recette mis au stock : sa présence dans la liste passe au surplus de sa fournée (repas fictif
   * `toMealId`, au jour de cuisine `cookDay`), parts ajoutées à celles du surplus. Les ingrédients restent comptés, ou
   * achetés. Rien ne bouge si les deux ne sont pas au même stade (l'un acheté, l'autre non).
   */
  async function moveInclusion(fromMealId: string, toMealId: string, cookDay: string, catalog: ShoppingCatalog) {
    await inclusions.promise.value
    const from = inclusions.value.find(inclusion => inclusion.mealId === fromMealId)
    if (!from) return
    const to = inclusions.value.find(inclusion => inclusion.mealId === toMealId)
    if (to && to.state !== from.state) return
    const merged: InclusionDraft = {
      mealId: toMealId,
      date: to?.date ?? cookDay,
      key: from.key,
      ...(from.recipeId ? { recipeId: from.recipeId } : {}),
      parts: (to?.parts ?? 0) + (from.parts ?? 0),
      state: from.state,
    }
    await applyInclusions([merged], [from], catalog)
  }

  return {
    scope,
    stores: shoppingStores,
    items,
    inclusions,
    applyInclusions,
    moveInclusion,
    addManual,
    addComplement,
    setStatus,
    setItemsStore,
    setItemsStores,
    setUrgent,
    setNeededBy,
    setQuantity,
    removeManual,
    finishShopping,
    clearAll,
    pruneInclusions,
  }
}

/**
 * En foyer, les ajouts manuels restés sur la liste du compte (d'avant son arrivée) : proposés une fois à la liste du
 * foyer. Ceux venus des menus ne sont pas repris, leurs repas se cochent dans la liste du foyer. Les laisser de côté
 * est retenu sur l'appareil ; ils reviennent en quittant le foyer.
 */
export const usePersonalShoppingItems = () => {
  const db = useFirestore()
  const user = useCurrentUser()
  const { householdId } = useHousehold()

  const items = useCollection<ShoppingItem>(() => {
    const uid = user.value?.uid
    if (!uid || !householdId.value) return null
    return query(collection(db, 'shoppingList'), where('scope', '==', uid))
  })
  const manualItems = computed(() => items.value.filter(item => !item.ingredientId && item.status !== 'inCart'))

  /** Foyer pour lequel ils ont été laissés de côté. */
  const dismissedFor = useLocalStorage('grocery-personal-dismissed', '')
  const offered = computed(() => !!householdId.value && dismissedFor.value !== householdId.value ? manualItems.value : [])

  function adopt() {
    const uid = user.value?.uid
    if (!uid || !householdId.value) return Promise.resolve()
    return moveShoppingList(db, where('scope', '==', uid), householdId.value, { manualOnly: true })
  }

  function dismiss() {
    if (householdId.value) dismissedFor.value = householdId.value
  }

  return { offered, adopt, dismiss }
}
