import { describe, expect, it } from 'vitest'
import {
  appendBoundedFrameSample,
  appendBoundedPointerSample,
  createSpinTelemetryReport,
} from './spinTelemetry'

describe('spin telemetry helpers', () => {
  it('caps pointer samples to the most recent 30 entries', () => {
    let samples: ReturnType<typeof appendBoundedPointerSample> = []

    for (let index = 0; index < 35; index += 1) {
      samples = appendBoundedPointerSample(samples, {
        timestampMs: index,
        y: index * 2,
        positionPx: index * 3,
      })
    }

    expect(samples).toHaveLength(30)
    expect(samples[0].timestampMs).toBe(5)
  })

  it('caps frame samples to the first 120 entries', () => {
    let samples: ReturnType<typeof appendBoundedFrameSample> = []

    for (let index = 0; index < 130; index += 1) {
      samples = appendBoundedFrameSample(samples, {
        elapsedMs: index * 16,
        positionPx: index,
        approximateVelocityPxPerSec: 100,
        phase: 'deceleration',
      })
    }

    expect(samples).toHaveLength(120)
    expect(samples.at(-1)?.positionPx).toBe(119)
  })

  it('creates a bounded report shape', () => {
    const report = createSpinTelemetryReport({
      reportId: 'spin-test',
      timestamp: '2026-06-02T00:00:00.000Z',
      classification: 'weak gesture',
      dragDistancePx: 12,
      dragDurationMs: 100,
      releaseVelocityPxPerSecRaw: 120,
      direction: 'up',
      startPositionPx: 0,
      releasePositionPx: 12,
      cardStepPx: 100,
      optionCount: 3,
      visibleOptionCount: 3,
      activeOptionCount: 3,
      excludedOptionCount: 0,
      thresholds: {
        minDragDistancePx: 40,
        minReleaseVelocityPxPerSec: 350,
      },
      pointerSamples: Array.from({ length: 35 }, (_, index) => ({
        timestampMs: index,
        y: index,
        positionPx: index,
      })),
      frameSamples: [],
      weak: {
        snapTargetPositionPx: 0,
        snapDistancePx: -12,
        noResult: true,
      },
    })

    expect(report).toMatchObject({
      reportId: 'spin-test',
      classification: 'weak gesture',
      weak: { noResult: true },
    })
    expect(report.pointerSamples).toHaveLength(30)
  })

  it('keeps eligibility settling details in valid spin reports without image payloads', () => {
    const report = createSpinTelemetryReport({
      reportId: 'spin-exclusion',
      timestamp: '2026-06-02T00:00:00.000Z',
      classification: 'valid spin gesture',
      dragDistancePx: 120,
      dragDurationMs: 220,
      releaseVelocityPxPerSecRaw: 1400,
      releaseVelocityPxPerSecAfterClamp: 1400,
      direction: 'up',
      startPositionPx: 0,
      releasePositionPx: 120,
      cardStepPx: 100,
      optionCount: 3,
      visibleOptionCount: 3,
      activeOptionCount: 2,
      excludedOptionCount: 1,
      excludedDisplayStateSummary: {
        hidden: 0,
        showDisabled: 1,
      },
      visibleOptionOrder: [
        {
          id: 'a',
          title: 'Активная',
          originalIndex: 0,
          visibleIndex: 0,
          active: true,
          excluded: false,
        },
        {
          id: 'b',
          title: 'Исключенная',
          originalIndex: 1,
          visibleIndex: 1,
          active: false,
          excluded: true,
          excludedDisplayMode: 'show-disabled',
        },
      ],
      activeOptionIdsInVisibleOrder: ['a'],
      thresholds: {
        minDragDistancePx: 40,
        minReleaseVelocityPxPerSec: 350,
      },
      pointerSamples: [],
      frameSamples: [],
      valid: {
        initialVelocityPxPerSec: 1400,
        velocityClamp: {
          minPxPerSec: 350,
          maxPxPerSec: 4200,
          wasClamped: false,
        },
        projectedTravelDistancePx: 480,
        projectedTravelCards: 4.8,
        actualAnimatedTravelDistancePx: 600,
        coastDurationMs: 220,
        decelerationDurationMs: 900,
        totalSpinDurationMs: 1120,
        finalSnapDistancePx: 20,
        finalSnapDistanceCards: 0.2,
        finalSnapWasLarge: false,
        finalPositionBeforeSnapPx: 580,
        finalSnappedPositionPx: 600,
        rawPhysicalLandingCandidate: {
          id: 'b',
          title: 'Исключенная',
          originalIndex: 1,
          visibleIndex: 1,
          active: false,
          excluded: true,
          excludedDisplayMode: 'show-disabled',
          positionPx: 500,
        },
        rawLandingCandidateExcluded: true,
        adjustedEligibleOption: {
          id: 'a',
          title: 'Активная',
          originalIndex: 0,
          visibleIndex: 0,
          active: true,
          excluded: false,
          positionPx: 600,
        },
        selectedResult: {
          id: 'a',
          title: 'Активная',
          originalIndex: 0,
          visibleIndex: 0,
          active: true,
          excluded: false,
        },
        candidateWasExcluded: true,
        adjustedDueToExclusion: true,
        eligibilityAdjustmentApplied: true,
        eligibilityAdjustmentReason: 'candidate-excluded',
        eligibilityAdjustmentDirection: 'forward',
        eligibilityExtensionCards: 1,
        eligibilityExtensionPx: 100,
        projectedPositionBeforeEligibilityAdjustmentPx: 500,
        projectedPositionAfterEligibilityAdjustmentPx: 600,
        positionBeforeFinalSnapPx: 580,
        totalTravelBeforeEligibilityExtensionPx: 380,
        totalTravelAfterEligibilityExtensionPx: 480,
        totalDurationBeforeEligibilityExtensionMs: 1000,
        totalDurationAfterEligibilityExtensionMs: 1120,
        safetyClampApplied: false,
      },
    })

    expect(report.valid?.eligibilityAdjustmentReason).toBe('candidate-excluded')
    expect(report.valid?.finalSnapWasLarge).toBe(false)
    expect(JSON.stringify(report)).not.toContain('data:image/')
  })
})
