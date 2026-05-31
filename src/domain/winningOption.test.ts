import { describe, expect, it } from 'vitest'
import { demoWheelConfig } from './demoWheel'
import { getWinningOption, getWinningOptionIndex } from './winningOption'

describe('winning option calculation', () => {
  it('rounds to the nearest card center', () => {
    expect(getWinningOptionIndex(0, 100, 5)).toBe(0)
    expect(getWinningOptionIndex(149, 100, 5)).toBe(1)
    expect(getWinningOptionIndex(151, 100, 5)).toBe(2)
  })

  it('wraps negative and positive offsets cyclically', () => {
    expect(getWinningOptionIndex(-100, 100, 5)).toBe(4)
    expect(getWinningOptionIndex(600, 100, 5)).toBe(1)
  })

  it('returns the winning option from the list', () => {
    const option = getWinningOption(demoWheelConfig.wheel.options, 200, 100)

    expect(option.id).toBe('walk')
  })
})
