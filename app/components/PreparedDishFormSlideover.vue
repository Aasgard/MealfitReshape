<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import type { DishStorage, PreparedDish } from '~/types/preparedDish'
import type { Recipe } from '~/types/recipe'
import type { IngredientMacros } from '~/utils/ingredientNutrition'
import { dayKeyOf } from '~/utils/menuWeek'
import { parseNonNegativeNumber } from '~/utils/numberInput'
import { formatParts, STOCK_PARTS_STEP } from '~/utils/preparedDishes'
import { macrosForRecipe } from '~/utils/recipeNutrition'

/**
 * Ajout à la main ou modification d'un plat du stock : une recette de la base (macros par part figées à
 * l'enregistrement) ou un plat hors recette (libellé et macros par part saisis), ses parts, son rangement, son jour de
 * préparation et un commentaire. `dish` nul = ajout.
 */
const props = defineProps<{
  dish: PreparedDish | null
  recipes: Recipe[]
  ingredientsById: Map<string, Ingredient>
  /** Rangement proposé pour un ajout (ex. le groupe depuis lequel on ajoute). */
  defaultStorage?: DishStorage
  /** Parts des repas des menus cuisinés avec une recette ce jour-là : la fournée compte les deux. */
  menuPartsOf?: (recipeId: string, cookDay: string) => number
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const { saveDish } = usePreparedDishes()
const toast = useToast()

const LABEL_MAX = 60
const COMMENT_MAX = 200

const isEditMode = computed(() => props.dish !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.dish?.label}` : 'Ajouter un plat au stock')

type Kind = 'recipe' | 'free'
const kindTabs = [
  { value: 'recipe', label: 'Recette', icon: 'i-lucide-chef-hat' },
  { value: 'free', label: 'Hors recette', icon: 'i-lucide-utensils' },
]

const kind = ref<Kind>('recipe')
const recipeId = ref<string | undefined>(undefined)
const label = ref('')
const kcal = ref('')
const carbohydrates = ref('')
const protein = ref('')
const fat = ref('')
const parts = ref(1)
const storage = ref<DishStorage>('FREEZER')
const preparedOn = ref('')
const comment = ref('')
const submitted = ref(false)
const saving = ref(false)

const today = () => dayKeyOf(new Date())

/** Valeurs affichées dans les champs : entiers, sauf les petites quantités. */
const macroText = (n: number) => String(Math.round(n * 10) / 10)

watch(open, (isOpen) => {
  if (!isOpen) return
  const dish = props.dish
  submitted.value = false
  kind.value = dish && !dish.recipeId ? 'free' : 'recipe'
  recipeId.value = dish?.recipeId
  label.value = dish?.label ?? ''
  kcal.value = dish ? macroText(dish.perPart.calories) : ''
  carbohydrates.value = dish ? macroText(dish.perPart.carbohydrates) : ''
  protein.value = dish ? macroText(dish.perPart.protein) : ''
  fat.value = dish ? macroText(dish.perPart.fat) : ''
  parts.value = dish?.parts ?? 1
  storage.value = dish?.storage ?? props.defaultStorage ?? 'FREEZER'
  preparedOn.value = dish?.preparedOn ?? today()
  comment.value = dish?.comment ?? ''
})

const selectedRecipe = computed(() => props.recipes.find(r => r.id === recipeId.value))

/** Macros d'une part de la recette, non arrondies. */
const recipePerPart = (recipe: Recipe): IngredientMacros =>
  macrosForRecipe(recipe.ingredients, props.ingredientsById, recipe.persons && recipe.persons > 0 ? recipe.persons : 1)

const recipeOptions = computed(() => props.recipes
  .map(r => ({ id: r.id, label: r.title, kcalLabel: `${Math.round(recipePerPart(r).calories)} kcal / part` }))
  .sort((a, b) => a.label.localeCompare(b.label, 'fr')))

/**
 * Macros d'une part à enregistrer. Un plat déjà rangé garde celles figées à son entrée au stock tant que sa recette ne
 * change pas : modifier la recette depuis ne change pas les parts déjà préparées.
 */
const perPart = computed<IngredientMacros | null>(() => {
  if (kind.value === 'recipe') {
    if (!selectedRecipe.value) return null
    if (props.dish?.recipeId === selectedRecipe.value.id) return props.dish.perPart
    return recipePerPart(selectedRecipe.value)
  }
  const values = {
    calories: parseNonNegativeNumber(kcal.value),
    carbohydrates: carbohydrates.value.trim() ? parseNonNegativeNumber(carbohydrates.value) : 0,
    protein: protein.value.trim() ? parseNonNegativeNumber(protein.value) : 0,
    fat: fat.value.trim() ? parseNonNegativeNumber(fat.value) : 0,
  }
  return Object.values(values).some(v => v === null) ? null : values as IngredientMacros
})

const numberError = (raw: string, required: boolean) => {
  if (!submitted.value) return undefined
  if (!raw.trim()) return required ? 'Requis' : undefined
  return parseNonNegativeNumber(raw) === null ? 'Nombre invalide' : undefined
}

const recipeError = computed(() => submitted.value && kind.value === 'recipe' && !recipeId.value ? 'Choisissez une recette' : undefined)
const labelError = computed(() => submitted.value && kind.value === 'free' && !label.value.trim() ? 'Requis' : undefined)
const kcalError = computed(() => numberError(kcal.value, true))
const carbohydratesError = computed(() => numberError(carbohydrates.value, false))
const proteinError = computed(() => numberError(protein.value, false))
const fatError = computed(() => numberError(fat.value, false))
/**
 * Date à venir : une recette à cuisiner ce jour-là pour le stock (fournée sans repas des menus), comptée dans
 * « Cuisiner » et dans la liste de courses. Un plat hors recette n'a rien à cuisiner : il est forcément déjà préparé.
 */
const isPlannedCooking = computed(() => kind.value === 'recipe' && !!preparedOn.value && preparedOn.value > today())

/** Parts du surplus déjà placées dans des repas : comptées dans la fournée, en plus des parts restantes. */
const takenParts = computed(() => props.dish?.batch ? Math.max(0, props.dish.batch.surplusParts - props.dish.parts) : 0)
/** Parts des menus de la même fournée : elles se cuisinent avec celles du stock. */
const menuParts = computed(() =>
  isPlannedCooking.value && recipeId.value ? props.menuPartsOf?.(recipeId.value, preparedOn.value) ?? 0 : 0)

const dateError = computed(() => {
  if (!submitted.value) return undefined
  if (!preparedOn.value) return 'Choisissez une date'
  if (kind.value === 'free' && preparedOn.value > today()) return 'Un plat hors recette doit déjà être préparé'
  return undefined
})

/** Parts restantes : 0 seulement en modification (plat terminé, ou parts jetées). */
const minParts = computed(() => isEditMode.value ? 0 : STOCK_PARTS_STEP)
const stepParts = (direction: 1 | -1) => {
  parts.value = Math.max(minParts.value, parts.value + direction * STOCK_PARTS_STEP)
}

async function handleSubmit() {
  submitted.value = true
  const macros = perPart.value
  const dishLabel = kind.value === 'recipe' ? selectedRecipe.value?.title : label.value.trim()
  if (!macros || !dishLabel || dateError.value) return

  saving.value = true
  try {
    await saveDish({
      label: dishLabel.slice(0, LABEL_MAX),
      recipeId: kind.value === 'recipe' ? recipeId.value : undefined,
      perPart: macros,
      parts: parts.value,
      storage: storage.value,
      preparedOn: preparedOn.value,
      comment: comment.value,
    }, props.dish)
    open.value = false
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: `Le plat n'a pas pu être enregistré : ${error.message || 'une erreur est survenue'}.`,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="isPlannedCooking
      ? 'À cuisiner pour le stock : la recette apparaîtra dans « Cuisiner » ce jour-là.'
      : 'Déjà préparé : il ne se cuisine pas et ses ingrédients ne s\'achètent pas.'"
    :dismissible="!saving"
    :close="!saving"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="handleSubmit">
        <UTabs
          v-model="kind"
          :items="kindTabs"
          :content="false"
          variant="pill"
          size="sm"
          class="w-full"
        />

        <UFormField v-if="kind === 'recipe'" label="Recette" :error="recipeError">
          <USelectMenu
            v-model="recipeId"
            :items="recipeOptions"
            value-key="id"
            placeholder="Choisir une recette..."
            :search-input="{ placeholder: 'Rechercher...' }"
            icon="i-lucide-chef-hat"
            class="w-full"
          >
            <template #item-trailing="{ item }">
              <span class="text-xs text-dimmed tabular-nums">{{ item.kcalLabel }}</span>
            </template>
          </USelectMenu>
        </UFormField>

        <template v-else>
          <UFormField label="Nom" :error="labelError">
            <UInput
              v-model="label"
              placeholder="ex : Soupe de potimarron de mamie"
              :maxlength="LABEL_MAX"
              size="md"
              variant="outline"
              class="w-full"
            />
          </UFormField>
          <!-- Macros d'une part, comme une étiquette : les calories, puis glucides, protéines, lipides. -->
          <fieldset class="flex flex-col gap-3">
            <legend class="mb-2 text-sm font-medium text-default">
              Pour une part
            </legend>
            <UFormField label="Calories (kcal)" :error="kcalError">
              <UInput v-model="kcal" type="text" inputmode="decimal" placeholder="ex : 450" size="md" variant="outline" class="w-full" :ui="{ base: 'tabular-nums' }" />
            </UFormField>
            <div class="grid grid-cols-3 gap-4">
              <UFormField label="Glucides (g)" :error="carbohydratesError">
                <UInput v-model="carbohydrates" type="text" inputmode="decimal" placeholder="0" size="md" variant="outline" class="w-full" :ui="{ base: 'tabular-nums' }" />
              </UFormField>
              <UFormField label="Protéines (g)" :error="proteinError">
                <UInput v-model="protein" type="text" inputmode="decimal" placeholder="0" size="md" variant="outline" class="w-full" :ui="{ base: 'tabular-nums' }" />
              </UFormField>
              <UFormField label="Lipides (g)" :error="fatError">
                <UInput v-model="fat" type="text" inputmode="decimal" placeholder="0" size="md" variant="outline" class="w-full" :ui="{ base: 'tabular-nums' }" />
              </UFormField>
            </div>
          </fieldset>
        </template>

        <p v-if="perPart && kind === 'recipe'" class="rounded-md bg-elevated px-3 py-2 text-sm text-muted tabular-nums">
          <span class="font-semibold text-highlighted">{{ Math.round(perPart.calories) }} kcal</span>
          -
          <MenuMacroLabels :carbohydrates="Math.round(perPart.carbohydrates)" :protein="Math.round(perPart.protein)" :fat="Math.round(perPart.fat)" />
          <span class="text-dimmed"> par part</span>
        </p>

        <UFormField :label="isEditMode ? 'Parts restantes' : 'Parts'">
          <div role="group" aria-label="Nombre de parts" class="flex w-fit items-center gap-1 rounded-md ring ring-inset ring-accented">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="link"
              size="md"
              aria-label="Retirer une demi-part"
              :disabled="parts <= minParts"
              @click="stepParts(-1)"
            />
            <span class="min-w-20 text-center text-sm font-medium text-highlighted tabular-nums" aria-live="polite">
              {{ formatParts(parts) }}
            </span>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="link"
              size="md"
              aria-label="Ajouter une demi-part"
              @click="stepParts(1)"
            />
          </div>
        </UFormField>

        <UFormField label="Rangement">
          <DishStorageSelect v-model="storage" />
        </UFormField>

        <UFormField
          :label="isPlannedCooking ? 'À cuisiner le' : 'Préparé le'"
          :error="dateError"
          :help="kind === 'recipe'
            ? (isPlannedCooking
              ? 'Ses ingrédients s\'ajoutent à la liste de courses de la période (à cocher dans Courses). Le plat est « Prévu » jusqu\'à ce jour.'
              : 'Une date à venir : la recette sera à cuisiner ce jour-là, pour le stock.')
            : undefined"
        >
          <UInput
            v-model="preparedOn"
            type="date"
            :max="kind === 'free' ? today() : undefined"
            icon="i-lucide-calendar"
            class="w-full"
          />
        </UFormField>

        <!-- À cuisiner : les parts de la fournée (menus + stock) devraient faire des recettes entières. -->
        <WholeRecipeAlert
          v-if="isPlannedCooking && selectedRecipe"
          :total="menuParts + takenParts + parts"
          :persons="selectedRecipe.persons"
          :min-total="menuParts + takenParts + STOCK_PARTS_STEP"
          @adjust="parts += $event"
        />

        <UFormField label="Commentaire (optionnel)" :hint="`${comment.length}/${COMMENT_MAX}`">
          <UTextarea
            v-model="comment"
            :rows="2"
            :maxlength="COMMENT_MAX"
            placeholder="ex : ajouter la crème au réchauffage"
            variant="outline"
            class="w-full"
          />
        </UFormField>

        <!-- Permet de valider avec la touche Entrée depuis un champ. -->
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton
        :label="isEditMode ? 'Enregistrer' : isPlannedCooking ? 'Prévoir la cuisine' : 'Ajouter au stock'"
        :icon="isEditMode ? 'i-lucide-check' : isPlannedCooking ? 'i-lucide-calendar-plus' : 'i-lucide-plus'"
        color="primary"
        :loading="saving"
        @click="handleSubmit"
      />
    </template>
  </USlideover>
</template>
