<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { doc, type DocumentReference } from 'firebase/firestore'
import type { Recipe, RecipeIngredientLine } from '~/types/recipe'
import type { Ingredient } from '~/types/ingredient'
import { isBaseRecipe, recipeTypeIcon, recipeTypeLabel } from '~/utils/recipeType'
import { baseIdOfKey, baseKey, lineBaseId, lineSourceKey } from '~/utils/recipeLineSource'
import { baseAdjustmentDelta } from '~/utils/mealBaseAdjustments'
import type { MealBaseAdjustment } from '~/types/meal'
import { baseYield, recipesUsingBase } from '~/utils/recipeBases'
import { recipeDifficultyColor, recipeDifficultyLabel } from '~/utils/recipeDifficulty'
import { describeRecipeLine, macrosForRecipe } from '~/utils/recipeNutrition'
import { formatKitchenGrams, nearestUnitLabel, swapForLine } from '~/utils/ingredientSwap'
import { useDocument } from 'vuefire'
import type { Book } from '~/types/book'
import { bookAuthorsLabel, bookSourceLabel, formatBookPage } from '~/utils/books'

const props = defineProps<{
  recipe: Recipe | null
  /** Catalogue d'ingrédients (privés + publics) pour résoudre les noms, quantités et macros des lignes. */
  ingredientsById: Map<string, Ingredient>
  /** Parts à préparer (ex. celles d'un repas) : les quantités d'ingrédients sont recalculées. Absent = parts de la recette. */
  parts?: number | null
  /** Bases du repas mangées autrement que prévu (quantités pour `parts` parts) : affichées à la place des quantités de la recette. */
  baseAdjustments?: MealBaseAdjustment[] | null
  /** Clic sur un tag (page Recettes : la fiche se ferme et la liste se filtre sur ce tag). Absent = tags non cliquables. */
  onSelectTag?: (tag: string) => void
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)
// On cuisine avec la recette sous les yeux : l'écran ne doit pas se verrouiller.
useScreenWakeLock(open)

/** Recettes accessibles : la base affichée relue à jour, et celles qui l'utilisent. */
const { recipes: allRecipes } = useFoodCatalog()
/**
 * Bases ouvertes depuis la fiche (une ligne « pickles » ouvre leur recette) : la fiche affiche la dernière, avec un
 * retour vers la précédente. Le fil repart de la recette reçue à chaque ouverture.
 */
const trail = ref<Recipe[]>([])
/** Recette affichée, relue dans le catalogue pour suivre une modification faite pendant que la fiche est ouverte. */
const shown = computed(() => {
  const last = trail.value.at(-1)
  return last ? allRecipes.value.find(r => r.id === last.id) ?? last : props.recipe
})
const previous = computed(() => (trail.value.length ? trail.value.at(-2) ?? props.recipe : null))
watch([open, () => props.recipe?.id], () => { trail.value = [] })
const openRecipe = (recipe: Recipe) => {
  if (recipe.id === shown.value?.id) return
  trail.value = [...trail.value, recipe]
}
const goBack = () => { trail.value = trail.value.slice(0, -1) }

const isBase = computed(() => isBaseRecipe(shown.value))
const usedIn = computed(() => (isBase.value && shown.value
  ? recipesUsingBase(allRecipes.value, shown.value.id).sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  : []))
const yieldGrams = computed(() => baseYield(shown.value))
/** Mise au stock de la base affichée. */
const baseStockOpen = ref(false)

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
watch([open, () => shown.value?.id], ([isOpen, id], [, previousId]) => {
  if (isOpen && id) openRecipeId.value = id
  else if (openRecipeId.value === (id ?? previousId)) openRecipeId.value = null
}, { immediate: true })
onBeforeUnmount(() => {
  if (open.value && openRecipeId.value === shown.value?.id) openRecipeId.value = null
})

const { formatDate } = useDateFormat()

/** Livre d'où vient la recette : lu seul, la fiche s'ouvre partout (Accueil, Menus) sans charger la bibliothèque. */
const db = useFirestore()
const bookDoc = useDocument<Book>(() => (shown.value?.bookId ? doc(db, 'books', shown.value.bookId) : null))
const book = computed(() => (shown.value?.bookId && bookDoc.value?.id === shown.value.bookId ? bookDoc.value : null))
/** Source imprimée : « Titre, p. 42 », sinon le texte libre. */
const sourceLabel = computed(() => (book.value ? bookSourceLabel(book.value, shown.value?.bookPage) : shown.value?.source))

