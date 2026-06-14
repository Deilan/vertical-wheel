import { describe, expect, it } from 'vitest'
import {
  calculateExcludedBypassMotion,
  calculateContinuationBudgetCards,
  calculateSpinOutcome,
  calculateTerminalContinuationDurationMs,
  calculateTerminalSettleDurationMs,
  defaultSpinPhysicsConfig,
  evaluateTerminalContinuationEnergy,
  getNoSpinReason,
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

  it('reports explicit no-spin reasons for threshold failures', () => {
    expect(getNoSpinReason({ dragDistancePx: 39, releaseVelocityPxPerSec: 800 })).toBe(
      'drag-distance-below-threshold',
    )
    expect(getNoSpinReason({ dragDistancePx: 80, releaseVelocityPxPerSec: 349 })).toBe(
      'release-velocity-below-threshold',
    )
    expect(getNoSpinReason({ dragDistancePx: 10, releaseVelocityPxPerSec: 100 })).toBe(
      'both-thresholds-below',
    )
    expect(getNoSpinReason({ dragDistancePx: 40, releaseVelocityPxPerSec: 350 })).toBe('none')
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

  it('uses bounded distance-based terminal settle durations', () => {
    expect(calculateTerminalSettleDurationMs(0)).toBe(0)
    expect(calculateTerminalSettleDurationMs(6)).toBeGreaterThanOrEqual(80)
    expect(calculateTerminalSettleDurationMs(6)).toBeLessThanOrEqual(120)
    expect(calculateTerminalSettleDurationMs(36)).toBeGreaterThan(120)
    expect(calculateTerminalSettleDurationMs(36)).toBeLessThanOrEqual(320)
    expect(calculateTerminalSettleDurationMs(80)).toBeGreaterThanOrEqual(320)
    expect(calculateTerminalSettleDurationMs(800)).toBe(460)
  })

  it('does not use a fixed 120ms jump for 30-50px terminal settles', () => {
    expect(calculateTerminalSettleDurationMs(32)).toBeGreaterThan(120)
    expect(calculateTerminalSettleDurationMs(48)).toBe(320)
  })

  it('uses longer bounded durations for same-direction terminal continuation', () => {
    expect(calculateTerminalContinuationDurationMs(25, 100)).toBeGreaterThanOrEqual(220)
    expect(calculateTerminalContinuationDurationMs(75, 100)).toBe(420)
    expect(calculateTerminalContinuationDurationMs(100, 100)).toBeGreaterThanOrEqual(320)
    expect(calculateTerminalContinuationDurationMs(100, 100)).toBeLessThanOrEqual(700)
    expect(calculateTerminalContinuationDurationMs(200, 100)).toBeGreaterThanOrEqual(700)
    expect(calculateTerminalContinuationDurationMs(200, 100)).toBeLessThanOrEqual(1200)
    expect(calculateTerminalContinuationDurationMs(400, 100)).toBeGreaterThanOrEqual(1200)
    expect(calculateTerminalContinuationDurationMs(400, 100)).toBeLessThanOrEqual(2200)
    expect(calculateTerminalContinuationDurationMs(700, 100)).toBe(2200)
  })

  it('does not treat multi-card terminal continuation as a short final snap', () => {
    expect(calculateTerminalContinuationDurationMs(180, 100)).toBeGreaterThan(
      calculateTerminalSettleDurationMs(180),
    )
  })

  it('calculates larger continuation budgets for stronger valid gestures', () => {
    expect(
      calculateContinuationBudgetCards({
        releaseVelocityPxPerSecAfterClamp: 500,
        projectedTravelCards: 3.5,
      }),
    ).toBe(1.5)
    expect(
      calculateContinuationBudgetCards({
        releaseVelocityPxPerSecAfterClamp: 900,
        projectedTravelCards: 4,
      }),
    ).toBe(3)
    expect(
      calculateContinuationBudgetCards({
        releaseVelocityPxPerSecAfterClamp: 1800,
        projectedTravelCards: 6,
      }),
    ).toBe(5)
  })

  it('keeps continuation budget diagnostic without suppressing valid spins', () => {
    const energy = evaluateTerminalContinuationEnergy({
      releaseVelocityPxPerSecAfterClamp: 700,
      projectedTravelCards: 3.8,
      terminalContinuationDistanceCards: 2,
    })

    expect(energy.continuationBudgetCards).toBe(1.5)
    expect(energy.continuationAllowed).toBe(true)
    expect(energy.continuationSuppressed).toBe(false)
    expect(energy.validGestureButNoResult).toBe(false)
  })

  it('models excluded bypass as reduced-friction motion without suppressing valid spins', () => {
    const motion = calculateExcludedBypassMotion({
      releaseVelocityPxPerSecAfterClamp: 700,
      baseDecelerationDurationMs: 900,
      rawDecelerationDistancePx: -300,
      excludedBypassDistancePx: -900,
      cardStepPx: 100,
    })

    expect(motion.physicsModelVersion).toBe('E3G-friction-field')
    expect(motion.excludedBypassMode).toBe('friction-field')
    expect(motion.excludedBypassStartedBeforeStop).toBe(true)
    expect(motion.excludedBypassDistanceCards).toBe(9)
    expect(motion.excludedBypassExtraDurationMs).toBeGreaterThan(0)
    expect(motion.renderedDecelerationDurationMs).toBeGreaterThan(900)
    expect(motion.velocityMonotonicNonIncreasing).toBe(true)
    expect(motion.accelerationSpikeDetected).toBe(false)
    expect(motion.apparentMotorPushDetected).toBe(false)
    expect(motion.maxObservedVelocityIncreasePxPerSec).toBe(0)
    expect(motion.velocityAtBypassStartPxPerSec).toBeGreaterThan(0)
    expect(motion.velocityAtBypassStartPxPerSec).toBeLessThanOrEqual(
      motion.velocityAtCoastEndPxPerSec,
    )
    expect(motion.velocityAtBypassEndPxPerSec).toBeLessThanOrEqual(
      motion.velocityAtBypassStartPxPerSec,
    )
  })

  it('allows nearby continuation for weak-feeling valid spins', () => {
    const energy = evaluateTerminalContinuationEnergy({
      releaseVelocityPxPerSecAfterClamp: 700,
      projectedTravelCards: 3.8,
      terminalContinuationDistanceCards: 1.25,
    })

    expect(energy.continuationAllowed).toBe(true)
    expect(energy.continuationSuppressed).toBe(false)
  })

  it('allows larger continuation for medium and strong spins without no-result suppression', () => {
    expect(
      evaluateTerminalContinuationEnergy({
        releaseVelocityPxPerSecAfterClamp: 1200,
        projectedTravelCards: 5,
        terminalContinuationDistanceCards: 2.5,
      }).continuationAllowed,
    ).toBe(true)
    expect(
      evaluateTerminalContinuationEnergy({
        releaseVelocityPxPerSecAfterClamp: 1200,
        projectedTravelCards: 5,
        terminalContinuationDistanceCards: 7,
      }).continuationSuppressed,
    ).toBe(false)
  })

  it('keeps long continuation speed bounded', () => {
    const distancePx = 500
    const durationMs = calculateTerminalContinuationDurationMs(distancePx, 100)
    const speedPxPerSec = distancePx / (durationMs / 1000)

    expect(speedPxPerSec).toBeLessThanOrEqual(260)
  })

  it('rejects nonpositive card steps', () => {
    expect(() => snapPositionToCard(100, 0)).toThrow('Шаг карточки должен быть положительным.')
    expect(() => calculateTerminalContinuationDurationMs(100, 0)).toThrow(
      'Шаг карточки должен быть положительным.',
    )
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
