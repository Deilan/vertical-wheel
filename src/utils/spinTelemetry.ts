export type SpinTelemetryPhase =
  | 'drag'
  | 'coast'
  | 'deceleration'
  | 'terminal-continuation'
  | 'final-snap'
  | 'complete'

export type SpinTelemetryPointerSample = {
  timestampMs: number
  y: number
  positionPx: number
  instantaneousVelocityPxPerSec?: number
}

export type SpinTelemetryFrameSample = {
  elapsedMs: number
  positionPx: number
  approximateVelocityPxPerSec: number
  phase: SpinTelemetryPhase
}

export type SpinTelemetryOptionSummary = {
  id: string
  title: string
  index?: number
  originalIndex?: number
  visibleIndex?: number
  active?: boolean
  excluded?: boolean
  excludedDisplayMode?: 'hide' | 'show-disabled'
  positionPx?: number
}

export type SpinTelemetryVisibleOptionSummary = {
  id: string
  title: string
  originalIndex: number
  visibleIndex: number
  active: boolean
  excluded: boolean
  excludedDisplayMode?: 'hide' | 'show-disabled'
}

export type SpinTelemetryReport = {
  reportId: string
  timestamp: string
  classification: 'weak gesture' | 'valid spin gesture'
  dragDistancePx: number
  dragDurationMs: number
  releaseVelocityPxPerSecRaw: number
  releaseVelocityPxPerSecAfterClamp?: number
  direction: 'up' | 'down'
  startPositionPx: number
  releasePositionPx: number
  cardStepPx: number
  optionCount: number
  visibleOptionCount: number
  activeOptionCount: number
  excludedOptionCount: number
  excludedDisplayStateSummary?: {
    hidden: number
    showDisabled: number
  }
  visibleOptionOrder?: SpinTelemetryVisibleOptionSummary[]
  activeOptionIdsInVisibleOrder?: string[]
  thresholds: {
    minDragDistancePx: number
    minReleaseVelocityPxPerSec: number
  }
  pointerSamples: SpinTelemetryPointerSample[]
  frameSamples: SpinTelemetryFrameSample[]
  weak?: {
    snapTargetPositionPx: number
    snapDistancePx: number
    noResult: true
    targetSelectionPolicy?: 'weak-snap' | 'locked'
    finalSettleAnimated?: boolean
    finalSettleDurationMs?: number
    finalSettleDistancePx?: number
    finalSettleDistanceCards?: number
    visibleJumpPrevented?: boolean
    finalCorrectionPx?: number
  }
  valid?: {
    initialVelocityPxPerSec: number
    velocityClamp: {
      minPxPerSec: number
      maxPxPerSec: number
      wasClamped: boolean
    }
    projectedTravelDistancePx: number
    projectedTravelCards: number
    actualAnimatedTravelDistancePx: number
    coastDurationMs?: number
    decelerationDurationMs: number
    totalSpinDurationMs: number
    finalSnapDistancePx: number
    finalSnapDistanceCards?: number
    finalSnapWasLarge?: boolean
    finalPositionBeforeSnapPx: number
    finalSnappedPositionPx: number
    rawLandingCandidate?: SpinTelemetryOptionSummary
    rawPhysicalLandingCandidate?: SpinTelemetryOptionSummary
    rawLandingCandidateExcluded?: boolean
    adjustedEligibleOption?: SpinTelemetryOptionSummary
    selectedResult?: SpinTelemetryOptionSummary
    candidateWasExcluded: boolean
    adjustedDueToExclusion: boolean
    targetSelectionPolicy?:
      | 'raw-active'
      | 'directional-eligible'
      | 'insufficient-energy-no-result'
      | 'weak-snap'
      | 'locked'
    localEligibleTargetSelectionApplied?: boolean
    rawTerminalLandingPositionPx?: number
    nearestEligibleTarget?: SpinTelemetryOptionSummary
    nearestEligibleDistancePx?: number
    nearestEligibleDistanceCards?: number
    directionPreferredTarget?: SpinTelemetryOptionSummary
    directionPreferredDistanceCards?: number
    chosenTargetDirection?: 'same-direction' | 'none'
    directionPreserved?: boolean
    reverseDirectionCandidateIgnored?: boolean
    reverseDirectionCandidate?: SpinTelemetryOptionSummary
    reverseDirectionCandidateDistanceCards?: number
    rawExcludedLandingBypassed?: boolean
    rawInertialPositionPx?: number
    rawRoundedTerminalPositionPx?: number
    rawTerminalLandingWasExcluded?: boolean
    resolvedEligibleTarget?: SpinTelemetryOptionSummary
    terminalContinuationDistancePx?: number
    terminalContinuationDistanceCards?: number
    terminalContinuationDurationMs?: number
    terminalContinuationWasLong?: boolean
    terminalContinuationStartedBeforeStop?: boolean
    continuationBudgetCards?: number
    continuationAllowed?: boolean
    continuationSuppressed?: boolean
    validGestureButNoResult?: boolean
    noResultReason?: 'insufficient-energy-for-eligible-continuation'
    finalCenteringDistancePx?: number
    finalCenteringDistanceCards?: number
    finalCenteringDurationMs?: number
    eligibilityMovementWasLong?: boolean
    eligibilityAdjustmentApplied?: boolean
    eligibilityAdjustmentReason?:
      | 'none'
      | 'candidate-excluded'
      | 'no-eligible-options'
      | 'active-count-too-low'
    eligibilityAdjustmentDirection?: 'forward' | 'backward' | 'none'
    eligibilityExtensionCards?: number
    eligibilityExtensionPx?: number
    projectedPositionBeforeEligibilityAdjustmentPx?: number
    projectedPositionAfterEligibilityAdjustmentPx?: number
    positionBeforeFinalSnapPx?: number
    totalTravelBeforeEligibilityExtensionPx?: number
    totalTravelAfterEligibilityExtensionPx?: number
    totalDurationBeforeEligibilityExtensionMs?: number
    totalDurationAfterEligibilityExtensionMs?: number
    finalSettleAnimated?: boolean
    finalSettleDurationMs?: number
    finalSettleDistancePx?: number
    finalSettleDistanceCards?: number
    visibleJumpPrevented?: boolean
    finalCorrectionPx?: number
    safetyClampApplied: boolean
  }
}

