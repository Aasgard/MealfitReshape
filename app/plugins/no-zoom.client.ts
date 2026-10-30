/**
 * Bloque le pincement sous Safari iOS, qui ignore `user-scalable=no` : ses événements `gesture*` sont annulés sur tout
 * le document. Le reste du blocage (balise viewport, `touch-action`) est dans `nuxt.config.ts`.
 */
export default defineNuxtPlugin(() => {
  const preventGesture = (event: Event) => event.preventDefault()
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, preventGesture, { passive: false })
  }
})
