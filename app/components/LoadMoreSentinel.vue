<script setup lang="ts">
/**
 * Repère invisible placé en fin de liste : émet `load` un peu avant d'entrer dans la zone visible,
 * pour que la suite soit déjà montée quand l'utilisateur atteint le bas.
 * Le parent le remonte (`:key`) après chaque chargement pour réévaluer une liste encore trop courte pour défiler.
 */
const emit = defineEmits<{
  load: []
}>()

/** Avance de chargement : la marge ne s'applique qu'à la racine observée, d'où la recherche du conteneur qui défile. */
const PRELOAD_DISTANCE = '600px'

const el = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined

/** Plus proche ancêtre qui défile verticalement (tableau, corps du panneau) ; `null` = la fenêtre. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let parent = node.parentElement
  while (parent) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

onMounted(() => {
  if (!el.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) emit('load')
  }, { root: scrollParent(el.value), rootMargin: `0px 0px ${PRELOAD_DISTANCE} 0px` })
  observer.observe(el.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="el" aria-hidden="true" class="h-px w-full" />
</template>
