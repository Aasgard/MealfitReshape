<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard - Liste de courses - Mealfit',
  description: 'Dashboard - Liste de courses - Mealfit',
})
</script>

<template>
  <UDashboardPanel id="liste-courses">
    <template #header>
      <UDashboardNavbar title="Liste de courses">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        class="py-12"
        icon="i-lucide-shopping-cart"
        title="Bientôt disponible"
        description="Vous pourrez bientôt retrouver et gérer votre liste de courses ici."
      />
    </template>
  </UDashboardPanel>
</template>
