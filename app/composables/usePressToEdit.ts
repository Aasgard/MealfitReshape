import { onLongPress } from '@vueuse/core'
import type { MaybeElementRef } from '@vueuse/core'

/**
 * Relâcher le doigt après un appui long envoie un clic à ce qui se trouve dessous : le panneau qui vient de s'ouvrir
 * (son fond le refermerait). Ce clic-là est ignoré.
 */
function swallowNextClick() {
  const swallow = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 600)
}

/**
 * Geste pour modifier une valeur affichée (quantité, nombre de parts) : appui long au doigt, clic à la souris,
 * Entrée au clavier. `edit(byTouch)` ouvre l'édition : panneau du bas au toucher, popover sinon. Un appui court au
 * doigt ne fait rien. Brancher `onPointerDown` et `onClick` sur le déclencheur.
 */
export function usePressToEdit(target: MaybeElementRef, edit: (byTouch: boolean) => void) {
  let pointerType = ''

  onLongPress(target, (event) => {
    if (event.pointerType === 'mouse') return
    swallowNextClick()
    navigator.vibrate?.(10)
    edit(true)
  }, { delay: 450, distanceThreshold: 10 })

  function onPointerDown(event: PointerEvent) {
    pointerType = event.pointerType
  }

  function onClick(event: MouseEvent) {
    // `detail` à 0 : clic déclenché au clavier.
    if (event.detail === 0 || pointerType === 'mouse') edit(false)
  }

  return { onPointerDown, onClick }
}
