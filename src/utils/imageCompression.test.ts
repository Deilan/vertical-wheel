import { describe, expect, it } from 'vitest'
import { getScaledImageSize, isSupportedImageFile } from './imageCompression'

describe('image compression helpers', () => {
  it('accepts supported image file types', () => {
    expect(isSupportedImageFile(new File([], 'image.png', { type: 'image/png' }))).toBe(true)
    expect(isSupportedImageFile(new File([], 'image.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isSupportedImageFile(new File([], 'image.webp', { type: 'image/webp' }))).toBe(true)
  })

  it('rejects unsupported image file types', () => {
    expect(isSupportedImageFile(new File([], 'image.gif', { type: 'image/gif' }))).toBe(false)
  })

  it('scales image dimensions to fit within the maximum size', () => {
    expect(getScaledImageSize(1200, 600, 512)).toEqual({ width: 512, height: 256 })
    expect(getScaledImageSize(320, 240, 512)).toEqual({ width: 320, height: 240 })
  })
})
