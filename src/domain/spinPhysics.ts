export type SpinPhysicsConfig = {
  minDragDistancePx: number
  minReleaseVelocityPxPerSec: number
  minSpinDurationMs: number
  maxSpinDurationMs: number
  maxVirtualCardsToTravel: number
  randomJitterCards: number
  maxReleaseVelocityPxPerSec: number
  inertialDecelerationPxPerSec2: number
  finalSnapDurationMs: number
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
      inertialPositionPx: number
      finalPositionPx: number
      inertialDurationMs: number
      snapDurationMs: number
      durationMs: number
      projectedTravelPx: number
      finalSnapDistancePx: number
      clampedReleaseVelocityPxPerSec: number
      virtualCardsToTravel: number
    }

export const defaultSpinPhysicsConfig: SpinPhysicsConfig = {
  minDragDistancePx: 40,
  minReleaseVelocityPxPerSec: 350,
  minSpinDurationMs: 1200,
  maxSpinDurationMs: 4500,
  maxVirtualCardsToTravel: 45,
  randomJitterCards: 0.5,
  maxReleaseVelocityPxPerSec: 2600,
  inertialDecelerationPxPerSec2: 220,
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
  durationMs: number
  clampedReleaseVelocityPxPerSec: number
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
  const projectedTravelPx = (speed * speed) / (2 * config.inertialDecelerationPxPerSec2)
  const maxTravelByCardsPx = config.maxVirtualCardsToTravel * cardStepPx
  const maxTravelByDurationPx = (speed * config.maxSpinDurationMs) / 2000
  const travelMagnitudePx = clamp(
    projectedTravelPx,
    0,
    Math.min(maxTravelByCardsPx, maxTravelByDurationPx),
  )
  const durationMs = Math.round((travelMagnitudePx * 2000) / speed)

  return {
    travelPx: direction * travelMagnitudePx,
    durationMs,
    clampedReleaseVelocityPxPerSec,
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
      durationMs: 260,
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
  const inertialPositionPx = input.currentPositionPx + inertialProjection.travelPx
  const rawFinalPositionPx = inertialPositionPx + direction * jitterCards * input.cardStepPx
  const finalPositionPx = snapPositionToCard(rawFinalPositionPx, input.cardStepPx)
  const snapDistancePx = finalPositionPx - inertialPositionPx
  const snapDurationMs = Math.round(
    clamp(
      (Math.abs(snapDistancePx) / input.cardStepPx) * config.finalSnapDurationMs,
      120,
      config.finalSnapDurationMs,
    ),
  )

  return {
    kind: 'spin',
    inertialPositionPx,
    finalPositionPx,
    inertialDurationMs: inertialProjection.durationMs,
    snapDurationMs,
    durationMs: inertialProjection.durationMs + snapDurationMs,
    projectedTravelPx: inertialProjection.travelPx,
    finalSnapDistancePx: snapDistancePx,
    clampedReleaseVelocityPxPerSec: inertialProjection.clampedReleaseVelocityPxPerSec,
    virtualCardsToTravel: inertialProjection.virtualCardsToTravel,
  }
}
