export type ImageCompressionOptions = {
  maxSizePx: number
  quality: number
}

export type CompressedImage = {
  dataUrl: string
  mimeType: 'image/webp' | 'image/jpeg'
}

export async function compressImageFile(
  _file: File,
): Promise<CompressedImage> {
  void _file

  throw new Error('Сжатие изображений будет реализовано на следующем этапе.')
}
