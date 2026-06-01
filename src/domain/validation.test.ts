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

  it('adds safe exclusion defaults when optional behavior settings are missing', () => {
    const config = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          theme: demoWheelConfig.wheel.settings.theme,
          appBackgroundColor: demoWheelConfig.wheel.settings.appBackgroundColor,
          pointerColor: demoWheelConfig.wheel.settings.pointerColor,
          cardHeightPx: demoWheelConfig.wheel.settings.cardHeightPx,
          cardGapPx: demoWheelConfig.wheel.settings.cardGapPx,
          imageSizePx: demoWheelConfig.wheel.settings.imageSizePx,
          titleFontSizePx: demoWheelConfig.wheel.settings.titleFontSizePx,
          subtitleFontSizePx: demoWheelConfig.wheel.settings.subtitleFontSizePx,
          cardBorderRadiusPx: demoWheelConfig.wheel.settings.cardBorderRadiusPx,
        },
      },
    }
    const result = validateWheelConfig(config)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.wheel.settings.afterResultBehavior).toBe('keep')
    expect(result.value.wheel.settings.excludedOptionDisplayMode).toBe('hide')
    expect(result.value.wheel.settings.askAllowedDecisions).toEqual([
      'keep',
      'exclude-hide',
      'exclude-show-disabled',
    ])
  })

  it('rejects invalid exclusion behavior settings and decisions', () => {
    const invalidBehavior = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          afterResultBehavior: 'remove',
        },
      },
    })
    const invalidDisplayMode = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          excludedOptionDisplayMode: 'ghost',
        },
      },
    })
    const invalidDecision = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          askAllowedDecisions: ['keep', 'delete'],
        },
      },
    })
    const tooFewDecisions = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          askAllowedDecisions: ['keep'],
        },
      },
    })

    expect(invalidBehavior.ok).toBe(false)
    expect(invalidDisplayMode.ok).toBe(false)
    expect(invalidDecision.ok).toBe(false)
    expect(tooFewDecisions.ok).toBe(false)
  })

  it('validates per-option exclusion behavior and ask decision overrides', () => {
    const valid = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          {
            ...demoWheelConfig.wheel.options[0],
            afterResultBehavior: 'ask',
            askAllowedDecisions: ['keep', 'exclude-show-disabled'],
          },
          demoWheelConfig.wheel.options[1],
        ],
      },
    })
    const invalidBehavior = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          {
            ...demoWheelConfig.wheel.options[0],
            afterResultBehavior: 'delete',
          },
          demoWheelConfig.wheel.options[1],
        ],
      },
    })
    const invalidDecisions = validateWheelConfig({
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          {
            ...demoWheelConfig.wheel.options[0],
            askAllowedDecisions: ['exclude-hide'],
          },
          demoWheelConfig.wheel.options[1],
        ],
      },
    })

    expect(valid.ok).toBe(true)
    expect(invalidBehavior.ok).toBe(false)
    expect(invalidDecisions.ok).toBe(false)
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
