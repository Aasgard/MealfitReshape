<script setup lang="ts">
import { collection, addDoc, updateDoc, doc, Timestamp, deleteField } from 'firebase/firestore'
import type { Ingredient } from '~/types/ingredient'
import { useIngredientCategoriesStore } from '~/stores/ingredientCategories'
import { parsePositiveNumber } from '~/utils/numberInput'

/**
 * Slideover d'ajout/modification d'ingrédient — un seul composant pour les deux modes.
 * `ingredient` nul = création ; non nul = édition (le formulaire est pré-rempli à l'ouverture).
 */
const props = defineProps<{
  ingredient: Ingredient | null
}>()

const open = defineModel<boolean>('open', { default: false })

const db = useFirestore()
const user = useCurrentUser()
const toast = useToast()
const { generate: generateFirestoreId } = useFirestoreId()
const ingredientCategoriesStore = useIngredientCategoriesStore()

const isEditMode = computed(() => props.ingredient !== null)
const title = computed(() => isEditMode.value ? `Modifier ${props.ingredient?.label}` : 'Ajouter un ingrédient')

const categoryOptions = computed(() =>
  ingredientCategoriesStore.categories.map(c => ({ id: c.id, label: c.label, icon: c.icon }))
)

const monthAbbreviations = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

interface VariationRow {
  key: string
  label: string
  value: string
}

const label = ref('')
const categoryId = ref<string | null>(null)
const unit = ref<'g' | 'ml'>('g')
const calories = ref('')
const protein = ref('')
const carbohydrates = ref('')
const fat = ref('')
const activeMonths = ref<number[]>([])
const variationRows = ref<VariationRow[]>([])
const comment = ref('')
const saving = ref(false)
const submitted = ref(false)

function resetForm() {
  const ing = props.ingredient
  label.value = ing?.label ?? ''
  categoryId.value = ing?.category?.id ?? null
  unit.value = ing?.unit ?? 'g'
  calories.value = ing?.valuesBy100 ? String(ing.valuesBy100.calories) : ''
  protein.value = ing?.valuesBy100 ? String(ing.valuesBy100.protein) : ''
  carbohydrates.value = ing?.valuesBy100 ? String(ing.valuesBy100.carbohydrates) : ''
  fat.value = ing?.valuesBy100 ? String(ing.valuesBy100.fat) : ''
  activeMonths.value = ing?.activeMonths ? [...ing.activeMonths] : []
  variationRows.value = ing?.variations
    ? Object.entries(ing.variations).map(([key, v]) => ({ key, label: v.label, value: String(v.value) }))
    : []
  comment.value = ing?.comment ?? ''
  submitted.value = false
}

watch(open, (isOpen) => {
  if (isOpen) resetForm()
})

function toggleMonth(month: number) {
  const i = activeMonths.value.indexOf(month)
  if (i === -1) activeMonths.value.push(month)
  else activeMonths.value.splice(i, 1)
}

function addVariationRow() {
  variationRows.value.push({ key: generateFirestoreId(), label: '', value: '' })
}

function removeVariationRow(key: string) {
  variationRows.value = variationRows.value.filter(r => r.key !== key)
}

const labelError = computed(() => (submitted.value && !label.value.trim()) ? 'Requis' : undefined)
const categoryError = computed(() => (submitted.value && !categoryId.value) ? 'Requis' : undefined)

const macrosStarted = computed(() =>
  [calories.value, protein.value, carbohydrates.value, fat.value].some(v => v.trim() !== '')
)

function macroFieldError(raw: string) {
  if (!submitted.value) return undefined
  if (!raw.trim()) return macrosStarted.value ? 'Requis si une valeur nutritionnelle est renseignée' : undefined
  return parsePositiveNumber(raw) === null ? 'Nombre invalide' : undefined
}

const caloriesError = computed(() => macroFieldError(calories.value))
const proteinError = computed(() => macroFieldError(protein.value))
const carbohydratesError = computed(() => macroFieldError(carbohydrates.value))
const fatError = computed(() => macroFieldError(fat.value))

function variationLabelError(row: VariationRow) {
  return submitted.value && !row.label.trim() ? 'Requis' : undefined
}

function variationValueError(row: VariationRow) {
  if (!submitted.value) return undefined
  if (!row.value.trim()) return 'Requis'
  return parsePositiveNumber(row.value) === null ? 'Nombre invalide' : undefined
}

const isValid = computed(() => {
  if (!label.value.trim()) return false
  if (!categoryId.value) return false
  if (macrosStarted.value && [calories.value, protein.value, carbohydrates.value, fat.value].some(v => parsePositiveNumber(v) === null)) {
    return false
  }
  if (variationRows.value.some(r => !r.label.trim() || parsePositiveNumber(r.value) === null)) return false
  return true
})

