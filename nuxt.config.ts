export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  routeRules: {
    '/': { ssr: true, appLayout: false },
    '/login': { ssr: true, appLayout: false },
    '/dashboard': { ssr: false, appLayout: 'dashboard' },
  }
});
