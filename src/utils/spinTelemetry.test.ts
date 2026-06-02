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
})
