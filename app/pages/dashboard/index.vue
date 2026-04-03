<script setup lang="ts">
import { addDoc, collection, doc, getDocs, or, orderBy, query, Timestamp, where } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import fakeRecipe from '~/data/fakeRecipe.json'

useSeoMeta({
  title: 'Dashboard - Accueil - Mealfit',
  description: 'Dashboard - Accueil - Mealfit',
})

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const seedingRecipe = ref(false)

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function variationKeys(ing: Ingredient): string[] {
  return ing.variations ? Object.keys(ing.variations) : []
}

async function seedFakeRecipe() {
  if (!user.value) {
    toast.add({
      title: 'Connexion requise',
      description: 'Connectez-vous pour ajouter une recette.',
      color: 'warning',
    })
    return
  }
  seedingRecipe.value = true
  try {
    const snap = await getDocs(
      query(
        collection(db, 'ingredients'),
        or(
          where('owner', '==', user.value.uid),
          where('owner', '==', null),
        ),
        orderBy('label', 'asc'),
      ),
    )
    const fromDb: Ingredient[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient))

    if (fromDb.length < 3) {
      toast.add({
        title: 'Pas assez d’ingrédients',
        description:
          'Il faut au moins 3 ingrédients dans Firestore. Ajoutez-en depuis la page Ingrédients.',
        color: 'warning',
      })
      return
    }

    const targetCount = Math.min(
      Math.floor(Math.random() * 6) + 3,
      fromDb.length,
    )
    const picked = shuffle(fromDb).slice(0, targetCount)

    /** Parfois `null` à la place de l’id de variation (pas de portion précise). */
    const nullVariationProbability = 0.9

    const ingredients = picked.map((ing) => {
      const keys = variationKeys(ing)
      const useId = keys.length > 0 && Math.random() >= nullVariationProbability
      const variation = useId ? keys[Math.floor(Math.random() * keys.length)]! : null
      const quantity = Math.floor(Math.random() * 5) + 1
      return { ingredientRef: doc(db, 'ingredients', ing.id), quantity, variation }
    })

    const now = Timestamp.now()
    const { id: _omitId, createdAt: _c, updatedAt: _u, ingredients: _ing, ...meta } = fakeRecipe

    await addDoc(collection(db, 'recipes'), {
      ...meta,
      ingredients,
      owner: user.value.uid,
      createdAt: now,
      updatedAt: now,
    })
    toast.add({
      title: 'Recette ajoutée',
      description: `« ${fakeRecipe.title} » (${ingredients.length} ingrédients depuis Firestore).`,
      color: 'success',
    })
  }
  catch (e) {
    console.error(e)
    toast.add({
      title: 'Erreur',
      description: 'Impossible d’ajouter la recette de test.',
      color: 'error',
    })
  }
  finally {
    seedingRecipe.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Accueil">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="neutral" variant="ghost" square @click="null">
            <UChip color="error" inset>
              <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
            </UChip>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 flex flex-col gap-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div></div>
          <UButton
            icon="i-lucide-flask-conical"
            color="primary"
            variant="soft"
            :loading="seedingRecipe"
            @click="seedFakeRecipe"
          >
            Tester : ajouter la recette démo
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
