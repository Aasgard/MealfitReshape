/**
 * Sur mobile, le geste "retour" du navigateur ne connaît pas les slideovers/modals :
 * il navigue vers la page précédente au lieu de fermer l'overlay ouvert par-dessus.
 * On pousse une entrée d'historique factice à l'ouverture, consommée à la fermeture
 * (qu'elle vienne du bouton retour ou de l'UI), pour que "retour" ferme l'overlay
 * d'abord et ne quitte la page qu'au retour suivant.
 *
 * Les overlays ouverts forment une pile (ex. la fiche d'une recette ouverte par-dessus la modale d'ajout) :
 * un "retour" ne ferme que celui du dessus. Un seul écouteur `popstate` sert toute la pile.
 */
type OverlayEntry = { close: () => void }

const openOverlays: OverlayEntry[] = []
/** `history.back()` lancés par une fermeture depuis l'UI : leur `popstate` ne doit fermer aucun autre overlay. */
let pendingOwnBacks = 0
let listening = false

function onPopState() {
  if (pendingOwnBacks > 0) {
    pendingOwnBacks--
    return
  }
  openOverlays.pop()?.close()
}

export function useOverlayBackClose(open: Ref<boolean>) {
  if (import.meta.server) return

  if (!listening) {
    window.addEventListener('popstate', onPopState)
    listening = true
  }

  const entry: OverlayEntry = { close: () => { open.value = false } }

  /** Fermeture venue de l'UI (ou démontage) : retire l'overlay de la pile et consomme son entrée d'historique. */
  const release = () => {
    const index = openOverlays.indexOf(entry)
    if (index < 0) return
    openOverlays.splice(index, 1)
    pendingOwnBacks++
    history.back()
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      if (openOverlays.includes(entry)) return
      history.pushState({ overlay: true }, '')
      openOverlays.push(entry)
    } else {
      // Fermé par "retour" : l'entrée a déjà été retirée de la pile par onPopState, rien à consommer.
      release()
    }
  })

  onUnmounted(release)
}
