<script setup lang="ts">
  const appConfig = useAppConfig()
  console.log(appConfig)
</script>

<template>
  <UBanner title="Mealfit Reshape - Login Page" />
  <UPageSection>
    <UButton to="/">Homepage</UButton>
    <UProgress :value="0" />
  </UPageSection>
</template>