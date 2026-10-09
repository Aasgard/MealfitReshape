<script setup lang="ts">
const props = defineProps<{
  /** `nutriscore_grade` d'Open Food Facts : `a` à `e`, `unknown`, `not-applicable`, ou absent. */
  grade?: string
}>()

/**
 * Couleurs officielles du logo Nutri-Score (Santé publique France) : seule exception assumée à la règle des trois
 * territoires de couleur, parce que c'est un label réglementaire que l'on reconnaît à ses couleurs.
 * `ink` : couleur de la lettre sur la case pleine, foncée sur le vert clair et le jaune pour rester lisible.
 */
const GRADES = [
  { letter: 'a', color: '#038141', ink: '#fff' },
  { letter: 'b', color: '#85bb2f', ink: '#1b2a07' },
  { letter: 'c', color: '#fecb02', ink: '#3a2e00' },
  { letter: 'd', color: '#ee8100', ink: '#fff' },
  { letter: 'e', color: '#e63e11', ink: '#fff' },
] as const

const current = computed(() => {
  const grade = props.grade?.toLowerCase()
  return GRADES.find(g => g.letter === grade)?.letter ?? null
})

const caption = computed(() => {
  if (current.value) return null
  if (props.grade === 'not-applicable') return 'Non applicable à cette catégorie de produit'
  return 'Non calculé : données nutritionnelles manquantes'
})

const label = computed(() => current.value
  ? `Nutri-Score ${current.value.toUpperCase()}`
  : `Nutri-Score : ${caption.value?.toLowerCase()}`)
</script>

<template>
  <section class="rounded-xl border border-default flex flex-col overflow-hidden" aria-labelledby="nutriscore-title">
    <div class="flex items-baseline justify-between gap-3 border-b border-default px-4 py-2.5">
      <h2 id="nutriscore-title" class="text-sm font-semibold text-highlighted">
        Nutri-Score
      </h2>
      <span class="text-xs text-dimmed">Calcul 2023 d’Open Food Facts</span>
    </div>

    <div class="flex flex-col gap-3 px-4 pt-5 pb-4 sm:flex-row sm:items-center sm:gap-6">
      <div class="nutriscore flex w-full max-w-72 shrink-0" role="img" :aria-label="label" :class="{ 'is-unknown': !current }">
        <span
          v-for="g in GRADES"
          :key="g.letter"
          class="nutriscore-cell"
          :class="{ 'is-current': g.letter === current }"
          :style="{ '--grade': g.color, '--grade-ink': g.ink }"
          aria-hidden="true"
        >
          {{ g.letter.toUpperCase() }}
        </span>
      </div>

      <p v-if="caption" class="text-sm text-muted">
        {{ caption }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.nutriscore-cell {
  flex: 1;
  display: grid;
  place-items: center;
  height: 2.25rem;
  font-size: 1rem;
  font-weight: 700;
  /* Cases non retenues : la couleur pâlie dans le fond de la page, comme sur le logo officiel. */
  background: color-mix(in oklab, var(--grade) 30%, var(--ui-bg));
  color: color-mix(in oklab, var(--grade) 55%, var(--ui-text-highlighted));
}

.nutriscore-cell:first-child {
  border-radius: var(--ui-radius) 0 0 var(--ui-radius);
}

.nutriscore-cell:last-child {
  border-radius: 0 var(--ui-radius) var(--ui-radius) 0;
}

/* La note du produit déborde de la bande, pleine couleur, détourée par le fond de la page. */
.nutriscore-cell.is-current {
  position: relative;
  z-index: 1;
  flex: 1.35;
  height: 3.25rem;
  margin-block: -0.5rem;
  border-radius: calc(var(--ui-radius) * 3);
  background: var(--grade);
  color: var(--grade-ink);
  font-size: 1.75rem;
  outline: 3px solid var(--ui-bg);
}

/* Note inconnue : la bande reste en place, en gris, sans case retenue. */
.is-unknown .nutriscore-cell {
  background: var(--ui-bg-accented);
  color: var(--ui-text-dimmed);
}
</style>
