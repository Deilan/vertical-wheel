import { describe, expect, it } from 'vitest'
import {
  calculateSpinOutcome,
  defaultSpinPhysicsConfig,
  isValidSpinGesture,
  projectInertialTravelPx,
  snapPositionToCard,
} from './spinPhysics'

describe('spin physics', () => {
  it('detects weak gestures when either distance or velocity is below threshold', () => {
    expect(isValidSpinGesture(39, 800)).toBe(false)
    expect(isValidSpinGesture(80, 349)).toBe(false)
    expect(isValidSpinGesture(80, -350)).toBe(true)
  })

  it('accepts exact threshold values as a valid spin gesture', () => {
    expect(
      isValidSpinGesture(
        defaultSpinPhysicsConfig.minDragDistancePx,
        defaultSpinPhysicsConfig.minReleaseVelocityPxPerSec,
      ),
    ).toBe(true)

    const result = calculateSpinOutcome({
      currentPositionPx: 0,
      dragDistancePx: defaultSpinPhysicsConfig.minDragDistancePx,
      releaseVelocityPxPerSec: defaultSpinPhysicsConfig.minReleaseVelocityPxPerSec,
      cardStepPx: 100,
      jitterCards: 0,
    })

    expect(result.kind).toBe('spin')
  })

  it('snaps weak gestures to the nearest card center without a spin result', () => {
    const result = calculateSpinOutcome({
      currentPositionPx: 178,
      dragDistancePx: 20,
      releaseVelocityPxPerSec: 900,
      cardStepPx: 100,
    })

    expect(result.kind).toBe('snap')
    expect(result.finalPositionPx).toBe(200)
  })

  it('keeps final spin position aligned to an exact card center', () => {
    const result = calculateSpinOutcome({
      currentPositionPx: 15,
      dragDistancePx: 120,
      releaseVelocityPxPerSec: 1000,
      cardStepPx: 124,
      jitterCards: 0.41,
    })

    expect(result.kind).toBe('spin')
    expect(result.finalPositionPx % 124).toBe(0)
  })

  it('projects clearly increasing travel from weak valid, medium, and strong releases', () => {
    const weakValid = projectInertialTravelPx(360, 100)
    const medium = projectInertialTravelPx(1200, 100)
    const strong = projectInertialTravelPx(2600, 100)

    expect(medium.virtualCardsToTravel).toBeGreaterThan(weakValid.virtualCardsToTravel * 5)
    expect(strong.virtualCardsToTravel).toBeGreaterThan(medium.virtualCardsToTravel * 3)
    expect(weakValid.safetyClampApplied).toBe(false)
    expect(medium.safetyClampApplied).toBe(false)
  })

  it('gives stronger releases a longer coast and duration', () => {
    const weakValid = projectInertialTravelPx(360, 100)
    const strong = projectInertialTravelPx(2600, 100)

    expect(strong.coastDurationMs).toBeGreaterThan(weakValid.coastDurationMs)
    expect(strong.durationMs).toBeGreaterThan(weakValid.durationMs)
    expect(strong.clampedReleaseVelocityPxPerSec).toBe(2600)
  })

  it('does not clamp ordinary strong releases below the higher safety ceiling', () => {
    const projected = projectInertialTravelPx(3500, 100)

    expect(projected.clampedReleaseVelocityPxPerSec).toBe(3500)
    expect(projected.coastDurationMs).toBeGreaterThan(defaultSpinPhysicsConfig.minCoastMs)
    expect(defaultSpinPhysicsConfig.maxReleaseVelocityPxPerSec).toBe(4200)
  })

  it('uses swipe direction for final travel direction', () => {
    const up = calculateSpinOutcome({
      currentPositionPx: 0,
      dragDistancePx: 120,
      releaseVelocityPxPerSec: 900,
      cardStepPx: 100,
    })
    const down = calculateSpinOutcome({
      currentPositionPx: 0,
      dragDistancePx: 120,
      releaseVelocityPxPerSec: -900,
      cardStepPx: 100,
    })

    expect(up.finalPositionPx).toBeGreaterThan(0)
    expect(down.finalPositionPx).toBeLessThan(0)
  })

  it('clamps excessive travel and duration from extreme velocities', () => {
    const result = calculateSpinOutcome({
      currentPositionPx: 0,
      dragDistancePx: 4000,
      releaseVelocityPxPerSec: 10000,
      cardStepPx: 100,
      jitterCards: defaultSpinPhysicsConfig.randomJitterCards,
    })

    expect(result.kind).toBe('spin')
    if (result.kind !== 'spin') {
      return
    }

    expect(result.virtualCardsToTravel).toBeLessThanOrEqual(
      defaultSpinPhysicsConfig.maxVirtualCardsToTravel,
    )
    expect(result.durationMs).toBeLessThanOrEqual(defaultSpinPhysicsConfig.maxSpinDurationMs)
    expect(result.clampedReleaseVelocityPxPerSec).toBe(
      defaultSpinPhysicsConfig.maxReleaseVelocityPxPerSec,
    )
    expect(result.safetyClampApplied).toBe(true)
  })

  it('snaps positions by card step', () => {
    expect(snapPositionToCard(149, 100)).toBe(100)
    expect(snapPositionToCard(151, 100)).toBe(200)
    expect(snapPositionToCard(-151, 100)).toBe(-200)
  })

  it('rejects nonpositive card steps', () => {
    expect(() => snapPositionToCard(100, 0)).toThrow('Шаг карточки должен быть положительным.')
    expect(() =>
      calculateSpinOutcome({
        currentPositionPx: 0,
        dragDistancePx: 120,
        releaseVelocityPxPerSec: 900,
        cardStepPx: -1,
      }),
    ).toThrow('Шаг карточки должен быть положительным.')
  })
})
