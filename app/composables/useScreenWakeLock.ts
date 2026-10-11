import type { MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'

type WakeLockSentinel = { release: () => Promise<void> }
type WakeLockNavigator = Navigator & { wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinel> } }

/** Garde l'écran allumé tant que `active` est vrai (téléphone posé sur le banc ou le plan de travail). */
export function useScreenWakeLock(active: MaybeRefOrGetter<boolean>) {
  let wakeLock: WakeLockSentinel | null = null

  async function sync() {
    const wanted = toValue(active)
    try {
      if (wanted && !wakeLock && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        wakeLock = await (navigator as WakeLockNavigator).wakeLock.request('screen')
      }
      else if (!wanted && wakeLock) {
        await wakeLock.release()
        wakeLock = null
      }
    }
    catch {
      // Refusé (économie d'énergie, navigateur) : l'écran s'éteindra comme d'habitude.
    }
  }

  watch(() => toValue(active), sync)
  onMounted(sync)
  // Le navigateur rend le verrou quand la page passe en arrière-plan : on le redemande au retour.
  useEventListener(document, 'visibilitychange', () => {
    wakeLock = null
    void sync()
  })
  onBeforeUnmount(() => { void wakeLock?.release().catch(() => undefined) })
}
