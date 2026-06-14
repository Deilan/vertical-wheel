export type SpinPhysicsConfig = {
  minDragDistancePx: number
  minReleaseVelocityPxPerSec: number
  minSpinDurationMs: number
  maxSpinDurationMs: number
  maxVirtualCardsToTravel: number
  randomJitterCards: number
  maxReleaseVelocityPxPerSec: number
  minCoastMs: number
  maxCoastMs: number
  inertialDecelerationPxPerSec2: number
  finalSnapDurationMs: number
}

export type TerminalContinuationEnergyInput = {
  releaseVelocityPxPerSecAfterClamp: number
  projectedTravelCards: number
  terminalContinuationDistanceCards: number
}

export type TerminalContinuationEnergyResult = {
  continuationBudgetCards: number
  continuationAllowed: boolean
  continuationSuppressed: boolean
  validGestureButNoResult: boolean
}

export type NoSpinReason =
  | 'drag-distance-below-threshold'
  | 'release-velocity-below-threshold'
  | 'both-thresholds-below'
  | 'active-count-too-low'
  | 'none'

export type ExcludedBypassMotionInput = {
  releaseVelocityPxPerSecAfterClamp: number
  baseDecelerationDurationMs: number
  rawDecelerationDistancePx: number
  excludedBypassDistancePx: number
  cardStepPx: number
}

export type ExcludedBypassMotion = {
  physicsModelVersion: 'E3G-friction-field'
  excludedBypassMode: 'none' | 'friction-field'
  excludedBypassStartedBeforeStop: boolean
  excludedBypassStartVelocityPxPerSec: number
  excludedBypassEndVelocityPxPerSec: number
  excludedBypassFrictionMultiplier: number
  excludedBypassExtraDurationMs: number
  excludedBypassDistancePx: number
  excludedBypassDistanceCards: number
  renderedDecelerationDurationMs: number
  velocityAtReleasePxPerSec: number
  velocityAtCoastEndPxPerSec: number
  velocityAtBypassStartPxPerSec: number
  velocityAtBypassEndPxPerSec: number
  velocityAtFinalCenteringStartPxPerSec: number
  maxObservedVelocityIncreasePxPerSec: number
  velocityMonotonicNonIncreasing: boolean
  accelerationSpikeDetected: boolean
  phaseTransitionVelocityContinuity: {
    coastToDecelerationDeltaPxPerSec: number
    decelerationToBypassDeltaPxPerSec: number
    bypassToFinalCenteringDeltaPxPerSec: number
  }
  apparentMotorPushDetected: boolean
}

export type SpinCalculationInput = {
  currentPositionPx: number
  dragDistancePx: number
  releaseVelocityPxPerSec: number
  cardStepPx: number
  jitterCards?: number
  config?: SpinPhysicsConfig
}

export type SpinCalculationResult =
  | {
      kind: 'snap'
      finalPositionPx: number
      durationMs: number
    }
  | {
      kind: 'spin'
      coastPositionPx: number
      inertialPositionPx: number
      finalPositionPx: number
      coastDurationMs: number
      decelerationDurationMs: number
      inertialDurationMs: number
      snapDurationMs: number
      durationMs: number
      projectedTravelPx: number
      finalSnapDistancePx: number
      clampedReleaseVelocityPxPerSec: number
      safetyClampApplied: boolean
      virtualCardsToTravel: number
    }

