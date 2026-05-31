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
