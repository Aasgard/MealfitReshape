/**
 * Après un déploiement, un onglet resté ouvert réclame des fichiers `/_nuxt/*.js` qui n'existent plus sur Vercel.
 * Nuxt ne recharge l'app que si l'échec survient dans la navigation elle-même : un layout ou un composant chargé à la
 * volée affiche sinon la page d'erreur, en boucle. On recharge donc la page (visée, ou courante) dès qu'un fichier
 * manque ; `reloadNuxtApp` ignore un second rechargement de la même page dans les 10 s, pour ne pas boucler si le
 * fichier manque vraiment.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  let targetPath: string | undefined
  router.beforeEach((to) => {
    targetPath = to.fullPath
  })

  nuxtApp.hook('app:chunkError', () => {
    reloadNuxtApp({ path: targetPath ?? router.currentRoute.value.fullPath })
  })
})
