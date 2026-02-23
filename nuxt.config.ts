export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-vuefire', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  app: {
    head: {
      title: 'Mealfit',
      meta: [{ name: 'description', content: 'Mealfit' }],
      link: [{
        rel: 'icon',
        type: 'image/x-png',
        href: '/logo.png'
      }]
    },
    
  },
  routeRules: {
    '/': { ssr: true, appLayout: false },
    '/login': { ssr: true, appLayout: false },
    '/dashboard/**': { ssr: false, appLayout: 'dashboard' },
  },
  pinia: {
    storesDirs: ['app/stores/**'],
  },
  vuefire: {
    auth: {
      enabled: true
    },
    config: {
      apiKey: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_API_KEY ?? '',
      authDomain: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_AUTH_DOMAIN ?? '',
      projectId: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_PROJECT_ID ?? '',
      storageBucket: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_STORAGE_BUCKET ?? '',
      messagingSenderId: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_MESSAGING_SENDER_ID ?? '',
      appId: process.env.NUXT_PUBLIC_VUEFIRE_CONFIG_APP_ID ?? ''
    }
  }
});