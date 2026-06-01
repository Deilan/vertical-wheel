import { describe, expect, it } from 'vitest'
import { demoWheelConfig } from './demoWheel'
import {
  createShareHash,
  decodeShareConfig,
  encodeShareConfig,
  readShareConfigFromHash,
  stripImagesFromConfig,
} from './shareConfig'
import type { WheelConfig } from './types'

function configWithUnicodeAndImages(): WheelConfig {
  return {
    ...demoWheelConfig,
    wheel: {
      ...demoWheelConfig.wheel,
      title: 'Выбор на вечер ✨',
      options: demoWheelConfig.wheel.options.map((option, index) => ({
        ...option,
        title: index === 0 ? 'Пицца с ананасом 🍍' : option.title,
        subtitle: index === 0 ? 'кириллица, emoji и спецсимволы: Привет & <3' : option.subtitle,
        image:
          index === 0
            ? { kind: 'data', value: 'data:image/webp;base64,aaaa' }
            : { kind: 'url', value: 'https://example.com/image.webp' },
      })),
    },
  }
}

function pseudoRandomText(length: number): string {
  let seed = 7
  let result = ''

  for (let index = 0; index < length; index += 1) {
    seed = (seed * 16807) % 2147483647
    result += String.fromCharCode(33 + (seed % 90))
  }

  return result
}

describe('share config serialization', () => {
  it('round-trips Unicode and emoji safely', () => {
    const config = configWithUnicodeAndImages()
    const encoded = encodeShareConfig(config)

    expect(encoded.ok).toBe(true)
    if (!encoded.ok) {
      return
    }

    const decoded = decodeShareConfig(encoded.value)

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) {
      return
    }

    expect(decoded.value.wheel.title).toBe('Выбор на вечер ✨')
    expect(decoded.value.wheel.options[0].title).toBe('Пицца с ананасом 🍍')
    expect(decoded.value.wheel.options[0].subtitle).toBe('кириллица, emoji и спецсимволы: Привет & <3')
  })

  it('strips data and URL images from shared configs', () => {
    const stripped = stripImagesFromConfig(configWithUnicodeAndImages())

    expect(stripped.wheel.options.every((option) => option.image === undefined)).toBe(true)
  })

  it('does not restore images after decoding a shared config', () => {
    const encoded = encodeShareConfig(configWithUnicodeAndImages())
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) {
      return
    }

    const decoded = decodeShareConfig(encoded.value)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) {
      return
    }

    expect(decoded.value.wheel.options.every((option) => option.image === undefined)).toBe(true)
  })

  it('rejects invalid wheel hash payloads', () => {
    const decoded = readShareConfigFromHash('#wheel=not-a-valid-payload')

    expect(decoded.ok).toBe(false)
  })

  it('ignores empty and unrelated hashes', () => {
    const emptyHash = readShareConfigFromHash('')
    const unrelatedHash = readShareConfigFromHash('#other=value')

    expect(emptyHash.ok).toBe(true)
    expect(unrelatedHash.ok).toBe(true)
    if (!emptyHash.ok || !unrelatedHash.ok) {
      return
    }

    expect(emptyHash.value).toBeUndefined()
    expect(unrelatedHash.value).toBeUndefined()
  })

  it('returns the required Russian error for oversized share configs', () => {
    const config: WheelConfig = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: demoWheelConfig.wheel.options.map((option, index) => ({
          ...option,
          backgroundColor: pseudoRandomText(1800 + index * 100),
        })),
      },
    }
    const result = createShareHash(config)

    expect(result).toEqual({
      ok: false,
      error: 'Ссылка слишком длинная. Уменьшите текст или используйте JSON export.',
    })
  })
})
