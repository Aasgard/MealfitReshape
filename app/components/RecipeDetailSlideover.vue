<script setup lang="ts">
import type { Recipe } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { recipeTypeLabel } from '~/utils/recipeType'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'
import { describeRecipeLine, macrosForRecipe } from '~/utils/recipeNutrition'

const props = defineProps<{
  recipe: Recipe | null
  /** Catalogue d'ingrédients (privés + publics) pour résoudre les noms, quantités et macros des lignes. */
  ingredientsById: Map<string, Ingredient>
  /** Parts à préparer (ex. celles d'un repas) : les quantités d'ingrédients sont recalculées. Absent = parts de la recette. */
  parts?: number | null
  /** Clic sur un tag (page Recettes : la fiche se ferme et la liste se filtre sur ce tag). Absent = tags non cliquables. */
  onSelectTag?: (tag: string) => void
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)
// On cuisine avec la recette sous les yeux : l'écran ne doit pas se verrouiller.
useScreenWakeLock(open)

/** Minuteurs de cuisine : lancés depuis l'en-tête, affichés en haut de la fiche tant qu'ils tournent. */
const { timers, openRecipeId, isRinging } = useKitchenTimers()
const timerLauncherOpen = ref(false)

/** Au-delà de deux minuteurs, les suivants se déplient à la demande : la recette garde la place. */
const TIMERS_SHOWN = 2
const timersExpanded = ref(false)
watch(() => timers.value.length, (count) => { if (count <= TIMERS_SHOWN) timersExpanded.value = false })
const shownTimers = computed(() => (timersExpanded.value ? timers.value : timers.value.slice(0, TIMERS_SHOWN)))
const hiddenTimers = computed(() => timers.value.length - TIMERS_SHOWN)
/** Minuteurs terminés parmi ceux repliés : signalés sur le bouton pour ne pas les rater. */
const hiddenRinging = computed(() => timers.value.slice(TIMERS_SHOWN).filter(isRinging).length)
watch([open, () => props.recipe?.id], ([isOpen, id], [, previousId]) => {
  if (isOpen && id) openRecipeId.value = id
  else if (openRecipeId.value === (id ?? previousId)) openRecipeId.value = null
}, { immediate: true })
onBeforeUnmount(() => {
  if (open.value && openRecipeId.value === props.recipe?.id) openRecipeId.value = null
})

const { formatDate } = useDateFormat()

const persons = computed(() => props.recipe?.persons ?? 1)
/** Parts à l'ouverture : celles du repas (ou de la fournée), sinon celles de la recette. */
const initialParts = computed(() => props.parts || persons.value)

/**
 * Variateur de parts de la fiche : ne fait que recalculer les quantités affichées (et imprimées). Il ne change ni le
 * repas, ni la recette, ni le stock ; il revient aux parts d'origine à chaque ouverture.
 */
const PARTS_STEP = 0.5
const displayedParts = ref(initialParts.value)
watch([open, initialParts], ([isOpen]) => {
  if (isOpen) displayedParts.value = initialParts.value
})
const stepParts = (direction: 1 | -1) => {
  displayedParts.value = Math.max(PARTS_STEP, displayedParts.value + direction * PARTS_STEP)
}
const resetParts = () => {
  displayedParts.value = initialParts.value
}
const isAdjusted = computed(() => Math.abs(displayedParts.value - initialParts.value) > 1e-6)
const isScaled = computed(() => displayedParts.value !== persons.value)

const formatParts = (parts: number) =>
  `${parts.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} part${parts > 1 ? 's' : ''}`

const macros = computed(() => macrosForRecipe(props.recipe?.ingredients, props.ingredientsById, persons.value))
const hasMacros = computed(() => {
  const m = macros.value
  return m.calories > 0 || m.protein > 0 || m.carbohydrates > 0 || m.fat > 0
})

