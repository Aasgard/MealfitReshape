<script setup lang="ts">
useSeoMeta({
  title: 'Outils - Mealfit',
  description: 'Les outils de base de Mealfit, en accès libre et sans compte.',
})

interface PublicTool {
  icon: string
  label: string
  description: string
}

// Placeholder : chaque ligne deviendra un lien vers /outils/<slug> quand l'outil sera ouvert sans compte.
const tools: PublicTool[] = [
  {
    icon: 'i-lucide-sport-shoe',
    label: 'Allure & ravitaillement trail',
    description: 'Allure et apport en glucides pour une course.',
  },
  {
    icon: 'i-lucide-calculator',
    label: 'Besoins journaliers',
    description: 'Métabolisme de base, dépense et macros quotidiennes.',
  },
  {
    icon: 'i-lucide-scan-barcode',
    label: 'Scanner produit',
    description: 'Valeurs nutritionnelles et Nutri-Score à partir d\'un code-barres.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-default">
    <PublicHeader />

    <main class="max-w-2xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <h1 class="text-2xl font-bold tracking-tight text-highlighted">
        Outils
      </h1>
      <p class="mt-2 text-sm text-muted">
        Les outils de base de Mealfit, en accès libre et sans compte.
      </p>

      <ul class="mt-8 divide-y divide-default overflow-hidden rounded-lg border border-default">
        <li
          v-for="tool in tools"
          :key="tool.label"
          class="flex items-center gap-4 px-4 py-4"
        >
          <div class="flex items-center justify-center size-9 rounded-md bg-elevated text-muted shrink-0">
            <UIcon :name="tool.icon" class="size-4.5" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-base font-semibold text-highlighted">
              {{ tool.label }}
            </p>
            <p class="mt-0.5 text-sm text-muted">
              {{ tool.description }}
            </p>
          </div>

          <UBadge label="Bientôt" color="neutral" variant="subtle" size="sm" class="shrink-0" />
        </li>
      </ul>
    </main>
  </div>
</template>
