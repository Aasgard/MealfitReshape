<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import { categoryIconName } from '~/utils/categoryIcon'
import { ingredientUnitEntries, macrosForUnit } from '~/utils/ingredientNutrition'

/** Fiche d'un ingrédient : catégorie, valeurs pour 100 g, saisonnalité, unités équivalentes. */
const props = withDefaults(defineProps<{
  ingredient: Ingredient | null
  /** Affiche le bouton "Modifier" (ingrédient privé de l'utilisateur). */
  editable?: boolean
}>(), {
  editable: false,
})

const emit = defineEmits<{
  edit: []
}>()

const open = defineModel<boolean>('open', { default: false })
useOverlayBackClose(open)

const { formatDate } = useDateFormat()

const monthAbbreviations = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const unitRows = computed(() => {
  const ing = props.ingredient
  if (!ing) return []
  return ingredientUnitEntries(ing).map((v) => ({
    ...v,
    scaled: macrosForUnit(ing, v.id),
  }))
})

const isAllYear = computed(() => (props.ingredient?.activeMonths?.length ?? 0) === 12)
</script>

<template>
  <USlideover v-model:open="open">
    <template #title>
      <div class="flex items-center gap-2">
        <span>{{ ingredient?.label }}</span>
        <UButton
          v-if="ingredient && editable"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Modifier ${ingredient.label}`"
          @click="emit('edit')"
        />
      </div>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <!-- Catégorie -->
        <div v-if="ingredient?.category?.label">
          <p class="text-xs text-dimmed mb-1">Catégorie</p>
          <p class="text-sm text-muted flex items-center gap-1.5">
            <UIcon v-if="categoryIconName(ingredient.category.icon)" :name="categoryIconName(ingredient.category.icon)!" class="size-3.5 shrink-0" />
            {{ ingredient.category.label }}
          </p>
        </div>

        <!-- Densité -->
        <div v-if="ingredient?.density != null">
          <p class="text-xs text-dimmed mb-1">Densité</p>
          <p class="text-sm text-muted">{{ ingredient.density }} g/ml</p>
        </div>

        <!-- Valeurs nutritionnelles -->
        <div v-if="ingredient?.valuesBy100">
          <p class="text-xs text-dimmed mb-2">Pour 100 g</p>
          <IngredientMacroSummary :macros="ingredient.valuesBy100" />
        </div>

        <!-- Disponibilité par mois -->
        <div>
          <p class="text-xs text-dimmed mb-2">Disponibilité</p>
          <p v-if="isAllYear" class="text-sm text-muted">
            Toute l'année
          </p>
          <div
            v-else
            class="grid grid-cols-12 gap-1"
            role="group"
            :aria-label="`Disponibilité : ${ingredient?.activeMonths?.length ?? 0} mois sur 12`"
          >
            <div
              v-for="(label, idx) in monthAbbreviations"
              :key="idx"
              role="img"
              :aria-label="`${monthNames[idx]} — ${ingredient?.activeMonths?.includes(idx + 1) ? 'en saison' : 'hors saison'}`"
              :title="monthNames[idx]"
              class="flex items-center justify-center rounded text-xs font-medium h-6 transition-colors"
              :class="ingredient?.activeMonths?.includes(idx + 1)
                ? 'bg-primary text-white'
                : 'bg-accented text-dimmed'"
            >
              {{ label }}
            </div>
          </div>
        </div>

        <!-- Unités / équivalents -->
        <div v-if="unitRows.length">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-git-branch" class="size-3.5 text-muted shrink-0" />
            <p class="text-xs text-dimmed font-medium uppercase tracking-wide">Unités</p>
          </div>
          <p class="text-xs text-dimmed mb-3">
            Autres portions équivalentes.
          </p>
          <ul class="flex flex-col gap-3">
            <li
              v-for="v in unitRows"
              :key="v.id"
              class="rounded-lg border border-default bg-elevated/30 overflow-hidden"
            >
              <div class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-default/60">
                <span class="text-sm font-medium text-highlighted truncate">{{ v.label }}</span>
                <span class="text-sm tabular-nums text-muted shrink-0">
                  {{ v.value }}&nbsp;{{ v.unit }}
                </span>
              </div>
              <div
                v-if="v.scaled"
                class="p-3"
              >
                <IngredientMacroSummary :macros="v.scaled" :show-bar="false" />
              </div>
              <div
                v-else
                class="px-3 py-2 text-xs text-dimmed"
              >
                Ajoutez les valeurs nutritionnelles et, si cette unité est en ml, la densité de l’ingrédient pour afficher l’équivalent.
              </div>
            </li>
          </ul>
        </div>

        <!-- Commentaire -->
        <div v-if="ingredient?.comment">
          <p class="text-xs text-dimmed mb-1">Commentaire</p>
          <p class="text-sm text-muted">{{ ingredient.comment }}</p>
        </div>

        <!-- Modifié le -->
        <div v-if="ingredient">
          <p class="text-xs text-dimmed mb-1">Modifié le</p>
          <p class="text-sm text-muted">{{ formatDate(ingredient.updatedAt) }}</p>
        </div>
      </div>
    </template>
  </USlideover>
</template>
