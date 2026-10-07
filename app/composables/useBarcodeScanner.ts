/**
 * Lecture de codes-barres produit (EAN/UPC) depuis la caméra ou une photo.
 *
 * L'API native `BarcodeDetector` n'existe que sur Chrome Android/macOS : ailleurs (iPhone, Firefox, Chrome Windows),
 * on charge à la demande le polyfill `barcode-detector` (ZXing compilé en wasm). Le wasm est servi par l'app
 * plutôt que par le CDN jsDelivr utilisé par défaut, pour ne dépendre d'aucun tiers.
 */

/** Formats des codes-barres alimentaires : EAN-13 (Europe), EAN-8 (petits emballages), UPC (produits nord-américains). */
const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

type Detector = { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> }

let detectorPromise: Promise<Detector> | null = null

async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: any }).BarcodeDetector
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats()
      if (PRODUCT_FORMATS.every(format => supported.includes(format))) {
        return new Native({ formats: [...PRODUCT_FORMATS] })
      }
    } catch {
      // Implémentation native présente mais inutilisable : on bascule sur le polyfill.
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  // Charge le wasm tout de suite (pendant l'ouverture de la caméra) plutôt qu'à la première image analysée.
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  })
  return new BarcodeDetector({ formats: [...PRODUCT_FORMATS] })
}

/** Détecteur partagé, créé une seule fois par session. Un échec n'est pas mis en cache : on réessaie au prochain appel. */
export function getBarcodeDetector(): Promise<Detector> {
  detectorPromise ??= createDetector().catch((error) => {
    detectorPromise = null
    throw error
  })
  return detectorPromise
}

/** Premier code produit lisible dans l'image, ou `null`. */
export async function detectBarcode(source: ImageBitmapSource): Promise<string | null> {
  const detector = await getBarcodeDetector()
  const results = await detector.detect(source)
  return results.find(result => /^\d{8,14}$/.test(result.rawValue))?.rawValue ?? null
}

/** Lit le code-barres d'une photo importée. */
export async function detectBarcodeInFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    return await detectBarcode(bitmap)
  } finally {
    bitmap.close()
  }
}

export type CameraErrorKind = 'denied' | 'no-camera' | 'busy' | 'insecure' | 'unknown'
/** Erreurs remontées par le viseur : caméra, ou module de lecture qui n'a pas pu se charger. */
export type ScannerErrorKind = CameraErrorKind | 'decoder'

/** Ouvre la caméra arrière. Rejette avec un `CameraErrorKind` lisible par l'interface. */
export async function openRearCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    // Absent hors HTTPS (sauf localhost) et sur les navigateurs sans accès caméra.
    throw (window.isSecureContext ? 'no-camera' : 'insecure') satisfies CameraErrorKind
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
  } catch (error) {
    const name = (error as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') throw 'denied' satisfies CameraErrorKind
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw 'no-camera' satisfies CameraErrorKind
    if (name === 'NotReadableError' || name === 'AbortError') throw 'busy' satisfies CameraErrorKind
    throw 'unknown' satisfies CameraErrorKind
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach(track => track.stop())
}

/** Lampe torche : disponible sur la plupart des téléphones Android, pas sur iOS Safari. */
export function supportsTorch(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0]
  const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
  return Boolean(capabilities?.torch)
}

export async function setTorch(stream: MediaStream, on: boolean) {
  const track = stream.getVideoTracks()[0]
  await track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
}
