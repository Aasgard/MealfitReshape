<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard - Accueil - Mealfit',
  description: 'Dashboard - Accueil - Mealfit',
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Accueil">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
  </UDashboardPanel>
</template>