const MAX_POINTER_SAMPLES = 30
const MAX_FRAME_SAMPLES = 120

export function appendBoundedPointerSample(
  samples: SpinTelemetryPointerSample[],
  sample: SpinTelemetryPointerSample,
  maxSamples = MAX_POINTER_SAMPLES,
): SpinTelemetryPointerSample[] {
  return [...samples, sample].slice(-maxSamples)
}

export function appendBoundedFrameSample(
  samples: SpinTelemetryFrameSample[],
  sample: SpinTelemetryFrameSample,
  maxSamples = MAX_FRAME_SAMPLES,
): SpinTelemetryFrameSample[] {
  if (samples.length < maxSamples) {
    return [...samples, sample]
  }

  return samples
}

export function createSpinTelemetryReport(
  report: Omit<SpinTelemetryReport, 'reportId' | 'timestamp' | 'pointerSamples' | 'frameSamples'> & {
    reportId?: string
    timestamp?: string
    pointerSamples?: SpinTelemetryPointerSample[]
    frameSamples?: SpinTelemetryFrameSample[]
  },
): SpinTelemetryReport {
  return {
    ...report,
    reportId: report.reportId ?? `spin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: report.timestamp ?? new Date().toISOString(),
    pointerSamples: (report.pointerSamples ?? []).slice(-MAX_POINTER_SAMPLES),
    frameSamples: (report.frameSamples ?? []).slice(0, MAX_FRAME_SAMPLES),
  }
}
