<script setup lang="ts">
/**
 * « Revenir à la recette » depuis un minuteur : rouvre la fiche de la recette d'où il a été lancé, quelle que soit la
 * page. Monté à la première demande (il charge le catalogue), puis gardé pour les suivantes.
 */
const props = defineProps<{
  /** Demande d'ouverture ; `at` change à chaque toucher, pour rouvrir la même recette. */
  request: { id: string, parts?: number | null, at: number }
}>()

const { recipesById, ingredientsById } = useFoodCatalog()

const recipe = computed(() => recipesById.value.get(props.request.id) ?? null)
const open = ref(false)

/** Ouverture demandée mais recette pas encore chargée : on ouvre dès qu'elle arrive. */
const pending = ref(false)
watch(() => props.request.at, () => { pending.value = true }, { immediate: true })
watch([pending, recipe], ([isPending, r]) => {
  if (isPending && r) {
    pending.value = false
    open.value = true
  }
}, { immediate: true })
</script>

<template>
  <RecipeDetailSlideover v-model:open="open" :recipe="recipe" :ingredients-by-id="ingredientsById" :parts="request.parts" />
</template>
