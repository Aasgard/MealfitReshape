<script setup lang="ts">
const user = useCurrentUser()
if (user.value) {
  console.log('user', user.value.uid)
}
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>