async function handleSubmit() {
  submitted.value = true
  if (!isValid.value) return

  if (!user.value) {
    toast.add({ title: 'Erreur', description: 'Vous devez être connecté.', color: 'error' })
    return
  }

  saving.value = true
  try {
    const now = Timestamp.now()
    const categoryRef = doc(db, 'ingredientCategories', categoryId.value!)

    const variations: Record<string, { label: string; value: number }> = {}
    for (const row of variationRows.value) {
      variations[row.key] = { label: row.label.trim(), value: parsePositiveNumber(row.value)! }
    }

    const trimmedLabel = label.value.trim()

    const payload: Record<string, unknown> = {
      label: trimmedLabel,
      category: categoryRef,
      unit: unit.value,
      activeMonths: activeMonths.value,
      comment: comment.value.trim(),
      variations,
      updatedAt: now,
    }

    if (macrosStarted.value) {
      payload.valuesBy100 = {
        calories: parsePositiveNumber(calories.value)!,
        protein: parsePositiveNumber(protein.value)!,
        carbohydrates: parsePositiveNumber(carbohydrates.value)!,
        fat: parsePositiveNumber(fat.value)!,
      }
    } else if (isEditMode.value) {
      // L'utilisateur a vidé les 4 champs alors que l'ingrédient avait des valeurs : on les retire.
      payload.valuesBy100 = deleteField()
    }

    if (isEditMode.value) {
      await updateDoc(doc(db, 'ingredients', props.ingredient!.id), payload)
      toast.add({ title: 'Modifié', description: `« ${trimmedLabel} » a été mis à jour`, color: 'success' })
    } else {
      await addDoc(collection(db, 'ingredients'), {
        ...payload,
        owner: user.value.uid,
        createdAt: now,
      })
      toast.add({ title: 'Ajouté', description: `« ${trimmedLabel} » a été ajouté à vos ingrédients`, color: 'success' })
    }

    open.value = false
  } catch (error: any) {
    toast.add({
      title: 'Erreur',
      description: error.message || `Une erreur est survenue lors de ${isEditMode.value ? 'la modification' : "l'ajout"}.`,
      color: 'error'
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
    :dismissible="!saving"
    :close="!saving"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-4">
          <UFormField label="Nom" :error="labelError">
            <UInput v-model="label" placeholder="ex : Tomate" size="md" variant="outline" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Catégorie" :error="categoryError">
              <USelectMenu
                v-model="categoryId"
                :items="categoryOptions"
                value-key="id"
                placeholder="Choisir..."
                :search-input="{ placeholder: 'Rechercher...' }"
                icon="i-lucide-shapes"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Unité">
              <div class="flex gap-2">
                <UButton
                  label="g"
                  :color="unit === 'g' ? 'primary' : 'neutral'"
                  :variant="unit === 'g' ? 'solid' : 'outline'"
                  :aria-pressed="unit === 'g'"
                  class="flex-1 justify-center"
                  @click="unit = 'g'"
                />
                <UButton
                  label="ml"
                  :color="unit === 'ml' ? 'primary' : 'neutral'"
                  :variant="unit === 'ml' ? 'solid' : 'outline'"
                  :aria-pressed="unit === 'ml'"
                  class="flex-1 justify-center"
                  @click="unit = 'ml'"
                />
              </div>
            </UFormField>
          </div>
        </div>

        <!-- Valeurs nutritionnelles -->
        <div>
          <p class="text-xs text-dimmed mb-2">Valeurs pour 100{{ unit }} (optionnel)</p>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Calories (kcal)" :error="caloriesError">
              <UInput v-model="calories" type="text" inputmode="decimal" placeholder="ex : 52" size="md" variant="outline" class="w-full" />
            </UFormField>
            <UFormField label="Glucides (g)" :error="carbohydratesError">
              <UInput v-model="carbohydrates" type="text" inputmode="decimal" placeholder="ex : 14" size="md" variant="outline" class="w-full" />
            </UFormField>
            <UFormField label="Protéines (g)" :error="proteinError">
              <UInput v-model="protein" type="text" inputmode="decimal" placeholder="ex : 0.3" size="md" variant="outline" class="w-full" />
            </UFormField>
            <UFormField label="Lipides (g)" :error="fatError">
              <UInput v-model="fat" type="text" inputmode="decimal" placeholder="ex : 0.2" size="md" variant="outline" class="w-full" />
            </UFormField>
          </div>
        </div>

        <!-- Disponibilité par mois -->
        <div>
          <p class="text-xs text-dimmed mb-2">Disponibilité (optionnel)</p>
          <div class="grid grid-cols-12 gap-1">
            <button
              v-for="(monthLabel, idx) in monthAbbreviations"
              :key="idx"
              type="button"
              :aria-pressed="activeMonths.includes(idx + 1)"
              :aria-label="monthNames[idx]"
              :title="monthNames[idx]"
              class="flex items-center justify-center rounded text-xs font-medium h-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
              :class="activeMonths.includes(idx + 1) ? 'bg-primary text-white' : 'bg-accented text-dimmed hover:bg-accented/70'"
              @click="toggleMonth(idx + 1)"
            >
              {{ monthLabel }}
            </button>
          </div>
        </div>

        <!-- Variations / équivalents -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-git-branch" class="size-3.5 text-muted shrink-0" />
              <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Variations (optionnel)</p>
            </div>
            <UButton label="Ajouter" icon="i-lucide-plus" size="xs" color="neutral" variant="outline" @click="addVariationRow" />
          </div>
          <p v-if="variationRows.length === 0" class="text-xs text-dimmed">
            Aucune portion alternative.
          </p>
          <div v-else class="flex flex-col gap-3">
            <div v-for="row in variationRows" :key="row.key" class="flex items-start gap-2">
              <UFormField class="flex-1" :error="variationLabelError(row)">
                <UInput v-model="row.label" placeholder="ex : Tranche" size="md" variant="outline" class="w-full" />
              </UFormField>
              <UFormField class="w-24 shrink-0" :error="variationValueError(row)">
                <UInput v-model="row.value" type="text" inputmode="decimal" :placeholder="unit" size="md" variant="outline" class="w-full" />
              </UFormField>
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="md"
                :aria-label="`Supprimer la variation ${row.label || ''}`"
                class="mt-0.5"
                @click="removeVariationRow(row.key)"
              />
            </div>
          </div>
        </div>

        <!-- Commentaire -->
        <UFormField label="Commentaire (optionnel)">
          <UTextarea v-model="comment" :rows="2" placeholder="Note libre..." variant="outline" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton label="Annuler" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
      <UButton label="Enregistrer" color="primary" :loading="saving" @click="handleSubmit" />
    </template>
  </USlideover>
</template>