/** Une base se compte en fournées (son rendement) : une seule « part ». */
const persons = computed(() => (isBase.value ? 1 : shown.value?.persons ?? 1))
/** Parts à l'ouverture : celles du repas (ou de la fournée), sinon celles de la recette ; une base ouverte depuis la fiche repart des siennes. */
const initialParts = computed(() => (trail.value.length ? persons.value : props.parts || persons.value))

/**
 * Variateur de parts de la fiche : ne fait que recalculer les quantités affichées (et imprimées). Il ne change ni le
 * repas, ni la recette, ni le stock ; il revient aux parts d'origine à chaque ouverture.
 */
const PARTS_STEP = 0.5
const displayedParts = ref(initialParts.value)
watch([open, initialParts, () => shown.value?.id], ([isOpen]) => {
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

/** Parts d'un plat ; poids préparé d'une base (×2 = deux fois son rendement), ou le multiple sans rendement. */
const formatParts = (parts: number) => {
  if (isBase.value) {
    return yieldGrams.value
      ? `${Math.round(parts * yieldGrams.value).toLocaleString('fr-FR')} g`
      : `× ${parts.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`
  }
  return `${parts.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} part${parts > 1 ? 's' : ''}`
}

const factor = computed(() => displayedParts.value / persons.value)

/**
 * Variantes de la fiche : index de ligne → ingrédient remplaçant, pesé pour apporter les mêmes kcal. Comme le
 * variateur de parts, elles ne changent que l'affichage (et l'impression) et disparaissent à chaque ouverture.
 */
const swaps = ref<Record<number, string>>({})
watch(open, (isOpen) => {
  if (isOpen) swaps.value = {}
})
watch([() => shown.value?.id, () => shown.value?.ingredients], () => {
  swaps.value = {}
})
const hasSwaps = computed(() => Object.keys(swaps.value).length > 0)

/** Remplacement résolu d'une ligne, `null` sans variante (ou si elle n'est plus calculable). */
const swapOf = (line: RecipeIngredientLine, idx: number) => {
  const replacementId = swaps.value[idx]
  const replacement = replacementId ? props.ingredientsById.get(replacementId) : undefined
  if (!replacement) return null
  const original = line.ingredientRef ? props.ingredientsById.get(line.ingredientRef.id) : undefined
  if (!original) return null
  const result = swapForLine(line, original, replacement)
  return result ? { replacement, ...result } : null
}

/** Lignes de la recette telles que cuisinées : un remplaçant compte pour son poids en grammes. */
const effectiveLines = computed<RecipeIngredientLine[]>(() =>
  (shown.value?.ingredients ?? []).map((line, idx) => {
    const swap = swapOf(line, idx)
    if (!swap) return line
    return { ingredientRef: { id: swap.replacement.id } as DocumentReference, quantity: swap.grams }
  })
)

/** Pour une part d'un plat ; pour 100 g d'une base (rien sans rendement). */
/**
 * Ajustements du repas, valables pour la recette reçue seulement (pas pour une base ouverte depuis la fiche), et
 * remis à l'échelle des parts affichées : enregistrés pour les parts du repas.
 */
const adjustments = computed(() => (trail.value.length || !props.baseAdjustments?.length || !props.parts ? [] : props.baseAdjustments))
const adjustmentScale = computed(() => (props.parts ? displayedParts.value / props.parts : 1))

/** Pour une part d'un plat (bases ajustées du repas comprises) ; pour 100 g d'une base (rien sans rendement). */
const macros = computed(() => {
  const total = macrosForRecipe(effectiveLines.value, props.ingredientsById, persons.value)
  if (!isBase.value) {
    if (!adjustments.value.length || !shown.value || !props.parts) return total
    const delta = baseAdjustmentDelta(shown.value, props.parts, adjustments.value, props.ingredientsById)
    const perPart = (n: number, d: number) => Math.max(0, n + d / props.parts!)
    return { calories: perPart(total.calories, delta.calories), protein: perPart(total.protein, delta.protein), carbohydrates: perPart(total.carbohydrates, delta.carbohydrates), fat: perPart(total.fat, delta.fat) }
  }
  const grams = yieldGrams.value
  if (!grams) return { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
  const per100 = (n: number) => (n * 100) / grams
  return { calories: per100(total.calories), protein: per100(total.protein), carbohydrates: per100(total.carbohydrates), fat: per100(total.fat) }
})
const hasMacros = computed(() => {
  const m = macros.value
  return m.calories > 0 || m.protein > 0 || m.carbohydrates > 0 || m.fat > 0
})

/** Lignes d'ingrédients résolues (nom + quantité affichable), avec l'original d'une ligne remplacée. */
interface SheetLine {
  key: string
  idx: number
  label: string
  quantityLabel: string
  equivalentLabel?: string
  /** Base que la ligne ouvre (ligne de base). */
  base: Recipe | null
  /** Ingrédient d'origine d'une ligne remplacée sur la fiche. */
  original: null | { label: string, quantityLabel: string, equivalentLabel?: string, delta: { carbohydrates: number, protein: number, fat: number } }
  /** Base ajustée sur le repas : ce que prévoyait la recette, `null` pour une base ajoutée au repas. */
  planned?: string | null
}

/** Ligne d'une base ajustée sur le repas : la quantité mangée, à l'échelle des parts affichées. */
const adjustedLine = (adjusted: MealBaseAdjustment, key: string, idx: number) => {
  const line = { recipeRef: { id: adjusted.recipeId } as DocumentReference, quantity: adjusted.quantity, ...(adjusted.unit ? { unit: adjusted.unit } : {}) }
  const described = describeRecipeLine(line, props.ingredientsById, adjustmentScale.value)
  return {
    key,
    idx,
    label: described?.label ?? 'Base introuvable',
    quantityLabel: described?.quantityLabel ?? `${adjusted.quantity}`,
    equivalentLabel: described?.equivalentLabel,
    original: null,
  }
}

const lines = computed<SheetLine[]>(() => {
  const recipe = shown.value
  if (!recipe?.ingredients?.length) return []
  const adjustedById = new Map(adjustments.value.map(a => [a.recipeId, a]))
  const shownBases = new Set<string>()
  const result = recipe.ingredients.flatMap<SheetLine>((line, idx) => {
    const described = describeRecipeLine(line, props.ingredientsById, factor.value)
    const original = {
      label: described?.label ?? 'Ingrédient introuvable',
      quantityLabel: described?.quantityLabel ?? `${line.quantity}`,
      equivalentLabel: described?.equivalentLabel,
    }
    // Une ligne de base ouvre la recette de la base : on ne la remplace pas.
    const base = props.ingredientsById.get(lineSourceKey(line) ?? '')?.baseRecipe ?? null
    const key = `${lineSourceKey(line) ?? 'unknown'}-${idx}`
    const baseId = baseIdOfKey(lineSourceKey(line))
    if (baseId) {
      const adjusted = adjustedById.get(baseId)
      if (!adjusted) return [{ key, idx, ...original, label: described?.label ?? 'Base introuvable', base, original: null }]
      // Base ajustée sur le repas : la quantité mangée, une seule fois même si la recette la cite sur plusieurs lignes.
      if (shownBases.has(baseId)) return []
      shownBases.add(baseId)
      const planned = recipe.ingredients!.filter(l => lineBaseId(l) === baseId)
        .map(l => describeRecipeLine(l, props.ingredientsById, factor.value)?.quantityLabel ?? '').join(' + ')
      return [{ ...adjustedLine(adjusted, key, idx), base, planned }]
    }
    const swap = swapOf(line, idx)
    if (!swap) return [{ key, idx, ...original, base: null, original: null }]

    const grams = swap.grams * factor.value
    return [{
      key,
      idx,
      base: null,
      label: swap.replacement.label,
      quantityLabel: formatKitchenGrams(grams),
      equivalentLabel: nearestUnitLabel(swap.replacement, grams) ?? undefined,
      original: {
        ...original,
        delta: {
          carbohydrates: swap.delta.carbohydrates * factor.value,
          protein: swap.delta.protein * factor.value,
          fat: swap.delta.fat * factor.value,
        },
      },
    }]
  })
  // Bases ajoutées au repas, absentes de la recette : à la suite des ingrédients.
  for (const adjusted of adjustments.value) {
    if (shownBases.has(adjusted.recipeId) || recipe.ingredients.some(l => lineBaseId(l) === adjusted.recipeId)) continue
    const base = props.ingredientsById.get(baseKey(adjusted.recipeId))?.baseRecipe ?? null
    result.push({ ...adjustedLine(adjusted, `added-${adjusted.recipeId}`, -1), base, planned: null })
  }
  return result
})

const variantNote = computed(() => {
  const replaced = lines.value.filter(line => line.original)
  if (!replaced.length) return null
  return `Variante : ${replaced.map(line => `${line.label} au lieu de ${line.original!.label}`).join(' ; ')}`
})

const unswap = (idx: number) => {
  const { [idx]: _, ...rest } = swaps.value
  swaps.value = rest
}

/** Ligne dont on choisit le remplaçant. */
const swapIdx = ref<number | null>(null)
const swapOpen = ref(false)
const swapLine = computed(() => (swapIdx.value == null ? null : shown.value?.ingredients?.[swapIdx.value] ?? null))
const openSwap = (idx: number) => {
  swapIdx.value = idx
  swapOpen.value = true
}
const pickSwap = (ingredientId: string) => {
  if (swapIdx.value == null) return
  swaps.value = { ...swaps.value, [swapIdx.value]: ingredientId }
}

/**
 * Accès au remplacement : appui long au doigt (un simple toucher ne fait rien, on fait défiler la fiche), clic à la
 * souris, Entrée au clavier. Pendant l'appui, la ligne se remplit pour montrer que l'appui est pris en compte.
 */
const isTouch = useMediaQuery('(pointer: coarse)')
const LONG_PRESS_MS = 450
const pressedIdx = ref<number | null>(null)
let pressTimer: ReturnType<typeof setTimeout> | undefined
let pressOrigin: { x: number; y: number } | null = null
let lastPointerType: string | null = null

const cancelPress = () => {
  clearTimeout(pressTimer)
  pressedIdx.value = null
  pressOrigin = null
}
const onLinePointerDown = (event: PointerEvent, idx: number) => {
  lastPointerType = event.pointerType
  if (event.pointerType !== 'touch') return
  cancelPress()
  pressedIdx.value = idx
  pressOrigin = { x: event.clientX, y: event.clientY }
  pressTimer = setTimeout(() => {
    pressedIdx.value = null
    navigator.vibrate?.(10)
    openSwap(idx)
  }, LONG_PRESS_MS)
}
const onLinePointerMove = (event: PointerEvent) => {
  if (pressOrigin && Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 10) cancelPress()
}
const onLineClick = (idx: number) => {
  const fromTouch = lastPointerType === 'touch'
  lastPointerType = null
  if (!fromTouch) openSwap(idx)
}
onBeforeUnmount(cancelPress)

const scaledNote = computed(() =>
  isScaled.value ? `Quantités pour ${formatParts(displayedParts.value)} (recette prévue pour ${formatParts(persons.value)})` : null
)

/**
 * Export PDF : ouvre la boîte d'impression du navigateur ("Enregistrer en PDF") en n'imprimant
 * que `RecipePrintSheet`. Le titre du document sert de nom de fichier proposé.
 */
const printRecipe = async () => {
  const recipe = shown.value
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
  if (!shown.value) return
  editedRecipe.value = shown.value
  open.value = false
  // Le formulaire se remplit en passant de fermé à ouvert : il doit être monté fermé avant de s'ouvrir.
  await nextTick()
  formOpen.value = true
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="shown?.title"
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
        <UPopover v-if="shown" v-model:open="timerLauncherOpen" :content="{ align: 'end', sideOffset: 6 }">
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
                :recipe="{ id: shown.id, title: shown.title, parts: displayedParts }"
                @started="timerLauncherOpen = false"
              />
            </div>
          </template>
        </UPopover>
        <UButton
          v-if="shown"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          aria-label="Modifier la recette"
          title="Modifier la recette"
          class="shrink-0"
          @click="editRecipe"
        />
        <!-- Base : la ranger au stock, en grammes (son rendement proposé). -->
        <UButton
          v-if="shown && isBase"
          icon="i-lucide-archive"
          color="neutral"
          variant="ghost"
          aria-label="Mettre au stock"
          title="Mettre au stock"
          class="shrink-0"
          @click="() => { baseStockOpen = true }"
        />
        <UButton
          v-if="shown"
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
        v-if="open && shown"
        :recipe="shown"
        :lines="lines"
        :macros="hasMacros ? macros : null"
        :parts-label="formatParts(displayedParts)"
        :scaled-note="scaledNote"
        :variant-note="variantNote"
        :source-label="sourceLabel"
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

        <!-- Base ouverte depuis une ligne : retour à la recette d'où l'on vient. -->
        <UButton
          v-if="previous"
          icon="i-lucide-arrow-left"
          :label="previous.title"
          color="neutral"
          variant="link"
          size="sm"
          class="-my-2 -ms-2.5 self-start max-w-full"
          :ui="{ label: 'truncate' }"
          :aria-label="`Revenir à ${previous.title}`"
          @click="goBack"
        />

        <img
          v-if="shown?.imageUrl"
          :src="shown.imageUrl"
          :alt="shown.title"
          class="w-full h-40 object-cover rounded-lg"
        />

        <!-- Repas / difficulté / parts / temps : une seule ligne étirée sur toute la largeur ; un libellé trop long se tronque.
             Le badge des parts part d'une base fixe pour que le variateur ne décale pas ses voisins. -->
        <div class="flex items-center gap-1.5 *:min-w-0 *:grow *:justify-center">
          <UBadge
            v-if="shown?.type"
            :icon="isBase ? recipeTypeIcon(shown.type)! : 'i-lucide-utensils'"
            :label="recipeTypeLabel(shown.type)"
            :title="recipeTypeLabel(shown.type)"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            icon="i-lucide-gauge"
            :label="recipeDifficultyLabel(shown?.difficulty)"
            :title="recipeDifficultyLabel(shown?.difficulty)"
            :color="recipeDifficultyColor(shown?.difficulty)"
            variant="subtle"
            size="sm"
          />
          <UBadge
            :icon="isBase ? 'i-lucide-weight' : 'i-lucide-users'"
            :label="formatParts(displayedParts)"
            :title="isBase ? 'Rendement' : undefined"
            :color="isScaled ? 'primary' : 'neutral'"
            variant="subtle"
            size="sm"
            class="basis-22 shrink-0 tabular-nums"
          />
          <UBadge
            v-if="shown?.prepTime != null"
            icon="i-lucide-clock"
            :label="`${shown.prepTime} min`"
            :title="`Préparation : ${shown.prepTime} min`"
            :aria-label="`Préparation : ${shown.prepTime} min`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="shown?.cookTime != null"
            icon="i-lucide-cooking-pot"
            :label="`${shown.cookTime} min`"
            :title="`Cuisson : ${shown.cookTime} min`"
            :aria-label="`Cuisson : ${shown.cookTime} min`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>

        <!-- Valeurs nutritionnelles -->
        <div v-if="hasMacros">
          <p class="text-xs text-dimmed mb-2">
            Valeurs nutritionnelles {{ isBase ? 'pour 100 g' : 'pour une part' }}<span v-if="hasSwaps" class="font-medium text-primary"> · avec variante</span><span v-if="adjustments.length && !isBase" class="font-medium text-primary"> · bases du repas</span>
          </p>
          <IngredientMacroSummary :macros="macros" />
        </div>
        <p v-if="!hasMacros" class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
          {{ isBase && !yieldGrams ? 'Rendement à compléter pour calculer les valeurs' : 'Valeurs non renseignées' }}
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
              <div role="group" :aria-label="isBase ? 'Quantité préparée pour le calcul des ingrédients' : 'Parts pour le calcul des quantités'" class="flex items-center rounded-md ring ring-inset ring-accented">
                <UButton
                  icon="i-lucide-minus"
                  color="neutral"
                  variant="link"
                  size="sm"
                  :aria-label="isBase ? 'Retirer une demi-fournée' : 'Retirer une demi-part'"
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
                  :aria-label="isBase ? 'Ajouter une demi-fournée' : 'Ajouter une demi-part'"
                  @click="stepParts(1)"
                />
              </div>
            </div>
          </div>
          <p v-if="lines.length" class="-mt-1 mb-2 text-xs text-dimmed">
            {{ isTouch ? 'Appui long' : 'Clic' }} sur un ingrédient pour le remplacer à kcal égales.
          </p>
          <ul v-if="lines.length" class="rounded-lg border border-default bg-elevated overflow-hidden">
            <li
              v-for="line in lines"
              :key="line.key"
              class="flex items-stretch border-b border-default last:border-b-0"
            >
              <!--
                Ligne de base : un simple toucher ouvre sa recette dans la fiche (retour en tête), on ne la remplace pas.
                Ajustée sur le repas : la quantité mangée en indigo, avec ce que prévoyait la recette en dessous.
              -->
              <button
                v-if="line.base || line.planned !== undefined"
                type="button"
                class="group flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 text-start transition-colors hover:bg-accented/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                :aria-label="`Ouvrir la base ${line.label}, ${line.quantityLabel}${line.planned ? `, prévu ${line.planned}` : line.planned === null ? ', ajoutée au repas' : ''}`"
                :disabled="!line.base"
                @click="line.base && openRecipe(line.base)"
              >
                <span class="flex items-center justify-between gap-3">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <UIcon name="i-lucide-cooking-pot" class="size-3.5 shrink-0 group-hover:text-primary" :class="line.planned !== undefined ? 'text-primary' : 'text-muted'" aria-hidden="true" />
                    <span class="text-sm font-medium text-highlighted truncate group-hover:text-primary">{{ line.label }}</span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1.5">
                    <span class="text-sm tabular-nums" :class="line.planned !== undefined ? 'font-semibold text-primary' : 'text-muted'">
                      {{ line.quantityLabel }}
                      <span v-if="line.equivalentLabel" class="font-normal text-dimmed">{{ line.equivalentLabel }}</span>
                    </span>
                    <UIcon v-if="line.base" name="i-lucide-chevron-right" class="size-4 text-dimmed" aria-hidden="true" />
                  </span>
                </span>
                <span v-if="line.planned !== undefined" class="ps-5 text-xs tabular-nums text-dimmed">
                  {{ line.planned ? `Ajustée sur ce repas · la recette prévoit ${line.planned}` : 'Ajoutée à ce repas' }}
                </span>
              </button>
              <!-- Appui long au doigt, clic à la souris : pas de bouton dédié sur la ligne. -->
              <button
                v-else
                type="button"
                class="relative flex min-w-0 flex-1 cursor-pointer select-none flex-col gap-0.5 overflow-hidden px-3 py-2.5 text-start transition-colors [-webkit-touch-callout:none] hover:bg-accented/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                :aria-label="`Remplacer ${line.label}`"
                :aria-haspopup="'dialog'"
                @pointerdown="onLinePointerDown($event, line.idx)"
                @pointermove="onLinePointerMove"
                @pointerup="cancelPress"
                @pointercancel="cancelPress"
                @pointerleave="cancelPress"
                @contextmenu.prevent
                @click="onLineClick(line.idx)"
              >
                <span
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-0 origin-left bg-primary/10 motion-reduce:transition-none"
                  :class="pressedIdx === line.idx
                    ? 'scale-x-100 transition-transform duration-[450ms] ease-linear'
                    : 'scale-x-0 transition-none'"
                />
                <span class="relative flex items-center justify-between gap-3">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <UIcon v-if="line.original" name="i-lucide-arrow-left-right" class="size-3.5 shrink-0 text-primary" />
                    <span class="text-sm font-medium text-highlighted truncate">{{ line.label }}</span>
                  </span>
                  <span class="text-sm tabular-nums shrink-0" :class="line.original ? 'font-semibold text-highlighted' : 'text-muted'">
                    {{ line.quantityLabel }}
                    <span v-if="line.equivalentLabel" class="font-normal text-dimmed">{{ line.equivalentLabel }}</span>
                  </span>
                </span>
                <span v-if="line.original" class="relative flex items-center justify-between gap-3 text-xs">
                  <span class="min-w-0 truncate text-dimmed line-through">
                    {{ line.original.label }} {{ line.original.quantityLabel }}
                  </span>
                  <MacroDeltaLabels :delta="line.original.delta" class="shrink-0" />
                </span>
              </button>
              <UButton
                v-if="line.original"
                icon="i-lucide-undo-2"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Revenir à ${line.original.label}`"
                :title="`Revenir à ${line.original.label}`"
                class="shrink-0 self-center me-1"
                @click="unswap(line.idx)"
              />
            </li>
          </ul>
          <p v-else class="flex items-center gap-1.5 text-xs text-dimmed">
            <UIcon name="i-lucide-circle-slash" class="size-3.5 shrink-0" />
            Aucun ingrédient
          </p>
        </div>

        <!-- Instructions -->
        <div v-if="shown?.instructions">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-list-ordered" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Instructions</p>
          </div>
          <p class="text-sm text-muted whitespace-pre-line">{{ shown.instructions }}</p>
        </div>

        <!-- Base : les plats qui la prennent, à ouvrir dans la fiche. -->
        <div v-if="isBase">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-link" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">
              Utilisée dans <span v-if="usedIn.length" class="tabular-nums">{{ usedIn.length }} recette{{ usedIn.length > 1 ? 's' : '' }}</span>
            </p>
          </div>
          <ul v-if="usedIn.length" class="rounded-lg border border-default overflow-hidden">
            <li v-for="using in usedIn" :key="using.id" class="border-b border-default last:border-b-0">
              <button
                type="button"
                class="group flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-start transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                @click="openRecipe(using)"
              >
                <span class="flex min-w-0 items-center gap-1.5">
                  <UIcon v-if="recipeTypeIcon(using.type)" :name="recipeTypeIcon(using.type)!" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                  <span class="text-sm font-medium text-highlighted truncate group-hover:text-primary">{{ using.title }}</span>
                </span>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p v-else class="text-xs text-dimmed text-pretty">
            Aucune recette pour l'instant. Ajoutez-la comme ingrédient d'un plat, sous « Bases maison ».
          </p>
        </div>

        <!-- Tags -->
        <div v-if="shown?.tags?.length">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-tag" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Tags</p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <template v-if="onSelectTag">
              <UButton
                v-for="tag in shown.tags"
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
                v-for="tag in shown.tags"
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
        <div v-if="shown?.description">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-text" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Description</p>
          </div>
          <p class="text-sm text-muted whitespace-pre-line">{{ shown.description }}</p>
        </div>

        <!-- Source : le livre (vers sa fiche dans la bibliothèque), sinon le texte libre -->
        <div v-if="book">
          <p class="text-xs text-dimmed mb-1.5">Source</p>
          <NuxtLink
            :to="{ path: '/dashboard/bibliotheque', query: { livre: book.id } }"
            class="group -mx-1.5 flex items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
            @click="open = false"
          >
            <div class="w-9 shrink-0">
              <BookCover :book="book" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted group-hover:text-primary">{{ book.title }}</p>
              <p class="truncate text-xs text-muted">
                <template v-if="shown?.bookPage"><span class="tabular-nums">{{ formatBookPage(shown.bookPage) }}</span></template>
                <template v-if="shown?.bookPage && book.authors.length"> · </template>
                {{ bookAuthorsLabel(book) }}
              </p>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
          </NuxtLink>
        </div>
        <div v-else-if="shown?.source">
          <p class="text-xs text-dimmed mb-1">Source</p>
          <p class="text-sm text-muted">{{ shown.source }}</p>
        </div>

        <!-- Modifiée le -->
        <div v-if="shown">
          <p class="text-xs text-dimmed mb-1">Modifiée le</p>
          <p class="text-sm text-muted">{{ formatDate(shown.updatedAt) }}</p>
        </div>
      </div>
    </template>
  </USlideover>

  <RecipeIngredientSwapModal
    v-model:open="swapOpen"
    :line="swapLine"
    :ingredients-by-id="ingredientsById"
    :factor="factor"
    :current-id="swapIdx == null ? undefined : swaps[swapIdx]"
    @pick="pickSwap"
  />

  <RecipeFormSlideover v-if="editedRecipe" v-model:open="formOpen" :recipe="editedRecipe" />

  <BaseStockModal v-if="isBase" v-model:open="baseStockOpen" :base="shown" />
</template>
