<script setup lang="ts">
import { fr } from '@nuxt/ui/locale'

const user = useCurrentUser()
if (user.value) {
  console.log('user', user.value.uid)
}
</script>

<template>
  <UApp :locale="fr">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>