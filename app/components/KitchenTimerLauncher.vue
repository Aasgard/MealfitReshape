<script setup lang="ts">
import type { KitchenTimer } from '~/composables/useKitchenTimers'

/**
 * Lance un minuteur de cuisine : une durée toute faite part d'un toucher, ou une durée libre (minutes, secondes).
 * Le nom est facultatif (« Minuteur N » sinon).
 */
const props = defineProps<{
  /** Recette d'où il est lancé (fiche) : le minuteur garde un lien vers elle. */
  recipe?: KitchenTimer['recipe']
  /** Page Minuteurs : durées sur une ligne dès la tablette. */
  wide?: boolean
  /** Fiche recette : cuissons d'œufs (coque, poché, mollet, dur) en plus des durées. */
  eggs?: boolean
}>()

const emit = defineEmits<{ started: [] }>()

const { start, nextDefaultLabel } = useKitchenTimers()

const PRESET_MINUTES = [1, 3, 5, 10, 15, 20]
/** Fiche recette : œufs en coquille seulement, sur une ligne de trois comme les durées. */
const RECIPE_EGGS = EGG_COOKINGS.filter(egg => egg.label !== 'Poché')

const label = ref('')
const minutes = ref<number | null>(null)
const seconds = ref<number | null>(null)

const customMs = computed(() => ((minutes.value ?? 0) * 60 + (seconds.value ?? 0)) * 1000)

/** `fallbackLabel` : nom d'une cuisson d'œuf, quand aucun nom n'a été saisi. */
function launch(durationMs: number, fallbackLabel?: string) {
  start({ durationMs, label: label.value.trim() || fallbackLabel, recipe: props.recipe })
  label.value = ''
  minutes.value = null
  seconds.value = null
  emit('started')
}

/** Saisie au clavier : un nombre entier positif borné, vide sinon. */
const clampField = (value: unknown, max: number) => {
  const n = value === '' || value == null ? Number.NaN : Number(value)
  return Number.isNaN(n) ? null : Math.min(max, Math.max(0, Math.floor(n)))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField label="Nom" hint="Facultatif">
      <UInput
        v-model="label"
        :placeholder="nextDefaultLabel()"
        size="lg"
        class="w-full"
        maxlength="40"
        autocomplete="off"
      />
    </UFormField>

    <div role="group" aria-label="Durées toutes faites" class="grid grid-cols-3 gap-2" :class="wide && 'sm:grid-cols-6'">
      <UButton
        v-for="m in PRESET_MINUTES"
        :key="m"
        color="neutral"
        variant="outline"
        size="lg"
        block
        class="h-12 justify-center text-base font-semibold tabular-nums"
        :aria-label="`Lancer ${m} minute${m > 1 ? 's' : ''}`"
        @click="launch(m * 60_000)"
      >
        <span>{{ m }} <span class="text-sm font-normal text-muted">min</span></span>
      </UButton>
    </div>

    <div v-if="eggs" role="group" aria-label="Œufs" class="grid grid-cols-3 gap-2">
      <UButton
        v-for="egg in RECIPE_EGGS"
        :key="egg.label"
        color="neutral"
        variant="outline"
        size="lg"
        block
        icon="i-lucide-egg"
        class="h-12 justify-center text-sm font-normal text-muted"
        :ui="{ leadingIcon: 'size-4 text-dimmed' }"
        :aria-label="`Lancer œuf ${egg.label.toLowerCase()}, ${egg.minutes} minutes`"
        :title="`${egg.minutes} min`"
        @click="launch(egg.minutes * 60_000, eggTimerLabel(egg))"
      >
        {{ egg.label }}
      </UButton>
    </div>

    <form class="flex items-end gap-2" @submit.prevent="customMs > 0 && launch(customMs)">
      <UFormField label="Autre durée" class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <UInput
            :model-value="minutes ?? undefined"
            type="number"
            inputmode="numeric"
            min="0"
            max="600"
            placeholder="0"
            size="lg"
            aria-label="Minutes"
            class="min-w-0 flex-1"
            :ui="{ base: 'tabular-nums text-end pe-11', trailing: 'pointer-events-none' }"
            @update:model-value="minutes = clampField($event, 600)"
          >
            <template #trailing>
              <span class="text-sm text-muted">min</span>
            </template>
          </UInput>
          <UInput
            :model-value="seconds ?? undefined"
            type="number"
            inputmode="numeric"
            min="0"
            max="59"
            placeholder="0"
            size="lg"
            aria-label="Secondes"
            class="min-w-0 flex-1"
            :ui="{ base: 'tabular-nums text-end pe-8', trailing: 'pointer-events-none' }"
            @update:model-value="seconds = clampField($event, 59)"
          >
            <template #trailing>
              <span class="text-sm text-muted">s</span>
            </template>
          </UInput>
        </div>
      </UFormField>
      <UButton
        type="submit"
        icon="i-lucide-play"
        label="Lancer"
        size="lg"
        class="h-10 shrink-0"
        :disabled="customMs <= 0"
      />
    </form>
  </div>
</template>
