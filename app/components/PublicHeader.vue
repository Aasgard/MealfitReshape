<script setup lang="ts">
const user = useCurrentUser()

const links = [
  { label: 'Accueil', to: '/' },
  { label: 'Outils', to: '/outils' },
]
</script>

<template>
  <header class="border-b border-default">
    <!-- Sous sm, la nav passe sur une seconde ligne pour laisser la place au logo et au bouton. -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center gap-x-10">
      <NuxtLink to="/" class="h-16 flex items-center font-bold tracking-tight text-highlighted">
        <span>MEALFIT <span class="text-primary">RESHAPE</span></span>
      </NuxtLink>

      <nav aria-label="Navigation principale" class="order-last w-full flex gap-6 sm:order-0 sm:w-auto sm:self-stretch">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="-mb-px flex items-center py-2.5 sm:py-0 border-b-2 border-transparent text-sm font-medium text-muted hover:text-highlighted transition-colors aria-[current=page]:border-primary aria-[current=page]:text-highlighted"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div class="ms-auto">
        <UButton v-if="!user" to="/login" label="Se connecter" color="neutral" variant="outline" />
      </div>
    </div>
  </header>
</template>
