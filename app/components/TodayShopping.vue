<script setup lang="ts">
import type { GroceryLine } from '~/utils/groceryList'

const props = defineProps<{
  /** Articles urgents encore à acheter, déjà triés ; la section n'est affichée que s'il y en a. */
  lines: GroceryLine[]
  /** Lien vers la liste de courses, ouverte en mode « Acheter ». */
  to: string
}>()

/** Au-delà, une dernière ligne renvoie vers la liste plutôt que d'allonger l'accueil. */
const MAX_VISIBLE = 5

const visibleLines = computed(() => props.lines.length > MAX_VISIBLE ? props.lines.slice(0, MAX_VISIBLE - 1) : props.lines)
const hiddenCount = computed(() => props.lines.length - visibleLines.value.length)
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-default bg-default">
    <ul class="divide-y divide-default">
      <!-- Un clic sur la ligne ouvre le détail des besoins, comme dans la liste de courses. -->
      <li v-for="line in visibleLines" :key="line.id">
        <GroceryLineName :line="line" variant="store" bare block />
      </li>
      <li v-if="hiddenCount">
        <NuxtLink
          :to="to"
          class="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span class="flex-1">+ {{ hiddenCount }} autre{{ hiddenCount > 1 ? 's' : '' }} article{{ hiddenCount > 1 ? 's' : '' }}</span>
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
