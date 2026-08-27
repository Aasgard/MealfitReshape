/**
 * Sur mobile, le geste "retour" du navigateur ne connaît pas les slideovers/modals :
 * il navigue vers la page précédente au lieu de fermer l'overlay ouvert par-dessus.
 * On pousse une entrée d'historique factice à l'ouverture, consommée à la fermeture
 * (qu'elle vienne du bouton retour ou de l'UI), pour que "retour" ferme l'overlay
 * d'abord et ne quitte la page qu'au retour suivant.
 */
export function useOverlayBackClose(open: Ref<boolean>) {
  if (import.meta.server) return

  let ownsHistoryEntry = false

  const onPopState = () => {
    if (ownsHistoryEntry) {
      ownsHistoryEntry = false
      open.value = false
    }
  }
  window.addEventListener('popstate', onPopState)
  onUnmounted(() => window.removeEventListener('popstate', onPopState))

  watch(open, (isOpen) => {
    if (isOpen) {
      history.pushState({ overlay: true }, '')
      ownsHistoryEntry = true
    } else if (ownsHistoryEntry) {
      ownsHistoryEntry = false
      history.back()
    }
  })
}
