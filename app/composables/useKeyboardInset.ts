import type { MaybeRefOrGetter } from 'vue'

/**
 * Hauteur du clavier virtuel tant que `active` est vrai (panneau ouvert), pour remonter un panneau du bas au-dessus :
 * iOS pose le clavier sur la page sans la redimensionner. Sur Android, la page de la liste de courses se redimensionne
 * (`interactive-widget=resizes-content`) et l'écart reste à 0.
 * Les panneaux étant téléportés sous `body`, l'écart est aussi exposé en variable CSS `--keyboard-inset` sur la racine,
 * lue par leur classe `bottom-(--keyboard-inset,0px)`.
 */
export function useKeyboardInset(active: MaybeRefOrGetter<boolean>) {
  const inset = ref(0)

  function measure() {
    const viewport = window.visualViewport
    inset.value = viewport ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)) : 0
  }

  function stop() {
    window.visualViewport?.removeEventListener('resize', measure)
    window.visualViewport?.removeEventListener('scroll', measure)
  }

  watch(() => toValue(active), (isActive) => {
    const viewport = window.visualViewport
    if (!viewport) return
    if (isActive) {
      measure()
      viewport.addEventListener('resize', measure)
      viewport.addEventListener('scroll', measure)
    }
    else {
      stop()
      inset.value = 0
    }
  })

  watch(inset, (value) => {
    if (value) document.documentElement.style.setProperty('--keyboard-inset', `${value}px`)
    else document.documentElement.style.removeProperty('--keyboard-inset')
  })

  onBeforeUnmount(() => {
    stop()
    if (inset.value) document.documentElement.style.removeProperty('--keyboard-inset')
  })

  return inset
}

/** Classes du contenu d'un `UDrawer` du bas, pour qu'il reste au-dessus du clavier et tienne dans l'espace visible. */
export const KEYBOARD_AWARE_DRAWER_CONTENT = 'bottom-(--keyboard-inset,0px) max-h-[calc(100dvh-var(--keyboard-inset,0px)-1rem)]'
