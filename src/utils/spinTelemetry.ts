export type SpinTelemetryPhase = 'drag' | 'coast' | 'deceleration' | 'final-snap' | 'complete'

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
  }
  valid?: {
    initialVelocityPxPerSec: number
    velocityClamp: {
      minPxPerSec: number
      maxPxPerSec: number
      wasClamped: boolean
    }
    projectedTravelDistancePx: number
    actualAnimatedTravelDistancePx: number
    coastDurationMs?: number
    decelerationDurationMs: number
    totalSpinDurationMs: number
    finalSnapDistancePx: number
    finalPositionBeforeSnapPx: number
    finalSnappedPositionPx: number
    rawLandingCandidate?: SpinTelemetryOptionSummary
    adjustedEligibleOption?: SpinTelemetryOptionSummary
    selectedResult?: SpinTelemetryOptionSummary
    candidateWasExcluded: boolean
    adjustedDueToExclusion: boolean
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
