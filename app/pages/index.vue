<script setup lang="ts">
useSeoMeta({
  title: 'Accueil - Mealfit',
  description: 'Suivez vos ingrédients, vos recettes, et calculez vos besoins nutritionnels journaliers avec Mealfit.',
})

const user = useCurrentUser()
</script>

<template>
  <div class="min-h-screen bg-default">
    <header class="border-b border-default">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <NuxtLink to="/" class="font-bold tracking-tight text-highlighted">
          MEALFIT <span class="text-primary">RESHAPE</span>
        </NuxtLink>

        <UButton v-if="!user" to="/login" label="Se connecter" color="neutral" variant="outline" />
      </div>
    </header>

    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <p class="text-xs font-semibold tracking-widest text-primary uppercase">
            Nutrition &amp; activité physique
          </p>

          <h1 class="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-highlighted leading-[1.1]">
            Gérez votre alimentation et votre activité physique
          </h1>

          <p class="mt-6 text-lg text-muted max-w-lg">
            Suivez vos ingrédients, vos recettes, et calculez vos besoins nutritionnels journaliers.
            Une question pour démarrer — le reste se remplit au fil de l'eau.
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <UButton v-if="user" to="/dashboard" label="Accéder à mon dashboard" size="lg" />
            <template v-else>
              <UButton to="/login" label="Commencer" size="lg" />
              <NuxtLink
                to="/dashboard"
                class="text-sm text-muted hover:text-highlighted transition-colors"
              >
                Déjà inscrit ? <span class="text-primary font-medium">Voir le dashboard</span>
              </NuxtLink>
            </template>
          </div>
        </div>

        <div
          class="relative aspect-square flex items-center justify-center p-6 sm:p-10 rounded-lg border border-default overflow-hidden"
          aria-hidden="true"
        >
          <div
            class="absolute inset-0"
            style="background: radial-gradient(circle at 30% 20%, var(--ui-color-primary-100), transparent 60%);"
          />
        </div>
      </div>
    </section>
  </div>
</template>
