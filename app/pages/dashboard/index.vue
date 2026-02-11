<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const items = [[{
  label: 'New mail',
  icon: 'i-lucide-send',
}, {
  label: 'New customer',
  icon: 'i-lucide-user-plus',
}]] satisfies DropdownMenuItem[][]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Accueil">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton color="neutral" variant="ghost" square @click="null">
              <UChip color="error" inset>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UButton to="/dashboard" color="neutral" class="w-fit">Settings</UButton>
    </template>
  </UDashboardPanel>
</template>
