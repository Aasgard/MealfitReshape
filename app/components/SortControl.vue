<script setup lang="ts" generic="K extends string">
import type { SortOption, SortState } from '~/utils/listSort'

/** Tri sous forme de champ (critère + sens), là où aucun en-tête de colonne n'est cliquable : cartes et liste compacte. */
const props = defineProps<{
  options: SortOption<K>[]
}>()

const sort = defineModel<SortState<K>>({ required: true })

const key = computed({
  get: () => sort.value.key,
  set: (value: K) => {
    const option = props.options.find(o => o.key === value)
    if (option) sort.value = { key: value, direction: option.defaultDirection }
  },
})

const selectedOption = computed(() => props.options.find(o => o.key === sort.value.key))

const ascending = computed(() => sort.value.direction === 'asc')
const directionLabel = computed(() => ascending.value ? 'Ordre croissant' : 'Ordre décroissant')

const flipDirection = () => {
  sort.value = { key: sort.value.key, direction: ascending.value ? 'desc' : 'asc' }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <!--
      Chaque critère a son icône (ou la pastille G/P/L), dans la liste comme dans le champ fermé.
      La liste prend la hauteur disponible à l'écran (au lieu de max-h-60) : pas de défilement tant qu'elle tient.
    -->
    <USelectMenu
      v-model="key"
      :items="options"
      value-key="key"
      :search-input="false"
      size="sm"
      aria-label="Trier par"
      class="w-auto sm:w-40"
      :ui="{ content: 'min-w-44 max-h-(--reka-combobox-content-available-height)' }"
    >
      <!-- En mobile, seule l'icône du critère reste visible (la ligne résultat / tri / vue tient sur une seule ligne). -->
      <template #default>
        <span class="hidden sm:block truncate">{{ selectedOption?.label }}</span>
        <span class="block sm:hidden h-5 w-0" aria-hidden="true" />
        <span class="sr-only sm:hidden">Trier par {{ selectedOption?.label }}</span>
      </template>
      <template #leading="{ ui }">
        <span v-if="selectedOption?.dot" class="flex items-center justify-center size-4 shrink-0">
          <span class="size-2 rounded-full" :class="selectedOption.dot" />
        </span>
        <UIcon v-else :name="selectedOption?.icon ?? 'i-lucide-arrow-down-up'" :class="ui.leadingIcon()" />
      </template>
      <template #item-leading="{ item, ui }">
        <span v-if="item.dot" class="flex items-center justify-center size-4 shrink-0">
          <span class="size-2 rounded-full" :class="item.dot" />
        </span>
        <UIcon v-else-if="item.icon" :name="item.icon" :class="ui.itemLeadingIcon()" />
      </template>
    </USelectMenu>
    <UTooltip :text="`${directionLabel} — inverser`">
      <UButton
        :icon="ascending ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow'"
        color="neutral"
        variant="outline"
        size="sm"
        :aria-label="`${directionLabel}, cliquer pour inverser`"
        @click="flipDirection"
      />
    </UTooltip>
  </div>
</template>
