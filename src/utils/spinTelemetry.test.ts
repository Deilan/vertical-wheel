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
        targetSelectionPolicy: 'directional-eligible',
        localEligibleTargetSelectionApplied: true,
        rawInertialPositionPx: 580,
        rawRoundedTerminalPositionPx: 500,
        rawTerminalLandingPositionPx: 500,
        rawTerminalLandingWasExcluded: true,
        nearestEligibleTarget: {
          id: 'a',
          title: 'Активная',
          originalIndex: 0,
          visibleIndex: 0,
          active: true,
          excluded: false,
          positionPx: 600,
        },
        nearestEligibleDistancePx: 100,
        nearestEligibleDistanceCards: 1,
        directionPreserved: true,
        reverseDirectionCandidateIgnored: true,
        reverseDirectionCandidate: {
          id: 'c',
          title: 'Обратная',
          originalIndex: 2,
          visibleIndex: 2,
          active: true,
          excluded: false,
          positionPx: 400,
        },
        reverseDirectionCandidateDistanceCards: 1,
        chosenTargetDirection: 'same-direction',
        rawExcludedLandingBypassed: true,
        resolvedEligibleTarget: {
          id: 'a',
          title: 'Активная',
          originalIndex: 0,
          visibleIndex: 0,
          active: true,
          excluded: false,
          positionPx: 600,
        },
        terminalContinuationDistancePx: 100,
        terminalContinuationDistanceCards: 1,
        terminalContinuationDurationMs: 420,
        terminalContinuationWasLong: false,
        terminalContinuationStartedBeforeStop: true,
        continuationBudgetCards: 3,
        continuationAllowed: true,
        continuationSuppressed: false,
        validGestureButNoResult: false,
        finalCenteringDistancePx: 0,
        finalCenteringDistanceCards: 0,
        finalCenteringDurationMs: 0,
        rawExcludedWasNotVisualStop: true,
        integratedExcludedSettling: true,
        decelerationEndpointPolicy: 'resolved-eligible-target',
        terminalContinuationIntegratedIntoDeceleration: true,
        eligibilityMovementWasLong: false,
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
        finalSettleAnimated: true,
        finalSettleDurationMs: 180,
        finalSettleDistancePx: 20,
        finalSettleDistanceCards: 0.2,
        visibleJumpPrevented: true,
        finalCorrectionPx: 0,
        safetyClampApplied: false,
      },
    })

    expect(report.valid?.eligibilityAdjustmentReason).toBe('candidate-excluded')
    expect(report.valid?.targetSelectionPolicy).toBe('directional-eligible')
    expect(report.valid?.directionPreserved).toBe(true)
    expect(report.valid?.reverseDirectionCandidateIgnored).toBe(true)
    expect(report.valid?.terminalContinuationDistanceCards).toBe(1)
    expect(report.valid?.continuationBudgetCards).toBe(3)
    expect(report.valid?.continuationAllowed).toBe(true)
    expect(report.valid?.continuationSuppressed).toBe(false)
    expect(report.valid?.resolvedEligibleTarget?.id).toBe('a')
    expect(report.valid?.finalSettleAnimated).toBe(true)
    expect(report.valid?.finalSnapWasLarge).toBe(false)
    expect(JSON.stringify(report)).not.toContain('data:image/')
  })

  it('reports far excluded landings as directional eligible results, not no-result suppression', () => {
    const report = createSpinTelemetryReport({
      reportId: 'spin-integrated-exclusion',
      timestamp: '2026-06-02T00:00:00.000Z',
      classification: 'valid spin gesture',
      dragDistancePx: 80,
      dragDurationMs: 180,
      releaseVelocityPxPerSecRaw: 700,
      releaseVelocityPxPerSecAfterClamp: 700,
      direction: 'down',
      startPositionPx: 0,
      releasePositionPx: -80,
      cardStepPx: 100,
      optionCount: 6,
      visibleOptionCount: 6,
      activeOptionCount: 2,
      excludedOptionCount: 4,
      thresholds: {
        minDragDistancePx: 40,
        minReleaseVelocityPxPerSec: 350,
      },
      pointerSamples: [],
      frameSamples: [],
      valid: {
        initialVelocityPxPerSec: -700,
        velocityClamp: {
          minPxPerSec: 350,
          maxPxPerSec: 4200,
          wasClamped: false,
        },
        projectedTravelDistancePx: -360,
        projectedTravelCards: 3.6,
        actualAnimatedTravelDistancePx: -380,
        decelerationDurationMs: 1800,
        totalSpinDurationMs: 2100,
        finalSnapDistancePx: 0,
        finalSnapDistanceCards: 0,
        finalSnapWasLarge: false,
        finalPositionBeforeSnapPx: -900,
        finalSnappedPositionPx: -900,
        rawLandingCandidateExcluded: true,
        candidateWasExcluded: true,
        adjustedDueToExclusion: true,
        targetSelectionPolicy: 'directional-eligible',
        rawTerminalLandingWasExcluded: true,
        terminalContinuationDistancePx: -600,
        terminalContinuationDistanceCards: 6,
        terminalContinuationDurationMs: 2200,
        terminalContinuationWasLong: true,
        terminalContinuationStartedBeforeStop: false,
        continuationBudgetCards: 1.5,
        continuationAllowed: true,
        continuationSuppressed: false,
        validGestureButNoResult: false,
        finalCenteringDistancePx: 0,
        finalCenteringDistanceCards: 0,
        finalCenteringDurationMs: 0,
        rawExcludedWasNotVisualStop: true,
        integratedExcludedSettling: true,
        decelerationEndpointPolicy: 'resolved-eligible-target',
        terminalContinuationIntegratedIntoDeceleration: true,
        resolvedEligibleTarget: {
          id: 'a',
          title: 'Активная',
          originalIndex: 0,
          visibleIndex: 0,
          active: true,
          excluded: false,
          positionPx: -900,
        },
        selectedResult: {
          id: 'a',
          title: 'Активная',
          originalIndex: 0,
          visibleIndex: 0,
          active: true,
          excluded: false,
        },
        eligibilityAdjustmentApplied: true,
        eligibilityAdjustmentReason: 'candidate-excluded',
        eligibilityAdjustmentDirection: 'backward',
        safetyClampApplied: false,
      },
    })

    expect(report.valid?.targetSelectionPolicy).toBe('directional-eligible')
    expect(report.valid?.validGestureButNoResult).toBe(false)
    expect(report.valid?.continuationSuppressed).toBe(false)
    expect(report.valid?.selectedResult?.id).toBe('a')
    expect(report.valid?.rawExcludedWasNotVisualStop).toBe(true)
    expect(report.valid?.integratedExcludedSettling).toBe(true)
    expect(report.valid?.finalSnapWasLarge).toBe(false)
  })
})
