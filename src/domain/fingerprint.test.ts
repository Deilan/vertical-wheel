import { describe, expect, it } from 'vitest'
import { demoWheelConfig } from './demoWheel'
import { getWheelFingerprint } from './fingerprint'

describe('wheel fingerprint', () => {
  it('changes when option title changes', () => {
    const changed = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          { ...demoWheelConfig.wheel.options[0], title: 'Новое название' },
          ...demoWheelConfig.wheel.options.slice(1),
        ],
      },
    }

    expect(getWheelFingerprint(changed)).not.toBe(getWheelFingerprint(demoWheelConfig))
  })

  it('changes when option subtitle, count, or order changes', () => {
    const subtitleChanged = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          { ...demoWheelConfig.wheel.options[0], subtitle: 'Новый подзаголовок' },
          ...demoWheelConfig.wheel.options.slice(1),
        ],
      },
    }
    const countChanged = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: demoWheelConfig.wheel.options.slice(0, -1),
      },
    }
    const orderChanged = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          demoWheelConfig.wheel.options[1],
          demoWheelConfig.wheel.options[0],
          ...demoWheelConfig.wheel.options.slice(2),
        ],
      },
    }

    const original = getWheelFingerprint(demoWheelConfig)

    expect(getWheelFingerprint(subtitleChanged)).not.toBe(original)
    expect(getWheelFingerprint(countChanged)).not.toBe(original)
    expect(getWheelFingerprint(orderChanged)).not.toBe(original)
  })

  it('does not change when only visual settings change', () => {
    const visualChanged = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          theme: 'light' as const,
          appBackgroundColor: '#ffffff',
          pointerColor: '#000000',
          cardHeightPx: demoWheelConfig.wheel.settings.cardHeightPx + 20,
        },
        options: demoWheelConfig.wheel.options.map((option) => ({
          ...option,
          backgroundColor: '#000000',
          textColor: '#ffffff',
          emoji: '✨',
          image: { kind: 'url' as const, value: 'https://example.com/picture.webp' },
        })),
      },
    }

    expect(getWheelFingerprint(visualChanged)).toBe(getWheelFingerprint(demoWheelConfig))
  })
})
