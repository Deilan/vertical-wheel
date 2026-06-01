import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url } from './base64url'

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes without URL-unsafe characters', () => {
    const bytes = new Uint8Array([0, 1, 2, 62, 63, 64, 127, 128, 255])
    const encoded = bytesToBase64Url(bytes)

    expect(encoded).not.toMatch(/[+/=]/u)
    expect(base64UrlToBytes(encoded)).toEqual(bytes)
  })

  it('decodes unpadded base64url values', () => {
    expect(Array.from(base64UrlToBytes('SGVsbG8'))).toEqual(
      Array.from(new TextEncoder().encode('Hello')),
    )
  })
})