/** Lignes d'ingrédients résolues (nom + quantité affichable). */
const lines = computed(() => {
  const recipe = props.recipe
  if (!recipe?.ingredients?.length) return []
  return recipe.ingredients.map((line, idx) => {
    const described = describeRecipeLine(line, props.ingredientsById, displayedParts.value / persons.value)
    return {
      key: `${line.ingredientRef?.id ?? 'unknown'}-${idx}`,
      label: described?.label ?? 'Ingrédient introuvable',
      quantityLabel: described?.quantityLabel ?? `${line.quantity}`,
      equivalentLabel: described?.equivalentLabel,
    }
  })
})

const scaledNote = computed(() =>
  isScaled.value ? `Quantités pour ${formatParts(displayedParts.value)} (recette prévue pour ${formatParts(persons.value)})` : null
)

/**
 * Export PDF : ouvre la boîte d'impression du navigateur ("Enregistrer en PDF") en n'imprimant
 * que `RecipePrintSheet`. Le titre du document sert de nom de fichier proposé.
 */
const printRecipe = async () => {
  const recipe = props.recipe
  if (!recipe) return

  const root = document.documentElement
  const previousTitle = document.title
  root.classList.add('printing-recipe')
  document.title = recipe.title

  const cleanup = () => {
    root.classList.remove('printing-recipe')
    document.title = previousTitle
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)

  // Laisse l'image se charger (au plus 3 s) pour qu'elle figure dans le PDF.
  const image = document.querySelector<HTMLImageElement>('#recipe-print img')
  if (image && !image.complete) {
    await Promise.race([
      new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      }),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ])
  }

  window.print()
}

/**
 * Édition depuis la fiche, quelle que soit la page qui l'a ouverte : la fiche se ferme et le formulaire s'ouvre à sa
 * place, comme « Modifier » sur la page Recettes. Le formulaire n'est monté qu'à la première édition.
 */
const editedRecipe = ref<Recipe | null>(null)
const formOpen = ref(false)

