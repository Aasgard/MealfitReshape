<script setup lang="ts">
import type { CameraErrorKind, ScannerErrorKind } from '~/composables/useBarcodeScanner'

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  detected: [code: string]
  error: [kind: ScannerErrorKind]
}>()

useOverlayBackClose(open)

type Phase = 'starting' | 'scanning' | 'detected'

const phase = ref<Phase>('starting')
const detectedCode = ref('')
const torchAvailable = ref(false)
const torchOn = ref(false)

const videoEl = ref<HTMLVideoElement | null>(null)
const frameEl = ref<HTMLElement | null>(null)

let stream: MediaStream | null = null
/** Incrémenté à chaque ouverture/fermeture : une ouverture de caméra qui aboutit après coup est ignorée. */
let session = 0
let loopTimer: ReturnType<typeof setTimeout> | undefined
let detectedTimer: ReturnType<typeof setTimeout> | undefined
/** Caméra coupée parce que l'app est passée en arrière-plan : on la relance au retour. */
let suspended = false

const canvas = import.meta.client ? document.createElement('canvas') : null
const context = canvas?.getContext('2d', { willReadFrequently: true })

/**
 * Copie la zone visée (le cadre, un peu élargie) dans un canvas : on n'analyse que ce que l'utilisateur vise,
 * ce qui évite de lire un autre code présent dans le champ et accélère le décodage wasm.
 */
function captureFrameRegion(): HTMLCanvasElement | null {
  const video = videoEl.value
  const frame = frameEl.value
  if (!video || !frame || !canvas || !context || video.readyState < 2 || !video.videoWidth) return null

  const videoRect = video.getBoundingClientRect()
  const frameRect = frame.getBoundingClientRect()
  // La vidéo est en `object-cover` : on retrouve l'échelle et le recadrage appliqués par le navigateur.
  const scale = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight)
  const offsetX = (videoRect.width - video.videoWidth * scale) / 2
  const offsetY = (videoRect.height - video.videoHeight * scale) / 2

  // Marge autour du cadre : un code un peu trop grand ou décalé reste lisible.
  const marginX = frameRect.width * 0.15
  const marginY = frameRect.height * 0.5
  const left = Math.max(0, (frameRect.left - videoRect.left - marginX - offsetX) / scale)
  const top = Math.max(0, (frameRect.top - videoRect.top - marginY - offsetY) / scale)
  const right = Math.min(video.videoWidth, (frameRect.right - videoRect.left + marginX - offsetX) / scale)
  const bottom = Math.min(video.videoHeight, (frameRect.bottom - videoRect.top + marginY - offsetY) / scale)
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) return null

  const downscale = Math.min(1, 1280 / width)
  canvas.width = Math.round(width * downscale)
  canvas.height = Math.round(height * downscale)
  context.drawImage(video, left, top, width, height, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function scanLoop(token: number) {
  if (token !== session || phase.value !== 'scanning') return
  const region = captureFrameRegion()
  if (region) {
    try {
      const code = await detectBarcode(region)
      if (code && token === session && phase.value === 'scanning') {
        onDetected(code)
        return
      }
    } catch {
      // Image illisible ponctuellement : on passe à la suivante.
    }
  }
  if (token === session) loopTimer = setTimeout(() => scanLoop(token), 120)
}

function onDetected(code: string) {
  phase.value = 'detected'
  detectedCode.value = code
  navigator.vibrate?.(60)
  videoEl.value?.pause()
  // Laisse le temps de lire le code lu dans le viseur avant de rendre la main à la page.
  detectedTimer = setTimeout(() => {
    emit('detected', code)
    open.value = false
  }, 650)
}

function fail(kind: ScannerErrorKind) {
  stop()
  emit('error', kind)
  open.value = false
}

async function start() {
  const token = ++session
  phase.value = 'starting'
  detectedCode.value = ''
  torchAvailable.value = false
  torchOn.value = false

  // Le module de lecture se charge pendant que l'utilisateur répond à la demande d'accès caméra.
  const detectorReady = getBarcodeDetector()
  detectorReady.catch(() => {})

  let mediaStream: MediaStream
  try {
    mediaStream = await openRearCamera()
  } catch (kind) {
    if (token === session) fail(kind as CameraErrorKind)
    return
  }
  if (token !== session) {
    stopStream(mediaStream)
    return
  }
  stream = mediaStream
  torchAvailable.value = supportsTorch(mediaStream)

  const video = videoEl.value
  if (video) {
    video.srcObject = mediaStream
    await video.play().catch(() => {})
  }

  try {
    await detectorReady
  } catch {
    if (token === session) fail('decoder')
    return
  }
  if (token !== session) return

  phase.value = 'scanning'
  scanLoop(token)
}

function stop() {
  session++
  clearTimeout(loopTimer)
  clearTimeout(detectedTimer)
  stopStream(stream)
  stream = null
  if (videoEl.value) videoEl.value.srcObject = null
  torchOn.value = false
}

async function toggleTorch() {
  if (!stream) return
  const next = !torchOn.value
  try {
    await setTorch(stream, next)
    torchOn.value = next
  } catch {
    torchAvailable.value = false
  }
}

function onVisibilityChange() {
  if (!open.value) return
  if (document.hidden) {
    if (phase.value === 'detected') return
    suspended = true
    stop()
  } else if (suspended) {
    suspended = false
    start()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    suspended = false
    nextTick(start)
  } else {
    stop()
  }
}, { immediate: true })

onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stop()
})
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    title="Scanner un code-barres"
    description="Placez le code-barres dans le cadre."
    :ui="{ content: 'bg-black' }"
  >
    <template #content="{ close }">
      <div class="scanner relative flex size-full items-center justify-center overflow-hidden bg-black text-white select-none">
        <video
          ref="videoEl"
          class="absolute inset-0 size-full object-cover"
          playsinline
          muted
          autoplay
          aria-hidden="true"
        />

        <div
          ref="frameEl"
          class="scanner__frame"
          :class="{ 'scanner__frame--detected': phase === 'detected' }"
        >
          <span class="scanner__corner scanner__corner--tl" />
          <span class="scanner__corner scanner__corner--tr" />
          <span class="scanner__corner scanner__corner--bl" />
          <span class="scanner__corner scanner__corner--br" />

          <span v-if="phase === 'scanning'" class="scanner__laser" />

          <p
            v-if="phase === 'starting'"
            class="absolute inset-0 flex items-center justify-center gap-2 px-4 text-center text-sm text-white/80"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin" />
            Ouverture de la caméra…
          </p>

          <div class="scanner__caption" aria-live="polite">
            <p
              v-if="phase === 'detected'"
              class="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1 text-sm font-semibold tabular-nums tracking-wide text-black"
            >
              <UIcon name="i-lucide-check" class="size-4 shrink-0" />
              {{ detectedCode }}
            </p>
            <p v-else class="text-sm text-white/85">
              {{ phase === 'starting' ? 'Autorisez l’accès à la caméra si le navigateur le demande.' : 'Placez le code-barres dans le cadre' }}
            </p>
          </div>
        </div>

        <div class="scanner__bar absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-3">
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="lg"
            aria-label="Fermer le scanner"
            class="text-white hover:bg-white/15 active:bg-white/20 focus-visible:ring-white"
            @click="close"
          />
          <p class="text-sm font-medium text-white/90" aria-hidden="true">
            Scanner un code-barres
          </p>
          <UButton
            v-if="torchAvailable"
            :icon="torchOn ? 'i-lucide-flashlight-off' : 'i-lucide-flashlight'"
            color="neutral"
            variant="ghost"
            size="lg"
            :aria-label="torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'"
            :aria-pressed="torchOn"
            class="text-white hover:bg-white/15 active:bg-white/20 focus-visible:ring-white"
            @click="toggleTorch"
          />
          <span v-else class="size-10" aria-hidden="true" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.scanner {
  /* Rouge laser : exception assumée au code couleur de l'app, cantonnée au viseur (objet physique imité). */
  --scanner-laser: oklch(63% 0.25 29);
  --scanner-veil: rgb(0 0 0 / 0.62);
}

.scanner__bar {
  padding-top: max(0.75rem, env(safe-area-inset-top));
}

/* Le voile est le contour du cadre : un seul élément, sans jointure entre bandes, qui suit l'arrondi. */
.scanner__frame {
  position: relative;
  width: min(80vw, 26rem);
  aspect-ratio: 2.2;
  margin-top: -8vh;
  border: 1px solid rgb(255 255 255 / 0.35);
  border-radius: 3px;
  outline: 200vmax solid var(--scanner-veil);
  transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.scanner__frame--detected {
  border-color: #fff;
}

.scanner__corner {
  position: absolute;
  width: 1.25rem;
  height: 1.25rem;
  border-color: #fff;
  border-style: solid;
  border-width: 0;
}
.scanner__corner--tl { top: -2px; left: -2px; border-top-width: 3px; border-left-width: 3px; border-top-left-radius: 4px; }
.scanner__corner--tr { top: -2px; right: -2px; border-top-width: 3px; border-right-width: 3px; border-top-right-radius: 4px; }
.scanner__corner--bl { bottom: -2px; left: -2px; border-bottom-width: 3px; border-left-width: 3px; border-bottom-left-radius: 4px; }
.scanner__corner--br { bottom: -2px; right: -2px; border-bottom-width: 3px; border-right-width: 3px; border-bottom-right-radius: 4px; }

.scanner__laser {
  position: absolute;
  inset-inline: 5%;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  border-radius: 9999px;
  background: linear-gradient(90deg, transparent, var(--scanner-laser) 12%, var(--scanner-laser) 88%, transparent);
  animation: scanner-sweep 1.7s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
}

@keyframes scanner-sweep {
  from { top: 12%; }
  to { top: 88%; }
}

.scanner__caption {
  position: absolute;
  inset-inline: -2rem;
  top: calc(100% + 1.5rem);
  display: flex;
  justify-content: center;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  /* Barre fixe au centre du cadre plutôt qu'un balayage. */
  .scanner__laser {
    animation: none;
  }
}
</style>
