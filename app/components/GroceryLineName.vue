<script setup lang="ts">
/**
 * Nom d'un article, avec ses signaux : éclair pour un achat urgent, horloge pour une denrée fragile attendue au-delà
 * de J+2. Un appui court (ou un clic) ouvre le détail des besoins : jour par jour, conseil pour les fragiles et
 * marquage urgent. Souris et clavier : popover ; toucher : panneau en bas d'écran.
 */
import { createReusableTemplate } from '@vueuse/core'
import type { GroceryLine } from '~/utils/groceryList'

const props = withDefaults(defineProps<{
  line: GroceryLine
  /** `store` : nom plus grand et cible plus haute, pour le mode Acheter. */
  variant?: 'prepare' | 'store'
  /** Article dans le panier : nom barré et estompé. */
  done?: boolean
}>(), { variant: 'prepare', done: false })

const list = useInjectedGroceryList()
const [DefineDetail, ReuseDetail] = createReusableTemplate()

const popoverOpen = ref(false)
const drawerOpen = ref(false)

let pointerType = ''
function onPointerDown(event: PointerEvent) {
  pointerType = event.pointerType
}

function open() {
  // `detail` à 0 : clic déclenché au clavier.
  if (pointerType === 'mouse' || pointerType === '') popoverOpen.value = true
  else drawerOpen.value = true
}

function onClick(event: MouseEvent) {
  if (event.detail === 0) pointerType = ''
  open()
}

const tooEarlyDays = computed(() => props.line.needs.filter(need => need.isTooEarly && !need.isPast))
const firstUpcoming = computed(() => props.line.needs.find(need => !need.isPast))

const ariaLabel = computed(() => [
  props.line.label,
  props.line.isUrgent ? 'urgent' : null,
  props.line.hasTooEarlyNeed ? 'à acheter plus tard' : null,
  'voir les besoins',
].filter(Boolean).join(', '))

/** Ajout manuel seulement : un article venu des menus se retire en décochant ses repas. */
function removeFromList() {
  popoverOpen.value = false
  drawerOpen.value = false
  list.removeManual(props.line)
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
</script>

<template>
  <DefineDetail v-slot="{ inDrawer }">
    <div class="flex flex-col gap-4" :class="!inDrawer && 'w-[min(20rem,calc(100vw-2rem))] p-3'">
      <div v-if="!inDrawer" class="flex flex-col">
        <p class="truncate text-sm font-semibold text-highlighted">
          {{ line.label }}
        </p>
        <p class="text-xs tabular-nums text-muted">
          {{ [line.rangeLabel, line.quantityLabel].filter(Boolean).join(' · ') || 'Aucune date de besoin' }}
        </p>
      </div>

      <ul v-if="line.needs.length" class="divide-y divide-default border-y border-default">
        <li
          v-for="need in line.needs"
          :key="need.date"
          class="flex items-baseline gap-3 py-2"
          :class="need.isPast && 'text-dimmed'"
        >
          <span class="w-24 shrink-0 text-sm" :class="need.isPast ? 'line-through' : 'font-medium text-highlighted'">
            {{ capitalize(need.dayLabel) }}
          </span>
          <span class="min-w-0 flex-1 truncate text-xs" :class="!need.isPast && 'text-muted'">
            {{ need.isPast ? 'passé' : need.sources.join(', ') }}
          </span>
          <span class="flex shrink-0 items-center gap-1 text-sm tabular-nums" :class="need.isPast ? 'line-through' : 'text-highlighted'">
            <UIcon v-if="need.isTooEarly && !need.isPast" name="i-lucide-clock" class="size-3.5 text-warning" aria-hidden="true" />
            {{ need.quantityLabel }}
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">
        {{ line.manual ? 'Ajouté à la main : pas de date de besoin.' : 'Ajouté avant le suivi des dates : pas de date de besoin.' }}
      </p>

      <p v-if="tooEarlyDays.length" class="flex gap-2 rounded-md bg-elevated px-3 py-2 text-xs text-muted">
        <UIcon name="i-lucide-clock" class="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
        <span>
          Se garde jusqu'à J+2. La part pour
          <span class="font-medium text-highlighted">{{ tooEarlyDays.map(need => need.dayLabel).join(', ') }}</span>
          est à acheter plus tard, ou à congeler.
        </span>
      </p>

      <USwitch
        :model-value="line.isMarkedUrgent"
        label="Marquer urgent"
        :description="line.isDueSoon && !line.isMarkedUrgent && firstUpcoming
          ? `Déjà urgent : besoin ${firstUpcoming.dayLabel}.`
          : 'Plus de stock, indispensable…'"
        @update:model-value="list.toggleUrgent(line)"
      />

      <UButton
        v-if="line.manual"
        label="Retirer de la liste"
        icon="i-lucide-trash-2"
        color="error"
        variant="soft"
        :size="inDrawer ? 'lg' : 'sm'"
        :block="inDrawer"
        class="justify-center"
        @click="removeFromList"
      />
    </div>
  </DefineDetail>

  <UPopover v-model:open="popoverOpen" :content="{ align: 'start', side: 'bottom' }">
    <template #anchor>
      <button
        type="button"
        class="flex min-w-0 cursor-pointer flex-col items-start rounded-md text-start focus-visible:outline-2 focus-visible:outline-primary"
        :class="variant === 'store' ? 'min-h-14 justify-center py-2' : 'py-0.5'"
        :aria-label="ariaLabel"
        @pointerdown="onPointerDown"
        @click="onClick"
      >
        <span class="flex max-w-full items-center gap-1.5">
          <span
            class="truncate"
            :class="[
              variant === 'store' ? 'text-base' : 'text-sm',
              done ? 'text-dimmed line-through' : 'font-medium text-highlighted',
            ]"
          >{{ line.label }}</span>
          <UIcon v-if="line.isUrgent && !done" name="i-lucide-zap" class="size-3.5 shrink-0 text-error" aria-hidden="true" />
          <UIcon v-if="line.hasTooEarlyNeed && !done" name="i-lucide-clock" class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
        </span>
      </button>
    </template>

    <template #content>
      <ReuseDetail :in-drawer="false" />
    </template>
  </UPopover>

  <UDrawer
    v-model:open="drawerOpen"
    :title="line.label"
    :description="[line.rangeLabel, line.quantityLabel].filter(Boolean).join(' · ') || 'Aucune date de besoin'"
    :ui="{ body: 'pb-6' }"
  >
    <template #body>
      <ReuseDetail :in-drawer="true" />
    </template>
  </UDrawer>
</template>
