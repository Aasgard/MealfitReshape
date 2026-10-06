/**
 * Réduit une photo (souvent 4000 px et plusieurs Mo depuis un téléphone) avant l'envoi vers Storage :
 * côté le plus long ramené à `maxSize` px, ré-encodée en JPEG. L'orientation EXIF est appliquée au décodage.
 * Rejette si le navigateur ne sait pas décoder le fichier.
 */
export async function resizeImage(file: File, maxSize = 1200, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas indisponible')
    context.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Encodage JPEG impossible')),
        'image/jpeg',
        quality,
      )
    })
  } finally {
    bitmap.close()
  }
}
