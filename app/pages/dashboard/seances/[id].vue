<script setup lang="ts">
/**
 * Page d'une séance (lien direct, séance en cours ouverte depuis l'accueil ou un programme) : l'éditeur en pleine
 * page. Depuis le journal, le même éditeur s'ouvre en panneau (`WorkoutEditorSlideover`).
 * `?modifier` rend modifiable une séance terminée.
 */
useSeoMeta({
  title: 'Dashboard - Séance - Mealfit',
  description: 'Dashboard - Séance - Mealfit',
})
useNoZoom()

const route = useRoute()
const router = useRouter()

const workoutId = computed(() => String(route.params.id))
const editing = computed(() => route.query.modifier !== undefined)

const backToJournal = () => router.push('/dashboard/seances')
const startEditing = () => router.replace({ query: { ...route.query, modifier: null } })
</script>

<template>
  <UDashboardPanel id="seance">
    <WorkoutEditor
      :key="workoutId"
      :workout-id="workoutId"
      :editing="editing"
      layout="page"
      @close="backToJournal"
      @edit="startEditing"
    />
  </UDashboardPanel>
</template>
