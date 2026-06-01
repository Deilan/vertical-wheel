import { describe, expect, it } from 'vitest'
import {
  getCyclicWheelRepeatCycles,
  getPointerAlignedRepeatedIndex,
  normalizeCyclicWheelPosition,
} from './cyclicWheel'

describe('cyclic wheel rendering helpers', () => {
  it('normalizes large positive and negative positions into one option cycle', () => {
    expect(normalizeCyclicWheelPosition(1250, 100, 5)).toBe(250)
    expect(normalizeCyclicWheelPosition(-100, 100, 5)).toBe(400)
    expect(normalizeCyclicWheelPosition(-750, 100, 5)).toBe(250)
  })

  it('keeps snapped equivalent positions aligned to the same option index', () => {
    const cardStepPx = 124
    const optionCount = 5
    const farPosition = 37 * cardStepPx
    const normalized = normalizeCyclicWheelPosition(farPosition, cardStepPx, optionCount)

    expect(Math.round(farPosition / cardStepPx) % optionCount).toBe(
      Math.round(normalized / cardStepPx) % optionCount,
    )
  })

  it('keeps enough repeated cycles around the center for clamped spin travel', () => {
    const optionCount = 2
    const maxTravel = 45
    const repeatCycles = getCyclicWheelRepeatCycles(optionCount, maxTravel)
    const centerCycle = Math.floor(repeatCycles / 2)
    const centerIndex = centerCycle * optionCount

    expect(repeatCycles % 2).toBe(1)
    expect(centerIndex - maxTravel).toBeGreaterThanOrEqual(0)
    expect(centerIndex + optionCount + maxTravel).toBeLessThan(repeatCycles * optionCount)
  })

  it('maps the pointer-aligned card to one repeated visual index', () => {
    expect(getPointerAlignedRepeatedIndex(0, 100, 5, 20)).toBe(20)
    expect(getPointerAlignedRepeatedIndex(240, 100, 5, 20)).toBe(22)
    expect(getPointerAlignedRepeatedIndex(-160, 100, 5, 20)).toBe(18)
  })
})
