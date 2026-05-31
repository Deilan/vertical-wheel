export type SpinPhysicsConfig = {
  minDragDistancePx: number
  minReleaseVelocityPxPerSec: number
  minSpinDurationMs: number
  maxSpinDurationMs: number
  maxVirtualCardsToTravel: number
  randomJitterCards: number
  maxReleaseVelocityPxPerSec: number
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
      finalPositionPx: number
      durationMs: number
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

  const direction = input.releaseVelocityPxPerSec >= 0 ? 1 : -1
  const clampedVelocity = clamp(
    Math.abs(input.releaseVelocityPxPerSec),
    config.minReleaseVelocityPxPerSec,
    config.maxReleaseVelocityPxPerSec,
  )
  const dragCards = clamp(input.dragDistancePx / input.cardStepPx, 0, 12)
  const velocityRatio =
    (clampedVelocity - config.minReleaseVelocityPxPerSec) /
    (config.maxReleaseVelocityPxPerSec - config.minReleaseVelocityPxPerSec)
  const velocityCards = 8 + velocityRatio * 30
  const virtualCardsToTravel = clamp(
    velocityCards + dragCards * 0.58,
    4,
    config.maxVirtualCardsToTravel,
  )
  const jitterCards = clamp(
    input.jitterCards ?? 0,
    -config.randomJitterCards,
    config.randomJitterCards,
  )
  const rawFinalPositionPx =
    input.currentPositionPx + direction * (virtualCardsToTravel + jitterCards) * input.cardStepPx
  const finalPositionPx = snapPositionToCard(rawFinalPositionPx, input.cardStepPx)
  const durationMs = Math.round(
    clamp(
      config.minSpinDurationMs +
        (virtualCardsToTravel / config.maxVirtualCardsToTravel) *
          (config.maxSpinDurationMs - config.minSpinDurationMs),
      config.minSpinDurationMs,
      config.maxSpinDurationMs,
    ),
  )

  return {
    kind: 'spin',
    finalPositionPx,
    durationMs,
    virtualCardsToTravel,
  }
}
