/**
 * Minuteurs de cuisine : plusieurs en parallèle, lancés depuis la fiche d'une recette ou la page Minuteurs, affichés
 * partout par la pastille du dashboard. L'état est partagé par toute l'appli et gardé dans le navigateur ; le temps
 * est calculé sur l'heure de fin, si bien qu'une page passée en arrière-plan ou rechargée reste juste.
 * Rien n'est enregistré dans Firestore.
 */
export interface KitchenTimer {
  id: string
  label: string
  /** Durée totale (ms), pour la barre de progression ; « +1 min » l'allonge. */
  durationMs: number
  /** Fin prévue (horloge) quand il tourne ; `null` en pause. */
  endAt: number | null
  /** Temps restant figé pendant une pause. */
  pausedMs: number | null
  /** Recette d'où il a été lancé, pour « Revenir à la recette ». */
  recipe?: { id: string, title: string, parts?: number | null }
  /** Fin déjà notifiée (notification système). */
  notified?: boolean
}

const STORAGE_KEY = 'mealfit:kitchen-timers'
const SERVICE_WORKER_URL = '/timers-sw.js'
/** Intervalle entre deux sonneries d'un minuteur terminé, jusqu'à « Arrêter ». */
const RING_EVERY_MS = 2500

function load(): KitchenTimer[] {
  if (!import.meta.client) return []
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter(t => t && typeof t.id === 'string' && typeof t.durationMs === 'number') : []
  }
  catch {
    // Stockage indisponible ou illisible : on repart sans minuteur.
    return []
  }
}

const timers = ref<KitchenTimer[]>(load())
const now = ref(Date.now())
/** Recette dont la fiche est ouverte : son lien « Revenir à la recette » est inutile. */
const openRecipeId = ref<string | null>(null)

let ticker: ReturnType<typeof setInterval> | undefined
let lastRingAt = 0

const remainingMs = (t: KitchenTimer) => (t.endAt === null ? t.pausedMs ?? 0 : Math.max(0, t.endAt - now.value))
const isRinging = (t: KitchenTimer) => t.endAt !== null && now.value >= t.endAt
const progress = (t: KitchenTimer) => (t.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs(t) / t.durationMs)) : 1)

/** Terminés d'abord, puis ceux qui tournent (le plus proche de la fin en tête), puis ceux en pause. */
const orderedTimers = computed(() => {
  const rank = (t: KitchenTimer) => (isRinging(t) ? 0 : t.endAt === null ? 2 : 1)
  return [...timers.value].sort((a, b) => rank(a) - rank(b) || remainingMs(a) - remainingMs(b))
})

if (import.meta.client) {
  watch(timers, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    }
    catch {
      // Non mémorisé : les minuteurs tournent quand même jusqu'au rechargement.
    }
  }, { deep: true })

  if (timers.value.length) {
    ensureTicker()
    // Après un rechargement, le navigateur n'autorise le son qu'au premier geste.
    document.addEventListener('pointerdown', unlockTimerSound, { once: true, capture: true })
  }
  if ('Notification' in window && Notification.permission === 'granted') registerServiceWorker()
}

function ensureTicker() {
  if (!ticker && timers.value.length) ticker = setInterval(tick, 250)
}

function tick() {
  now.value = Date.now()
  if (!timers.value.length) {
    clearInterval(ticker)
    ticker = undefined
    return
  }
  const ringing = timers.value.filter(isRinging)
  for (const t of ringing) {
    if (!t.notified) {
      t.notified = true
      notify(t)
    }
  }
  if (ringing.length && now.value - lastRingAt >= RING_EVERY_MS) {
    lastRingAt = now.value
    timerBeep(1320, 180)
    setTimeout(() => timerBeep(1760, 180), 220)
    setTimeout(() => timerBeep(1320, 180), 440)
    timerVibrate([300, 150, 300])
  }
}

// --- Notifications (app en arrière-plan) ---

function registerServiceWorker() {
  navigator.serviceWorker?.register(SERVICE_WORKER_URL).catch(() => undefined)
}

/** Demandée au premier minuteur ; un refus laisse le son et la vibration dans l'appli. */
function requestNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'default') return
  Notification.requestPermission()
    .then((permission) => { if (permission === 'granted') registerServiceWorker() })
    .catch(() => undefined)
}

async function notify(t: KitchenTimer) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
  const title = `${t.label} : terminé`
  const options: NotificationOptions & { renotify?: boolean, vibrate?: number[] } = {
    body: t.recipe ? t.recipe.title : 'Minuteur de cuisine',
    tag: t.id,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300, 150, 300],
    icon: '/icon-192.png',
  }
  try {
    // Android n'affiche les notifications que par un service worker.
    const registration = await navigator.serviceWorker?.getRegistration(SERVICE_WORKER_URL)
    if (registration) await registration.showNotification(title, options)
    else new Notification(title, options)
  }
  catch {
    // Notification refusée par le système : la sonnerie reprendra au retour dans l'appli.
  }
}

// --- Actions ---

/** « Minuteur N » avec le plus petit N libre. */
function nextDefaultLabel() {
  const used = new Set(timers.value.map(t => /^Minuteur (\d+)$/.exec(t.label)?.[1]).filter(Boolean).map(Number))
  let n = 1
  while (used.has(n)) n++
  return `Minuteur ${n}`
}

function start(options: { durationMs: number, label?: string, recipe?: KitchenTimer['recipe'] }) {
  if (options.durationMs <= 0) return
  // Appelé dans le clic : c'est le moment d'autoriser le son et de demander les notifications.
  unlockTimerSound()
  requestNotifications()
  now.value = Date.now()
  timers.value.push({
    id: crypto.randomUUID(),
    label: options.label?.trim() || nextDefaultLabel(),
    durationMs: options.durationMs,
    endAt: now.value + options.durationMs,
    pausedMs: null,
    recipe: options.recipe,
  })
  ensureTicker()
}

function find(id: string) {
  return timers.value.find(t => t.id === id)
}

function togglePause(id: string) {
  const t = find(id)
  if (!t || isRinging(t)) return
  if (t.endAt === null) {
    t.endAt = Date.now() + (t.pausedMs ?? 0)
    t.pausedMs = null
  }
  else {
    t.pausedMs = Math.max(0, t.endAt - Date.now())
    t.endAt = null
  }
}

/** Ajoute une minute ; sur un minuteur terminé, le relance pour une minute. */
function addMinute(id: string) {
  const t = find(id)
  if (!t) return
  unlockTimerSound()
  if (isRinging(t)) {
    t.durationMs = 60_000
    t.endAt = Date.now() + 60_000
    t.notified = false
  }
  else if (t.endAt === null) {
    t.pausedMs = (t.pausedMs ?? 0) + 60_000
    t.durationMs += 60_000
  }
  else {
    t.endAt += 60_000
    t.durationMs += 60_000
  }
}

/** Arrête (s'il sonne) et retire le minuteur. */
function remove(id: string) {
  timers.value = timers.value.filter(t => t.id !== id)
}

export function useKitchenTimers() {
  return {
    timers: orderedTimers,
    now,
    openRecipeId,
    /** Au moins un minuteur tourne ou sonne : l'écran doit rester allumé. */
    hasActive: computed(() => timers.value.some(t => t.endAt !== null)),
    remainingMs,
    isRinging,
    progress,
    nextDefaultLabel,
    start,
    togglePause,
    addMinute,
    remove,
  }
}
