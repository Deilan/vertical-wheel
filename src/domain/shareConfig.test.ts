import { describe, expect, it } from 'vitest'
import { demoWheelConfig } from './demoWheel'
import {
  createShareHash,
  decodeShareConfig,
  encodeShareConfig,
  readShareConfigFromHash,
  stripLocalImagesFromShareConfig,
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

  it('preserves URL images and strips data images from shared configs', () => {
    const stripped = stripLocalImagesFromShareConfig(configWithUnicodeAndImages())

    expect(stripped.wheel.options[0].image).toBeUndefined()
    expect(stripped.wheel.options[1].image).toEqual({
      kind: 'url',
      value: 'https://example.com/image.webp',
    })
  })

  it('round-trips URL images but not data images through share links', () => {
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

    expect(decoded.value.wheel.options[0].image).toBeUndefined()
    expect(decoded.value.wheel.options[1].image).toEqual({
      kind: 'url',
      value: 'https://example.com/image.webp',
    })
  })

  it('keeps exclusion behavior rules in shared configs', () => {
    const config: WheelConfig = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          afterResultBehavior: 'ask',
          excludedOptionDisplayMode: 'show-disabled',
          askAllowedDecisions: ['keep', 'exclude-show-disabled'],
        },
        options: demoWheelConfig.wheel.options.map((option, index) =>
          index === 0
            ? {
                ...option,
                afterResultBehavior: 'exclude',
                askAllowedDecisions: ['keep', 'exclude-hide'],
              }
            : option,
        ),
      },
    }
    const stripped = stripLocalImagesFromShareConfig(config)

    expect(stripped.wheel.settings.afterResultBehavior).toBe('ask')
    expect(stripped.wheel.settings.excludedOptionDisplayMode).toBe('show-disabled')
    expect(stripped.wheel.settings.askAllowedDecisions).toEqual(['keep', 'exclude-show-disabled'])
    expect(stripped.wheel.options[0].afterResultBehavior).toBe('exclude')
    expect(stripped.wheel.options[0].askAllowedDecisions).toEqual(['keep', 'exclude-hide'])
    expect('excludedOptions' in stripped).toBe(false)
  })

  it('does not restore data images after decoding a shared config', () => {
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

    expect(decoded.value.wheel.options[0].image).toBeUndefined()
    expect(decoded.value.wheel.options[1].image).toEqual({
      kind: 'url',
      value: 'https://example.com/image.webp',
    })
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
