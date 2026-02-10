export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()
  // Forcer le mode clair au chargement (écrase le localStorage)
  colorMode.preference = 'light'
})
