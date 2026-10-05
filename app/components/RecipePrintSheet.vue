<script setup lang="ts">
import type { Recipe } from '~/types/recipe'
import type { IngredientMacros } from '~/utils/ingredientNutrition'
import { recipeTypeLabel } from '~/utils/recipeType'
import { recipeDifficultyLabel } from '~/utils/recipeDifficulty'

/**
 * Fiche recette au format papier, invisible à l'écran : seule chose imprimée pendant
 * `printRecipe()` (voir `html.printing-recipe` dans main.css). L'export PDF passe par
 * la boîte d'impression du navigateur ("Enregistrer en PDF").
 */
defineProps<{
  recipe: Recipe
  lines: { key: string; label: string; quantityLabel: string }[]
  macros: IngredientMacros | null
  partsLabel: string
  scaledNote?: string | null
}>()
</script>

<template>
  <Teleport to="body">
    <article id="recipe-print" class="recipe-print">
      <header class="recipe-print__header">
        <h1>{{ recipe.title }}</h1>
        <p class="recipe-print__meta">
          <span v-if="recipe.type">{{ recipeTypeLabel(recipe.type) }}</span>
          <span>Difficulté : {{ recipeDifficultyLabel(recipe.difficulty) }}</span>
          <span>{{ partsLabel }}</span>
          <span v-if="recipe.prepTime != null">{{ recipe.prepTime }} min prép.</span>
          <span v-if="recipe.cookTime != null">{{ recipe.cookTime }} min cuisson</span>
        </p>
      </header>

      <img
        v-if="recipe.imageUrl"
        :src="recipe.imageUrl"
        :alt="recipe.title"
        class="recipe-print__image"
      />

      <section v-if="macros" class="recipe-print__section">
        <h2>Valeurs nutritionnelles pour une part</h2>
        <table class="recipe-print__macros">
          <thead>
            <tr>
              <th>Énergie</th>
              <th>Glucides</th>
              <th>Protéines</th>
              <th>Lipides</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ Math.round(macros.calories) }} kcal</td>
              <td>{{ Math.round(macros.carbohydrates) }} g</td>
              <td>{{ Math.round(macros.protein) }} g</td>
              <td>{{ Math.round(macros.fat) }} g</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="recipe-print__section">
        <h2>Ingrédients</h2>
        <p v-if="scaledNote" class="recipe-print__note">{{ scaledNote }}</p>
        <ul v-if="lines.length" class="recipe-print__ingredients">
          <li v-for="line in lines" :key="line.key">
            <span>{{ line.label }}</span>
            <span class="recipe-print__qty">{{ line.quantityLabel }}</span>
          </li>
        </ul>
        <p v-else class="recipe-print__note">Aucun ingrédient</p>
      </section>

      <section v-if="recipe.description" class="recipe-print__section">
        <h2>Description</h2>
        <p class="recipe-print__text">{{ recipe.description }}</p>
      </section>

      <section v-if="recipe.instructions" class="recipe-print__section">
        <h2>Instructions</h2>
        <p class="recipe-print__text">{{ recipe.instructions }}</p>
      </section>

      <footer class="recipe-print__footer">
        <span v-if="recipe.tags?.length">{{ recipe.tags.join(' · ') }}</span>
        <span v-if="recipe.source">Source : {{ recipe.source }}</span>
        <span>Mealfit</span>
      </footer>
    </article>
  </Teleport>
</template>
