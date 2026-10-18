<script setup lang="ts">
import type { KitchenTimer } from '~/composables/useKitchenTimers'

/**
 * Un minuteur de cuisine : nom, temps restant, barre de progression et actions (pause, +1 min, supprimer). Terminé, il
 * passe en négatif et sonne jusqu'à « Arrêter ».
 */
const props = defineProps<{
  timer: KitchenTimer
  /** Lien « Revenir à la recette » (pastille, page Minuteurs) ; masqué si la fiche de la recette est ouverte. */
  showRecipe?: boolean
  /** Bandeau de la fiche : marges alignées sur celles de la fiche. */
  inset?: boolean
}>()

const emit = defineEmits<{ openRecipe: [recipe: NonNullable<KitchenTimer['recipe']>] }>()

const { remainingMs, isRinging, progress, togglePause, addMinute, remove, openRecipeId } = useKitchenTimers()

const ringing = computed(() => isRinging(props.timer))
const paused = computed(() => props.timer.endAt === null)
const clock = computed(() => formatClock(Math.ceil(remainingMs(props.timer) / 1000)))
const recipeLink = computed(() =>
  props.showRecipe && props.timer.recipe && props.timer.recipe.id !== openRecipeId.value ? props.timer.recipe : null
)
</script>

<template>
  <!-- Une seule ligne : nom, temps restant, actions ; l'avancement court en filet au pied de la ligne. -->
  <div
    class="relative flex min-h-16 items-center gap-2 py-2 transition-colors"
    :class="[ringing ? 'bg-inverted text-inverted' : 'bg-default', inset ? 'px-4 sm:px-6' : 'px-3']"
  >
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-semibold" :class="ringing ? 'text-inverted' : 'text-highlighted'">
        {{ timer.label }}
      </p>
      <p v-if="ringing" class="text-xs font-medium text-(--ui-text-inverted)/75">Terminé</p>
      <UButton
        v-else-if="recipeLink"
        :label="recipeLink.title"
        trailing-icon="i-lucide-arrow-up-right"
        color="neutral"
        variant="link"
        size="xs"
        class="max-w-full p-0 text-muted"
        :ui="{ label: 'truncate' }"
        :aria-label="`Revenir à la recette ${recipeLink.title}`"
        @click="emit('openRecipe', recipeLink)"
      />
    </div>

    <template v-if="ringing">
      <UButton
        label="Arrêter"
        icon="i-lucide-bell-off"
        color="neutral"
        variant="solid"
        size="lg"
        class="h-11 shrink-0 justify-center bg-default text-highlighted hover:bg-elevated"
        @click="remove(timer.id)"
      />
      <UButton
        label="+1 min"
        color="neutral"
        variant="outline"
        size="lg"
        class="h-11 shrink-0 justify-center bg-transparent text-inverted ring-(--ui-text-inverted)/40 hover:bg-(--ui-text-inverted)/10 tabular-nums"
        @click="addMinute(timer.id)"
      />
    </template>
    <template v-else>
      <!--
        Annoncé seulement à la fin : un décompte lu chaque seconde serait inutilisable. La pause ne se lit qu'aux chiffres
        grisés (et à l'icône « Reprendre ») : aucune ligne ajoutée, la ligne ne bouge pas.
      -->
      <span
        class="min-w-[5ch] shrink-0 pe-1 text-end text-2xl font-bold tabular-nums tracking-tight"
        :class="paused ? 'text-muted' : 'text-highlighted'"
        :aria-label="paused ? `${clock} restant, en pause` : `${clock} restant`"
      >{{ clock }}</span>
      <UButton
        :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
        color="neutral"
        variant="outline"
        size="lg"
        class="size-11 shrink-0 justify-center"
        :aria-label="paused ? `Reprendre ${timer.label}` : `Mettre ${timer.label} en pause`"
        :title="paused ? 'Reprendre' : 'Pause'"
        @click="togglePause(timer.id)"
      />
      <UButton
        label="+1 min"
        color="neutral"
        variant="outline"
        size="lg"
        class="h-11 shrink-0 justify-center tabular-nums"
        @click="addMinute(timer.id)"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="lg"
        class="-me-2 size-11 shrink-0 justify-center"
        :aria-label="`Supprimer ${timer.label}`"
        title="Supprimer"
        @click="remove(timer.id)"
      />
    </template>

    <div
      class="absolute inset-x-0 bottom-0 h-1"
      :class="ringing ? 'bg-(--ui-text-inverted)/30' : 'bg-accented/60'"
      role="progressbar"
      :aria-valuenow="Math.round(progress(timer) * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`Avancement de ${timer.label}`"
    >
      <div
        class="h-full transition-[width] duration-300 ease-linear"
        :class="ringing ? 'bg-(--ui-text-inverted)' : paused ? 'bg-(--ui-text-dimmed)' : 'bg-primary'"
        :style="{ width: `${progress(timer) * 100}%` }"
      />
    </div>
  </div>
</template>
