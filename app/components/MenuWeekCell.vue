<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus'
import type { MenuEntry, MenuPerson } from '~/types/menu'
import { dishStorageOf, formatParts } from '~/utils/preparedDishes'

/**
 * Une case du calendrier (un jour × une ligne de repas) : ses cartes, glissables vers les autres cases du même `group`,
 * et le bouton "+". Le parent enregistre le déplacement (`move-entry`) ; la case n'écrit rien elle-même.
 */
const props = withDefaults(defineProps<{
  entries: MenuEntry[]
  /** Repas actuellement copié : mis en évidence, et le bouton "+" indique qu'il va le coller. */
  copiedEntryId?: string
  /** Colonne du jour courant. */
  isHighlighted?: boolean
  /** Ligne « Non compté » : hors totaux, la carte n'affiche que le nom et la quantité (sans kcal ni macros). */
  hideNutrition?: boolean
  /** Cases entre lesquelles les cartes se déplacent : le bloc de chaque membre du foyer a le sien. */
  group?: string
  /** Repas partagés : par carte, les autres personnes qui mangent la même recette à ce repas (avatars sur la carte). */
  companions?: Record<string, MenuPerson[]>
}>(), {
  group: 'menu-meals',
  companions: () => ({}),
})

const companionsLabel = (people: MenuPerson[]) => `Aussi au menu de ${people.map(person => person.name).join(', ')}`

/**
 * Place des avatars au bout de la dernière ligne, au plus juste : 14 px par avatar, 2 px de chevauchement, la pastille
 * « +N » en troisième au-delà de deux ; calés à 4 px du bord de la carte (ou juste à gauche des actions, sur tablette
 * tactile), plus 2 px d'écart avec le texte.
 */
const companionsPadding = (entryId: string) => {
  const count = props.companions[entryId]?.length ?? 0
  return count > 2 ? 'pr-9' : count === 2 ? 'pr-6' : count ? 'pr-3' : undefined
}

