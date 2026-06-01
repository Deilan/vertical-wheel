import { describe, expect, it } from 'vitest'
import { demoWheelConfig } from './demoWheel'
import { parseWheelConfigJson, validateWheelConfig } from './validation'

describe('wheel config validation', () => {
  it('accepts a valid version 1 config', () => {
    const result = validateWheelConfig(demoWheelConfig)

    expect(result.ok).toBe(true)
  })

  it('rejects invalid JSON import text', () => {
    const result = parseWheelConfigJson('{not json')

    expect(result.ok).toBe(false)
  })

  it('rejects configs with too few options', () => {
    const result = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [demoWheelConfig.wheel.options[0]],
      },
    })

    expect(result.ok).toBe(false)
  })

  it('rejects configs with duplicate option ids', () => {
    const result = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          demoWheelConfig.wheel.options[0],
          {
            ...demoWheelConfig.wheel.options[1],
            id: demoWheelConfig.wheel.options[0].id,
          },
        ],
      },
    })

    expect(result.ok).toBe(false)
  })

  it('rejects configs with more than 30 options', () => {
    const result = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: Array.from({ length: 31 }, (_, index) => ({
          ...demoWheelConfig.wheel.options[index % demoWheelConfig.wheel.options.length],
          id: `option-${index}`,
        })),
      },
    })

    expect(result.ok).toBe(false)
  })

  it('rejects settings outside allowed ranges', () => {
    const result = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          cardHeightPx: 0,
        },
      },
    })

    expect(result.ok).toBe(false)
  })

  it('rejects invalid image kind and empty image values', () => {
    const invalidKind = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          {
            ...demoWheelConfig.wheel.options[0],
            image: { kind: 'gif', value: 'https://example.com/image.gif' },
          },
          demoWheelConfig.wheel.options[1],
        ],
      },
    })
    const emptyValue = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          {
            ...demoWheelConfig.wheel.options[0],
            image: { kind: 'url', value: '   ' },
          },
          demoWheelConfig.wheel.options[1],
        ],
      },
    })

    expect(invalidKind.ok).toBe(false)
    expect(emptyValue.ok).toBe(false)
  })

  it('rejects titles that exceed the limit by Unicode code points', () => {
    const result = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          {
            ...demoWheelConfig.wheel.options[0],
            title: '🍕'.repeat(61),
          },
          demoWheelConfig.wheel.options[1],
        ],
      },
    })

    expect(result.ok).toBe(false)
  })
})
