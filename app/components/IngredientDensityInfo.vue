<script setup lang="ts">
/** Bouton « i » à côté du libellé de densité : l'explication s'ouvre au clic, utilisable au doigt contrairement à une infobulle. */
</script>

<template>
  <UPopover :content="{ side: 'top', align: 'center' }" arrow>
    <UButton
      icon="i-lucide-info"
      color="neutral"
      variant="ghost"
      size="xs"
      class="-my-1 p-0.5 text-dimmed hover:text-muted"
      aria-label="À quoi sert la densité ?"
    />

    <template #content>
      <p class="max-w-64 p-3 text-xs text-muted">
        La densité sert à convertir une unité exprimée en ml vers des grammes ; utile seulement si une unité de l'ingrédient est en ml.
      </p>
    </template>
  </UPopover>
</template>