const emit = defineEmits<{
  add: []
  'select-entry': [entryId: string]
  'edit-entry': [entryId: string]
  'copy-entry': [entryId: string]
  'delete-entry': [entryId: string]
  'move-entry': [entryId: string]
  'drag-start': []
  'drag-end': []
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
    :group="group"
    draggable=".menu-meal-card"
    :sort="false"
    :animation="150"
    ghost-class="menu-meal-card-ghost"
    :delay="200"
    :delay-on-touch-only="true"
    :fallback-on-body="true"
    :scroll-sensitivity="64"
    :scroll-speed="14"
    class="group/cell border-b border-r border-default last:border-r-0 p-1 flex flex-col gap-1"
    :class="isHighlighted ? 'bg-primary/5' : ''"
    @add="onAdd"
    @start="emit('drag-start')"
    @end="emit('drag-end')"
  >
    <div
      v-for="entry in list"
      :key="entry.id"
      :data-entry-id="entry.id"
      class="menu-meal-card group/card relative rounded-md border bg-default transition-colors"
      :class="entry.id === copiedEntryId ? 'border-primary' : 'border-default hover:border-primary/50'"
    >
      <!-- Un <div role="button"> plutôt qu'un <button> : Firefox ne lance pas de glisser-déposer depuis un bouton. -->
      <div
        role="button"
        tabindex="0"
        class="w-full cursor-grab px-2 py-1.5 text-left active:cursor-grabbing sm:min-h-16 sm:pr-7 sm:pointer-fine:pr-2"
        @click="emit('select-entry', entry.id)"
        @keydown.enter.self="emit('select-entry', entry.id)"
        @keydown.space.self.prevent="emit('select-entry', entry.id)"
      >
        <p class="flex items-center gap-1 text-xs font-medium text-highlighted">
          <!-- Pris dans le stock : déjà préparé, ni à cuisiner ni à acheter. -->
          <UIcon v-if="entry.storage" :name="dishStorageOf(entry.storage).icon" class="size-3 shrink-0 text-primary" :title="`Stock · ${dishStorageOf(entry.storage).label}`" aria-hidden="true" />
          <span v-if="entry.storage" class="sr-only">Du stock :</span>
          <span class="truncate" :title="entry.label">{{ entry.label }}</span>
          <span v-if="companions[entry.id]" class="sr-only">{{ companionsLabel(companions[entry.id]!) }}</span>
        </p>
        <!--
          « 100 g · 45 kcal » (les kcal seules pour des macros saisies à la main), puis les macros « G5 P3 L0 » seules.
          « Non compté » : la quantité seule.
          Avec convives : une marge sous leurs avatars, sur la dernière ligne seulement (les autres gardent toute la largeur).
        -->
        <p v-if="hideNutrition" class="text-xs text-dimmed tabular-nums truncate" :class="companionsPadding(entry.id)">
          {{ entry.quantityLabel }}<span v-if="entry.recipeParts" class="text-warning" :title="`La recette fait ${formatParts(entry.recipeParts)}`"> /{{ entry.recipeParts.toLocaleString('fr-FR') }}</span>
        </p>
        <!-- Gris uni : un repas seul n'a pas d'objectif, la couleur n'y dirait rien (voir l'en-tête de colonne). -->
        <p v-else class="text-xs text-dimmed tabular-nums">
          <span class="block truncate">
            <template v-if="entry.quantityLabel">
              {{ entry.quantityLabel }}<span v-if="entry.recipeParts" class="text-warning" :title="`La recette fait ${formatParts(entry.recipeParts)}`"> /{{ entry.recipeParts.toLocaleString('fr-FR') }}</span> ·
            </template>
            {{ entry.kcal }} kcal
          </span>
          <span class="block truncate" :class="companionsPadding(entry.id)">
            G{{ entry.carbohydrates }} P{{ entry.protein }} L{{ entry.fat }}
          </span>
        </p>
        <!--
          Même recette au même repas chez d'autres personnes du foyer : leurs avatars au bord droit, sur la dernière ligne
          (celle des macros, ou de la quantité pour « Non compté »), centrés dans sa hauteur (padding haut de 0,375rem + une
          ligne text-xs de 1rem par ligne au-dessus). Tablette tactile : à gauche de la colonne d'actions, toujours affichée.
        -->
        <UAvatarGroup
          v-if="companions[entry.id]"
          size="3xs"
          :max="2"
          :ui="{ base: 'size-3.5 text-[7px]' }"
          class="absolute right-1 h-4 items-center sm:right-6 sm:pointer-fine:right-1"
          :class="hideNutrition ? 'top-[1.375rem]' : 'top-[2.375rem]'"
          :title="companionsLabel(companions[entry.id]!)"
          aria-hidden="true"
        >
          <UAvatar v-for="person in companions[entry.id]" :key="person.id" :src="person.photoUrl" :alt="person.name" />
        </UAvatarGroup>
      </div>
      <!--
        Sur mobile, ces actions passent dans le panneau ouvert par un appui sur la carte (voir la page Menus). Souris : au
        survol ou au focus de la carte seulement, pour laisser au nom toute la largeur ; toujours là sur la carte copiée.
        Tablette tactile : toujours visibles, faute de survol.
      -->
      <div
        class="absolute top-1 right-1 hidden flex-col gap-0.5 rounded bg-default transition-opacity duration-150 sm:flex"
        :class="entry.id !== copiedEntryId && 'sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover/card:opacity-100 sm:pointer-fine:group-focus-within/card:opacity-100'"
      >
        <button
          type="button"
          aria-label="Modifier"
          class="rounded p-0.5 text-dimmed transition-colors hover:text-primary"
          @click="emit('edit-entry', entry.id)"
        >
          <UIcon name="i-lucide-pencil" class="size-3.5 block" />
        </button>
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
    <!--
      Zone d'ajout : toute la place libre de la case. Souris : surface unie, le "+" n'apparaît qu'au survol de la case
      (ou au focus) ; sous des repas, une marge étroite qui ne grandit que pour remplir la place laissée par une case plus
      haute de la même ligne. Tactile, sans survol : "+" atténué et cible de 30 px. Repas copié : toutes les cases montrent
      où le coller.
    -->
    <button
      type="button"
      data-copy-control
      aria-label="Ajouter"
      class="group/add flex flex-1 items-center justify-center rounded-md px-2 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
      :class="[
        list.length ? 'min-h-7.5 pointer-fine:min-h-5' : 'py-1',
        copiedEntryId ? 'border border-dashed border-primary/50 text-primary bg-primary/5' : 'text-dimmed hover:bg-primary/5 hover:text-primary',
      ]"
      @click="emit('add')"
    >
      <UIcon
        name="i-lucide-plus"
        class="size-3.5 shrink-0 transition-opacity duration-150"
        :class="!copiedEntryId && 'pointer-coarse:opacity-40 pointer-fine:opacity-0 pointer-fine:group-hover/cell:opacity-100 pointer-fine:group-focus-visible/add:opacity-100'"
      />
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
