export type ImageCompressionOptions = {
  maxSizePx: number
  quality: number
}

export type CompressedImage = {
  dataUrl: string
  mimeType: 'image/webp' | 'image/jpeg'
}

const supportedInputTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function isSupportedImageFile(file: File): boolean {
  return supportedInputTypes.has(file.type)
}

export function getScaledImageSize(
  width: number,
  height: number,
  maxSizePx: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxSizePx <= 0) {
    throw new Error('Размеры изображения должны быть положительными.')
  }

  const scale = Math.min(1, maxSizePx / Math.max(width, height))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Не удалось прочитать файл изображения.'))
      }
    })
    reader.addEventListener('error', () => reject(new Error('Не удалось прочитать файл изображения.')))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('Не удалось загрузить изображение.')))
    image.src = dataUrl
  })
}

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  mimeType: CompressedImage['mimeType'],
  quality: number,
): string {
  return canvas.toDataURL(mimeType, quality)
}

export async function compressImageFile(
  file: File,
  options: ImageCompressionOptions = { maxSizePx: 512, quality: 0.82 },
): Promise<CompressedImage> {
  if (!isSupportedImageFile(file)) {
    throw new Error('Поддерживаются только PNG, JPG, JPEG и WebP.')
  }

  const sourceDataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(sourceDataUrl)
  const size = getScaledImageSize(image.naturalWidth, image.naturalHeight, options.maxSizePx)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Не удалось подготовить изображение.')
  }

  canvas.width = size.width
  canvas.height = size.height
  context.drawImage(image, 0, 0, size.width, size.height)

  const webpDataUrl = canvasToDataUrl(canvas, 'image/webp', options.quality)

  if (webpDataUrl.startsWith('data:image/webp')) {
    return {
      dataUrl: webpDataUrl,
      mimeType: 'image/webp',
    }
  }

  return {
    dataUrl: canvasToDataUrl(canvas, 'image/jpeg', options.quality),
    mimeType: 'image/jpeg',
  }
}