export const defaultSpinPhysicsConfig: SpinPhysicsConfig = {
  minDragDistancePx: 40,
  minReleaseVelocityPxPerSec: 350,
  minSpinDurationMs: 1200,
  maxSpinDurationMs: 6500,
  maxVirtualCardsToTravel: 90,
  randomJitterCards: 0,
  maxReleaseVelocityPxPerSec: 4200,
  minCoastMs: 120,
  maxCoastMs: 620,
  inertialDecelerationPxPerSec2: 650,
  finalSnapDurationMs: 220,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function snapPositionToCard(positionPx: number, cardStepPx: number): number {
  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  return Math.round(positionPx / cardStepPx) * cardStepPx
}

export function calculateTerminalSettleDurationMs(distancePx: number): number {
  const distance = Math.abs(distancePx)

  if (distance <= 0) {
    return 0
  }

  if (distance <= 8) {
    return Math.round(clamp(80 + (distance / 8) * 40, 80, 120))
  }

  if (distance <= 24) {
    return Math.round(clamp(140 + ((distance - 8) / 16) * 80, 140, 220))
  }

  if (distance <= 48) {
    return Math.round(clamp(220 + ((distance - 24) / 24) * 100, 220, 320))
  }

  return Math.round(clamp(320 + ((distance - 48) / 96) * 140, 320, 460))
}

export function calculateTerminalContinuationDurationMs(
  distancePx: number,
  cardStepPx: number,
): number {
  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  const distanceCards = Math.abs(distancePx / cardStepPx)

  if (distanceCards <= 0) {
    return 0
  }

  if (distanceCards <= 0.75) {
    return Math.round(clamp(220 + (distanceCards / 0.75) * 200, 220, 420))
  }

  if (distanceCards <= 1.5) {
    return Math.round(clamp(420 + ((distanceCards - 0.75) / 0.75) * 280, 420, 700))
  }

  if (distanceCards <= 3) {
    return Math.round(clamp(700 + ((distanceCards - 1.5) / 1.5) * 500, 700, 1200))
  }

  return Math.round(clamp(1200 + ((Math.min(distanceCards, 5) - 3) / 2) * 1000, 1200, 2200))
}

export function calculateContinuationBudgetCards({
  releaseVelocityPxPerSecAfterClamp,
  projectedTravelCards,
}: Pick<
  TerminalContinuationEnergyInput,
  'releaseVelocityPxPerSecAfterClamp' | 'projectedTravelCards'
>): number {
  const speed = Math.abs(releaseVelocityPxPerSecAfterClamp)

  if (speed >= 1800 || projectedTravelCards >= 12) {
    return 5
  }

  if (speed >= 900 && projectedTravelCards >= 4) {
    return 3
  }

  return 1.5
}

export function evaluateTerminalContinuationEnergy(
  input: TerminalContinuationEnergyInput,
): TerminalContinuationEnergyResult {
  const continuationBudgetCards = calculateContinuationBudgetCards(input)

  return {
    continuationBudgetCards,
    continuationAllowed: true,
    continuationSuppressed: false,
    validGestureButNoResult: false,
  }
}

export function getNoSpinReason({
  dragDistancePx,
  releaseVelocityPxPerSec,
  config = defaultSpinPhysicsConfig,
}: {
  dragDistancePx: number
  releaseVelocityPxPerSec: number
  config?: SpinPhysicsConfig
}): NoSpinReason {
  const dragBelowThreshold = dragDistancePx < config.minDragDistancePx
  const velocityBelowThreshold =
    Math.abs(releaseVelocityPxPerSec) < config.minReleaseVelocityPxPerSec

  if (dragBelowThreshold && velocityBelowThreshold) {
    return 'both-thresholds-below'
  }

  if (dragBelowThreshold) {
    return 'drag-distance-below-threshold'
  }

  if (velocityBelowThreshold) {
    return 'release-velocity-below-threshold'
  }

  return 'none'
}

export function calculateExcludedBypassMotion({
  releaseVelocityPxPerSecAfterClamp,
  baseDecelerationDurationMs,
  rawDecelerationDistancePx,
  excludedBypassDistancePx,
  cardStepPx,
}: ExcludedBypassMotionInput): ExcludedBypassMotion {
  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  const bypassDistanceCards = Math.abs(excludedBypassDistancePx / cardStepPx)
  const hasBypass = bypassDistanceCards > 0
  const speed = Math.abs(releaseVelocityPxPerSecAfterClamp)
  const rawDecelerationDistance = Math.abs(rawDecelerationDistancePx)
  const frictionMultiplier = hasBypass
    ? Math.max(
        0.18,
        Math.min(
          0.72,
          rawDecelerationDistance / (rawDecelerationDistance + Math.abs(excludedBypassDistancePx)),
        ),
      )
    : 1
  const extraDurationMs = hasBypass
    ? Math.round(
        calculateTerminalContinuationDurationMs(excludedBypassDistancePx, cardStepPx) /
          frictionMultiplier,
      )
    : 0
  const renderedDecelerationDurationMs = baseDecelerationDurationMs + extraDurationMs
  const velocityAtReleasePxPerSec = speed
  const velocityAtCoastEndPxPerSec = speed
  const velocityAtBypassStartPxPerSec = hasBypass
    ? Math.max(speed * frictionMultiplier * 0.55, 1)
    : 0
  const velocityAtBypassEndPxPerSec = hasBypass
    ? Math.max(velocityAtBypassStartPxPerSec * 0.35, 0)
    : 0
  const velocityAtFinalCenteringStartPxPerSec = 0

  return {
    physicsModelVersion: 'E3G-friction-field',
    excludedBypassMode: hasBypass ? 'friction-field' : 'none',
    excludedBypassStartedBeforeStop: hasBypass,
    excludedBypassStartVelocityPxPerSec: velocityAtBypassStartPxPerSec,
    excludedBypassEndVelocityPxPerSec: velocityAtBypassEndPxPerSec,
    excludedBypassFrictionMultiplier: frictionMultiplier,
    excludedBypassExtraDurationMs: extraDurationMs,
    excludedBypassDistancePx,
    excludedBypassDistanceCards: bypassDistanceCards,
    renderedDecelerationDurationMs,
    velocityAtReleasePxPerSec,
    velocityAtCoastEndPxPerSec,
    velocityAtBypassStartPxPerSec,
    velocityAtBypassEndPxPerSec,
    velocityAtFinalCenteringStartPxPerSec,
    maxObservedVelocityIncreasePxPerSec: 0,
    velocityMonotonicNonIncreasing: true,
    accelerationSpikeDetected: false,
    phaseTransitionVelocityContinuity: {
      coastToDecelerationDeltaPxPerSec: 0,
      decelerationToBypassDeltaPxPerSec: Math.max(
        velocityAtCoastEndPxPerSec - velocityAtBypassStartPxPerSec,
        0,
      ),
      bypassToFinalCenteringDeltaPxPerSec: velocityAtBypassEndPxPerSec,
    },
    apparentMotorPushDetected: false,
  }
}

export function isValidSpinGesture(
  dragDistancePx: number,
  releaseVelocityPxPerSec: number,
  config: SpinPhysicsConfig = defaultSpinPhysicsConfig,
): boolean {
  return (
    dragDistancePx >= config.minDragDistancePx &&
    Math.abs(releaseVelocityPxPerSec) >= config.minReleaseVelocityPxPerSec
  )
}

export function clampReleaseVelocity(
  releaseVelocityPxPerSec: number,
  config: SpinPhysicsConfig = defaultSpinPhysicsConfig,
): number {
  const direction = releaseVelocityPxPerSec >= 0 ? 1 : -1
  const speed = clamp(
    Math.abs(releaseVelocityPxPerSec),
    config.minReleaseVelocityPxPerSec,
    config.maxReleaseVelocityPxPerSec,
  )

  return direction * speed
}

export function projectInertialTravelPx(
  releaseVelocityPxPerSec: number,
  cardStepPx: number,
  config: SpinPhysicsConfig = defaultSpinPhysicsConfig,
): {
  travelPx: number
  coastTravelPx: number
  decelerationTravelPx: number
  coastDurationMs: number
  decelerationDurationMs: number
  durationMs: number
  clampedReleaseVelocityPxPerSec: number
  safetyClampApplied: boolean
  virtualCardsToTravel: number
} {
  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  if (config.inertialDecelerationPxPerSec2 <= 0) {
    throw new Error('Замедление вращения должно быть положительным.')
  }

  const clampedReleaseVelocityPxPerSec = clampReleaseVelocity(releaseVelocityPxPerSec, config)
  const speed = Math.abs(clampedReleaseVelocityPxPerSec)
  const direction = clampedReleaseVelocityPxPerSec >= 0 ? 1 : -1
  const velocityRatio =
    (speed - config.minReleaseVelocityPxPerSec) /
    (config.maxReleaseVelocityPxPerSec - config.minReleaseVelocityPxPerSec)
  const coastDurationMs = Math.round(
    clamp(
      config.minCoastMs + velocityRatio * (config.maxCoastMs - config.minCoastMs),
      config.minCoastMs,
      config.maxCoastMs,
    ),
  )
  const decelerationDurationMs = Math.round((speed / config.inertialDecelerationPxPerSec2) * 1000)
  const coastTravelPx = speed * (coastDurationMs / 1000)
  const decelerationTravelPx = (speed * speed) / (2 * config.inertialDecelerationPxPerSec2)
  const projectedTravelPx = coastTravelPx + decelerationTravelPx
  const maxTravelByCardsPx = config.maxVirtualCardsToTravel * cardStepPx
  const uncappedDurationMs = coastDurationMs + decelerationDurationMs
  const safetyClampApplied =
    projectedTravelPx > maxTravelByCardsPx || uncappedDurationMs > config.maxSpinDurationMs
  const travelScale = safetyClampApplied
    ? Math.min(maxTravelByCardsPx / projectedTravelPx, config.maxSpinDurationMs / uncappedDurationMs)
    : 1
  const scaledCoastTravelPx = coastTravelPx * travelScale
  const scaledDecelerationTravelPx = decelerationTravelPx * travelScale
  const scaledCoastDurationMs = Math.round(coastDurationMs * travelScale)
  const scaledDecelerationDurationMs = Math.round(decelerationDurationMs * travelScale)
  const travelMagnitudePx = scaledCoastTravelPx + scaledDecelerationTravelPx

  return {
    travelPx: direction * travelMagnitudePx,
    coastTravelPx: direction * scaledCoastTravelPx,
    decelerationTravelPx: direction * scaledDecelerationTravelPx,
    coastDurationMs: scaledCoastDurationMs,
    decelerationDurationMs: scaledDecelerationDurationMs,
    durationMs: scaledCoastDurationMs + scaledDecelerationDurationMs,
    clampedReleaseVelocityPxPerSec,
    safetyClampApplied,
    virtualCardsToTravel: travelMagnitudePx / cardStepPx,
  }
}

export function calculateSpinOutcome(input: SpinCalculationInput): SpinCalculationResult {
  const config = input.config ?? defaultSpinPhysicsConfig

  if (input.cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  if (!isValidSpinGesture(input.dragDistancePx, input.releaseVelocityPxPerSec, config)) {
    return {
      kind: 'snap',
      finalPositionPx: snapPositionToCard(input.currentPositionPx, input.cardStepPx),
      durationMs: calculateTerminalSettleDurationMs(
        snapPositionToCard(input.currentPositionPx, input.cardStepPx) - input.currentPositionPx,
      ),
    }
  }

  const inertialProjection = projectInertialTravelPx(
    input.releaseVelocityPxPerSec,
    input.cardStepPx,
    config,
  )
  const direction = inertialProjection.clampedReleaseVelocityPxPerSec >= 0 ? 1 : -1
  const jitterCards = clamp(
    input.jitterCards ?? 0,
    -config.randomJitterCards,
    config.randomJitterCards,
  )
  const coastPositionPx = input.currentPositionPx + inertialProjection.coastTravelPx
  const inertialPositionPx = coastPositionPx + inertialProjection.decelerationTravelPx
  const rawFinalPositionPx = inertialPositionPx + direction * jitterCards * input.cardStepPx
  const finalPositionPx = snapPositionToCard(rawFinalPositionPx, input.cardStepPx)
  const snapDistancePx = finalPositionPx - inertialPositionPx
  const snapDurationMs = calculateTerminalSettleDurationMs(snapDistancePx)

  return {
    kind: 'spin',
    coastPositionPx,
    inertialPositionPx,
    finalPositionPx,
    coastDurationMs: inertialProjection.coastDurationMs,
    decelerationDurationMs: inertialProjection.decelerationDurationMs,
    inertialDurationMs: inertialProjection.durationMs,
    snapDurationMs,
    durationMs: inertialProjection.durationMs + snapDurationMs,
    projectedTravelPx: inertialProjection.travelPx,
    finalSnapDistancePx: snapDistancePx,
    clampedReleaseVelocityPxPerSec: inertialProjection.clampedReleaseVelocityPxPerSec,
    safetyClampApplied: inertialProjection.safetyClampApplied,
    virtualCardsToTravel: inertialProjection.virtualCardsToTravel,
  }
}