const editRecipe = async () => {
  if (!props.recipe) return
  editedRecipe.value = props.recipe
  open.value = false
  // Le formulaire se remplit en passant de fermé à ouvert : il doit être monté fermé avant de s'ouvrir.
  await nextTick()
  formOpen.value = true
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="recipe?.title"
    :close="false"
    :ui="{
      content: 'sm:max-w-xl',
      wrapper: 'min-w-0 flex-1',
      title: 'line-clamp-2',
    }"
  >
    <template #actions>
      <!-- Actions et croix dans un même groupe cerné d'un liseret ; dans le flux, un titre long passe à la ligne. -->
      <div class="flex shrink-0 items-center rounded-md ring ring-inset ring-default">
        <UPopover v-if="recipe" v-model:open="timerLauncherOpen" :content="{ align: 'end', sideOffset: 6 }">
          <!-- Le nombre de minuteurs en cours suit l'icône. -->
          <UButton
            icon="i-lucide-timer"
            :label="timers.length ? String(timers.length) : undefined"
            :color="timers.length ? 'primary' : 'neutral'"
            variant="ghost"
            aria-label="Lancer un minuteur"
            title="Lancer un minuteur"
            class="shrink-0 tabular-nums"
          />
          <template #content>
            <div class="w-[min(20rem,calc(100vw-2rem))] p-4">
              <KitchenTimerLauncher
                eggs
                :recipe="{ id: recipe.id, title: recipe.title, parts: displayedParts }"
                @started="timerLauncherOpen = false"
              />
            </div>
          </template>
        </UPopover>
        <UButton
          v-if="recipe"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          aria-label="Modifier la recette"
          title="Modifier la recette"
          class="shrink-0"
          @click="editRecipe"
        />
        <UButton
          v-if="recipe"
          icon="i-lucide-file-down"
          color="neutral"
          variant="ghost"
          aria-label="Exporter en PDF"
          title="Exporter en PDF"
          class="shrink-0"
          @click="printRecipe"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          aria-label="Fermer"
          title="Fermer"
          class="shrink-0"
          @click="() => { open = false }"
        />
      </div>
    </template>

    <template #body>
      <RecipePrintSheet
        v-if="open && recipe"
        :recipe="recipe"
        :lines="lines"
        :macros="hasMacros ? macros : null"
        :parts-label="formatParts(displayedParts)"
        :scaled-note="scaledNote"
      />

      <div class="flex flex-col gap-6">
        <!-- Minuteurs en cours, toujours visibles pendant qu'on fait défiler la recette. -->
        <section
          v-if="timers.length"
          aria-label="Minuteurs en cours"
          class="sticky -top-4 sm:-top-6 z-10 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 max-h-[45dvh] overflow-y-auto overscroll-contain border-b border-default bg-default"
        >
          <ul id="recipe-timers" class="divide-y divide-default">
            <li v-for="timer in shownTimers" :key="timer.id">
              <KitchenTimerRow :timer="timer" inset />
            </li>
          </ul>
          <button
            v-if="hiddenTimers > 0"
            type="button"
            class="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-default px-4 text-sm font-medium transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            :class="!timersExpanded && hiddenRinging ? 'bg-inverted text-inverted hover:bg-inverted/90' : 'text-muted'"
            aria-controls="recipe-timers"
            :aria-expanded="timersExpanded"
            @click="timersExpanded = !timersExpanded"
          >
            <template v-if="timersExpanded">Replier</template>
            <template v-else>
              {{ hiddenTimers }} autre{{ hiddenTimers > 1 ? 's' : '' }} minuteur{{ hiddenTimers > 1 ? 's' : '' }}
              <template v-if="hiddenRinging">· {{ hiddenRinging }} terminé{{ hiddenRinging > 1 ? 's' : '' }}</template>
            </template>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 shrink-0 transition-transform motion-reduce:transition-none"
              :class="timersExpanded && 'rotate-180'"
            />
          </button>
        </section>

        <img
          v-if="recipe?.imageUrl"
          :src="recipe.imageUrl"
          :alt="recipe.title"
          class="w-full h-40 object-cover rounded-lg"
        />

        <!-- Repas / difficulté / parts / temps : une seule ligne étirée sur toute la largeur ; un libellé trop long se tronque.
             Le badge des parts part d'une base fixe pour que le variateur ne décale pas ses voisins. -->
        <div class="flex items-center gap-1.5 *:min-w-0 *:grow *:justify-center">
          <UBadge
            v-if="recipe?.type"
            icon="i-lucide-utensils"
            :label="recipeTypeLabel(recipe.type)"
            :title="recipeTypeLabel(recipe.type)"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            icon="i-lucide-gauge"
            :label="recipeDifficultyLabel(recipe?.difficulty)"
            :title="recipeDifficultyLabel(recipe?.difficulty)"
            :color="recipeDifficultyColor(recipe?.difficulty)"
            variant="subtle"
            size="sm"
          />
          <UBadge
            icon="i-lucide-users"
            :label="formatParts(displayedParts)"
            :color="isScaled ? 'primary' : 'neutral'"
            variant="subtle"
            size="sm"
            class="basis-22 shrink-0 tabular-nums"
          />
          <UBadge
            v-if="recipe?.prepTime != null"
            icon="i-lucide-clock"
            :label="`${recipe.prepTime} min`"
            :title="`Préparation : ${recipe.prepTime} min`"
            :aria-label="`Préparation : ${recipe.prepTime} min`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="recipe?.cookTime != null"
            icon="i-lucide-cooking-pot"
            :label="`${recipe.cookTime} min`"
            :title="`Cuisson : ${recipe.cookTime} min`"
            :aria-label="`Cuisson : ${recipe.cookTime} min`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>

        <!-- Valeurs nutritionnelles -->
        <div v-if="hasMacros">
          <p class="text-xs text-dimmed mb-2">Valeurs nutritionnelles pour une part</p>
          <IngredientMacroSummary :macros="macros" />
        </div>
        <p v-if="!hasMacros" class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
          Valeurs non renseignées
        </p>

        <!-- Ingrédients -->
        <div>
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list" class="size-3.5 text-muted shrink-0" />
              <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Ingrédients</p>
            </div>
            <!-- Recalcule seulement les quantités affichées : le repas, la recette et le stock ne changent pas.
                 Le lien de retour garde sa place une fois masqué pour que le variateur ne bouge pas sous le doigt. -->
            <div class="flex items-center gap-2">
              <UButton
                :label="`Revenir à ${formatParts(initialParts)}`"
                color="neutral"
                variant="link"
                size="xs"
                class="tabular-nums"
                :class="{ invisible: !isAdjusted }"
                @click="resetParts"
              />
              <div role="group" aria-label="Parts pour le calcul des quantités" class="flex items-center rounded-md ring ring-inset ring-accented">
                <UButton
                  icon="i-lucide-minus"
                  color="neutral"
                  variant="link"
                  size="sm"
                  aria-label="Retirer une demi-part"
                  :disabled="displayedParts <= PARTS_STEP"
                  @click="stepParts(-1)"
                />
                <span class="w-20 text-center text-sm font-semibold text-highlighted tabular-nums" aria-live="polite">
                  {{ formatParts(displayedParts) }}
                </span>
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="link"
                  size="sm"
                  aria-label="Ajouter une demi-part"
                  @click="stepParts(1)"
                />
              </div>
            </div>
          </div>
          <ul v-if="lines.length" class="rounded-lg border border-default bg-elevated overflow-hidden">
            <li
              v-for="line in lines"
              :key="line.key"
              class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-default last:border-b-0"
            >
              <span class="text-sm font-medium text-highlighted truncate">{{ line.label }}</span>
              <span class="text-sm tabular-nums text-muted shrink-0">
                {{ line.quantityLabel }}
                <span v-if="line.equivalentLabel" class="text-dimmed">{{ line.equivalentLabel }}</span>
              </span>
            </li>
          </ul>
          <p v-else class="flex items-center gap-1.5 text-xs text-dimmed">
            <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
            Aucun ingrédient
          </p>
        </div>

        <!-- Instructions -->
        <div v-if="recipe?.instructions">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-list-ordered" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Instructions</p>
          </div>
          <p class="text-sm text-muted whitespace-pre-line">{{ recipe.instructions }}</p>
        </div>

        <!-- Tags -->
        <div v-if="recipe?.tags?.length">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-tag" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Tags</p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <template v-if="onSelectTag">
              <UButton
                v-for="tag in recipe.tags"
                :key="tag"
                :label="tag"
                color="neutral"
                variant="subtle"
                size="xs"
                :aria-label="`Voir les recettes « ${tag} »`"
                :title="`Voir les recettes « ${tag} »`"
                @click="() => { open = false; onSelectTag?.(tag) }"
              />
            </template>
            <template v-else>
              <UBadge
                v-for="tag in recipe.tags"
                :key="tag"
                :label="tag"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </template>
          </div>
        </div>

        <!-- Description -->
        <div v-if="recipe?.description">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-text" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Description</p>
          </div>
          <p class="text-sm text-muted whitespace-pre-line">{{ recipe.description }}</p>
        </div>

        <!-- Source -->
        <div v-if="recipe?.source">
          <p class="text-xs text-dimmed mb-1">Source</p>
          <p class="text-sm text-muted">{{ recipe.source }}</p>
        </div>

        <!-- Modifiée le -->
        <div v-if="recipe">
          <p class="text-xs text-dimmed mb-1">Modifiée le</p>
          <p class="text-sm text-muted">{{ formatDate(recipe.updatedAt) }}</p>
        </div>
      </div>
    </template>
  </USlideover>

  <RecipeFormSlideover v-if="editedRecipe" v-model:open="formOpen" :recipe="editedRecipe" />
</template>
