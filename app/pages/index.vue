<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const links = ref<ButtonProps[]>([
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: 'i-lucide-square-play',
  },
  {
    label: 'Go to Login',
    to: '/login',
    color: 'neutral',
    variant: 'subtle',
    trailingIcon: 'i-lucide-arrow-right'
  }
])
</script>

<template>
  <UPageSection title="Mealfit Reshape"
    description="Gérez votre alimentation et votre activité physique avec Mealfit Reshape. Suivez vos ingrédients, recettes et calculez vos besoins nutritionnels journaliers."
    :links="links" />
</template>