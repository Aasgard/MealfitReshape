<script setup lang="ts">
import { getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'
import type { DropdownMenuItem } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  weekLabel: string
  /** Variante à mois abrégés, affichée sur mobile. */
  weekLabelShort?: string
  /** Lundi de la semaine affichée (`yyyy-MM-dd`), jour sélectionné dans le calendrier du titre. */
  weekStartKey: string
  isCurrentWeek?: boolean
  /** Grise "Vider" quand la semaine affichée ne contient aucun repas. */
  clearDisabled?: boolean
}>(), {
  weekLabelShort: undefined,
  isCurrentWeek: false,
  clearDisabled: false,
})

const emit = defineEmits<{
  previous: []
  next: []
  'this-week': []
  /** Jour choisi dans le calendrier du titre : la page affiche sa semaine. */
  'select-date': [date: Date]
  /** Ouvre le choix de la semaine à recopier dans celle-ci. */
  'copy-week': []
  clear: []
  'shopping-list': []
}>()

const pickerOpen = ref(false)

const pickedDate = computed({
  get: () => parseDate(props.weekStartKey),
  set: (value: DateValue | undefined) => {
    if (!value) return
    pickerOpen.value = false
    emit('select-date', value.toDate(getLocalTimeZone()))
  },
})

/** Mobile : les actions secondaires dans un menu, pour garder l'en-tête sur une ligne. */
const moreItems = computed<DropdownMenuItem[][]>(() => [
  props.isCurrentWeek ? [] : [{ label: 'Revenir à cette semaine', icon: 'i-lucide-calendar-check', onSelect: () => emit('this-week') }],
  [
    { label: 'Copier une semaine…', icon: 'i-lucide-copy', onSelect: () => emit('copy-week') },
    { label: 'Vider la semaine', icon: 'i-lucide-eraser', disabled: props.clearDisabled, onSelect: () => emit('clear') },
  ],
].filter(group => group.length))
</script>

<template>
  <!-- `data-copy-control` : changer de semaine ne doit pas annuler un repas copié, qu'on veut justement coller ailleurs. -->
  <div class="flex items-center justify-between gap-2">
    <div class="flex min-w-0 items-center gap-1 sm:gap-2">
      <div class="flex shrink-0 items-center rounded-sm border border-default overflow-hidden">
        <UButton
          data-copy-control
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :ui="{ base: 'rounded-none' }"
          aria-label="Semaine précédente"
          @click="emit('previous')"
        />
        <div class="w-px h-5 bg-default" />
        <UButton
          data-copy-control
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :ui="{ base: 'rounded-none' }"
          aria-label="Semaine suivante"
          @click="emit('next')"
        />
      </div>

      <UPopover v-model:open="pickerOpen">
        <button
          type="button"
          data-copy-control
          class="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Choisir une semaine"
        >
          <h1 class="truncate text-xl font-bold tracking-tight text-highlighted sm:text-2xl">
            <span class="sm:hidden">{{ weekLabelShort ?? weekLabel }}</span>
            <span class="hidden sm:inline">{{ weekLabel }}</span>
          </h1>
          <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
        <template #content>
          <div data-copy-control>
            <UCalendar v-model="pickedDate" :week-starts-on="1" class="p-2" />
          </div>
        </template>
      </UPopover>

      <UButton
        v-if="!isCurrentWeek"
        data-copy-control
        label="Cette semaine"
        color="primary"
        variant="subtle"
        size="xs"
        class="hidden shrink-0 sm:inline-flex"
        @click="emit('this-week')"
      />
    </div>

    <!-- Mobile : « Courses » et un menu « … » ; à partir de la tablette, toutes les actions en boutons. -->
    <div class="flex shrink-0 items-center gap-2">
      <UButton
        icon="i-lucide-copy"
        label="Copier une semaine…"
        color="neutral"
        variant="outline"
        size="sm"
        class="hidden sm:inline-flex"
        @click="emit('copy-week')"
      />
      <UButton
        icon="i-lucide-eraser"
        label="Vider"
        color="neutral"
        variant="outline"
        size="sm"
        class="hidden sm:inline-flex"
        :disabled="clearDisabled"
        @click="emit('clear')"
      />
      <UButton
        icon="i-lucide-shopping-cart"
        color="primary"
        size="sm"
        aria-label="Liste de courses"
        @click="emit('shopping-list')"
      >
        <span class="hidden sm:inline">Liste de courses</span>
      </UButton>
      <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="outline"
          size="sm"
          square
          class="sm:hidden"
          aria-label="Plus d'actions"
        />
      </UDropdownMenu>
    </div>
  </div>
</template>
