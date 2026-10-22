<script setup lang="ts">
import type { Ingredient } from '~/types/ingredient'
import { categoryIconName } from '~/utils/categoryIcon'
import { ingredientUnitEntries, macrosForUnit } from '~/utils/ingredientNutrition'

/** Fiche d'un ingrédient : catégorie, valeurs pour 100 g, unités équivalentes, saisonnalité, magasins du foyer. */
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

/** Titre de section, le même partout dans la fiche (et dans `IngredientStoresField`). */
const sectionTitle = 'text-sm font-semibold text-highlighted'
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
      <!-- Sections séparées par un filet, chacune sous un titre au même style. -->
      <div class="flex flex-col divide-y divide-default [&>section]:py-5 [&>section:first-child]:pt-0">
        <!-- Catégorie -->
        <section v-if="ingredient?.category?.label" class="flex flex-col gap-1.5">
          <h3 :class="sectionTitle">
            Catégorie
          </h3>
          <p class="flex items-center gap-1.5 text-sm text-default">
            <UIcon v-if="categoryIconName(ingredient.category.icon)" :name="categoryIconName(ingredient.category.icon)!" class="size-4 shrink-0 text-muted" />
            {{ ingredient.category.label }}
          </p>
        </section>

        <!-- Valeurs nutritionnelles -->
        <section v-if="ingredient?.valuesBy100" class="flex flex-col gap-2.5">
          <h3 :class="sectionTitle">
            Macros aux 100 g
          </h3>
          <IngredientMacroSummary :macros="ingredient.valuesBy100" />
        </section>

        <!-- Unités / équivalents, et la densité qui convertit les ml en grammes -->
        <section v-if="unitRows.length || ingredient?.density != null" class="flex flex-col gap-2.5">
          <h3 :class="sectionTitle">
            Unités
          </h3>
          <p v-if="ingredient?.density != null" class="flex items-center justify-between gap-3 text-sm">
            <span class="flex items-center gap-1 text-default">
              Densité
              <IngredientDensityInfo />
            </span>
            <span class="tabular-nums text-highlighted">
              {{ ingredient.density }} <span class="text-muted">g/ml</span>
            </span>
          </p>
          <ul v-if="unitRows.length" class="flex flex-col gap-3">
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
        </section>

        <!-- Disponibilité par mois -->
        <section class="flex flex-col gap-2.5">
          <h3 :class="sectionTitle">
            Disponibilité
          </h3>
          <p v-if="isAllYear" class="text-sm text-default">
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
        </section>

        <!-- Magasins du foyer -->
        <section v-if="ingredient?.id">
          <IngredientStoresField :ingredient-id="ingredient.id" :title-class="sectionTitle" />
        </section>

        <!-- Commentaire -->
        <section v-if="ingredient?.comment" class="flex flex-col gap-1.5">
          <h3 :class="sectionTitle">
            Commentaire
          </h3>
          <p class="text-sm text-default">
            {{ ingredient.comment }}
          </p>
        </section>

        <!-- Modifié le : pied de fiche, en méta. -->
        <section v-if="ingredient">
          <p class="text-xs text-dimmed">
            Modifié le {{ formatDate(ingredient.updatedAt) }}
          </p>
        </section>
      </div>
    </template>
  </USlideover>
</template>
