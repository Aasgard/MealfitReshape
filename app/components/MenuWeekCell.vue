<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus'
import type { MenuEntry } from '~/types/menu'

/**
 * Une case du calendrier (un jour × une ligne de repas) : ses cartes, glissables vers les autres cases,
 * et le bouton "+". Le parent enregistre le déplacement (`move-entry`) ; la case n'écrit rien elle-même.
 */
const props = defineProps<{
  entries: MenuEntry[]
  /** Repas actuellement copié : mis en évidence, et le bouton "+" indique qu'il va le coller. */
  copiedEntryId?: string
  /** Colonne du jour courant. */
  isHighlighted?: boolean
}>()

const emit = defineEmits<{
  add: []
  'select-entry': [entryId: string]
  'copy-entry': [entryId: string]
  'delete-entry': [entryId: string]
  'move-entry': [entryId: string]
}>()

/** Copie locale des repas que le glisser-déposer modifie ; les données de la page (Firestore) la remplacent dès qu'elles changent. */
const list = ref<MenuEntry[]>([...props.entries])
watch(() => props.entries, (entries) => {
  list.value = [...entries]
})

/** Carte déposée depuis une autre case : c'est ici, case d'arrivée, qu'on en déduit le nouveau jour / la nouvelle ligne. */
const onAdd = (event: DraggableEvent<MenuEntry>) => {
  const entryId = event.item.dataset.entryId
  if (entryId) emit('move-entry', entryId)
}
</script>

<template>
  <VueDraggable
    v-model="list"
    group="menu-meals"
    draggable=".menu-meal-card"
    :sort="false"
    :animation="150"
    ghost-class="menu-meal-card-ghost"
    :delay="200"
    :delay-on-touch-only="true"
    :fallback-on-body="true"
    class="border-b border-r border-default last:border-r-0 p-1.5 flex flex-col gap-1 min-h-20"
    :class="isHighlighted ? 'bg-primary/5' : ''"
    @add="onAdd"
  >
    <div
      v-for="entry in list"
      :key="entry.id"
      :data-entry-id="entry.id"
      class="menu-meal-card relative rounded-md border bg-default transition-colors"
      :class="entry.id === copiedEntryId ? 'border-primary' : 'border-default hover:border-primary/50'"
    >
      <!-- Un <div role="button"> plutôt qu'un <button> : Firefox ne lance pas de glisser-déposer depuis un bouton. -->
      <div
        role="button"
        tabindex="0"
        class="w-full cursor-grab px-2 py-1.5 pr-7 text-left active:cursor-grabbing"
        @click="emit('select-entry', entry.id)"
        @keydown.enter.self="emit('select-entry', entry.id)"
        @keydown.space.self.prevent="emit('select-entry', entry.id)"
      >
        <p class="text-xs font-medium text-highlighted truncate">
          {{ entry.label }}
        </p>
        <p v-if="entry.quantityLabel" class="text-xs text-dimmed truncate">
          {{ entry.quantityLabel }}
        </p>
        <!-- Deux lignes sur mobile, une seule ligne à partir de la tablette. -->
        <p class="text-xs text-dimmed tabular-nums sm:truncate">
          {{ entry.kcal }} kcal<span class="hidden sm:inline"> - </span><br class="sm:hidden">
          <MenuMacroLabels :carbohydrates="entry.carbohydrates" :protein="entry.protein" :fat="entry.fat" />
        </p>
      </div>
      <div class="absolute top-1 right-1 flex flex-col gap-0.5">
        <button
          type="button"
          data-copy-control
          :aria-label="entry.id === copiedEntryId ? 'Annuler la copie' : 'Copier'"
          :aria-pressed="entry.id === copiedEntryId"
          class="rounded p-0.5 transition-colors"
          :class="entry.id === copiedEntryId ? 'text-primary bg-primary/10' : 'text-dimmed hover:text-primary'"
          @click="emit('copy-entry', entry.id)"
        >
          <UIcon name="i-lucide-copy" class="size-3.5 block" />
        </button>
        <button
          type="button"
          aria-label="Supprimer"
          class="rounded p-0.5 text-dimmed transition-colors hover:text-error"
          @click="emit('delete-entry', entry.id)"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5 block" />
        </button>
      </div>
    </div>
    <button
      type="button"
      data-copy-control
      aria-label="Ajouter"
      class="flex-1 flex items-center justify-center rounded-md border border-dashed px-2 py-1.5 transition-colors"
      :class="copiedEntryId ? 'border-primary/50 text-primary bg-primary/5' : 'border-default text-dimmed hover:text-primary hover:border-primary/50'"
      @click="emit('add')"
    >
      <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
    </button>
  </VueDraggable>
</template>

<style scoped>
/* Emplacement de dépose : cadre en pointillés indigo, contenu estompé (Sortable applique cette classe à la carte en cours de déplacement). */
.menu-meal-card-ghost {
  opacity: 0.5;
  background-color: color-mix(in oklch, var(--ui-primary) 6%, transparent) !important;
  border-color: color-mix(in oklch, var(--ui-primary) 40%, transparent) !important;
  border-style: dashed;
}
</style>
