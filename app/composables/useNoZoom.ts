/**
 * Bloque le zoom de la page (et de ses modales) : la balise viewport le bloque sur Android, `touch-action` sur iOS (qui
 * ignore `user-scalable`). Sert aux pages d'activité physique, utilisées au pouce entre deux séries : un double tap
 * ou un pincement accidentel ne doit pas agrandir l'écran.
 */
export function useNoZoom() {
  useHead({
    meta: [{ key: 'viewport', name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }],
    htmlAttrs: { class: 'touch-pan-x touch-pan-y' },
  })
}
