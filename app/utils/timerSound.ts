/**
 * Bips et vibrations des minuteurs (circuit, cuisine). Un seul `AudioContext` pour toute l'appli : le navigateur ne
 * l'autorise qu'après un geste de l'utilisateur, d'où `unlockTimerSound` à appeler dans un clic.
 */
let audio: AudioContext | null = null

/** À appeler dans un geste de l'utilisateur (clic, toucher) : autorise le son pour les bips suivants. */
export function unlockTimerSound() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  }
  catch {
    audio = null
  }
}

/** Bip sinusoïdal ; muet tant que le son n'a pas été autorisé. */
export function timerBeep(frequency: number, durationMs: number) {
  if (!audio) return
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.25, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + durationMs / 1000)
  oscillator.connect(gain).connect(audio.destination)
  oscillator.start()
  oscillator.stop(audio.currentTime + durationMs / 1000)
}

export function timerVibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  }
  catch {
    // Vibration indisponible (ordinateur, iOS) : le bip suffit.
  }
}
