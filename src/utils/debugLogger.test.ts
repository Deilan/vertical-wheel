import { describe, expect, it, vi } from 'vitest'
import { createDebugLogger, sanitizeDebugPayload } from './debugLogger'
import { createSpinTelemetryReport } from './spinTelemetry'

describe('debug logger', () => {
  it('does not store events when disabled', () => {
    const logger = createDebugLogger(false)

    logger.log('app', 'ignored', { value: 'test' })

    expect(logger.getEvents()).toHaveLength(0)
  })

  it('stores events when enabled', () => {
    const logger = createDebugLogger(true)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    logger.log('app', 'started', { value: 'test' })

    expect(logger.getEvents()).toHaveLength(1)
    expect(logger.getEvents()[0]).toMatchObject({
      category: 'app',
      name: 'started',
      payload: { value: 'test' },
    })
    debug.mockRestore()
  })

  it('caps the ring buffer at 300 events', () => {
    const logger = createDebugLogger(true)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    for (let index = 0; index < 305; index += 1) {
      logger.log('spin', 'event', { index })
    }

    expect(logger.getEvents()).toHaveLength(300)
    expect(logger.getEvents()[0].payload).toEqual({ index: 5 })
    debug.mockRestore()
  })

  it('truncates large strings', () => {
    const sanitized = sanitizeDebugPayload({ text: 'a'.repeat(240) })

    expect(sanitized).toEqual({
      text: expect.stringContaining('[truncated, length=240]'),
    })
  })

  it('strips base64 image payloads', () => {
    const sanitized = sanitizeDebugPayload({
      image: {
        kind: 'data',
        value: `data:image/webp;base64,${'a'.repeat(400)}`,
      },
    })

    expect(sanitized).toEqual({
      image: {
        kind: 'data',
        approximateLength: 423,
        mimePrefix: 'data:image/webp',
      },
    })
  })

  it('stores and clears spin telemetry reports only when enabled', () => {
    const disabledLogger = createDebugLogger(false)
    const enabledLogger = createDebugLogger(true)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const report = createSpinTelemetryReport({
      reportId: 'spin-report-test',
      timestamp: '2026-06-02T00:00:00.000Z',
      classification: 'valid spin gesture',
      dragDistancePx: 80,
      dragDurationMs: 220,
      releaseVelocityPxPerSecRaw: 900,
      releaseVelocityPxPerSecAfterClamp: 900,
      direction: 'up',
      startPositionPx: 0,
      releasePositionPx: 120,
      cardStepPx: 100,
      optionCount: 3,
      visibleOptionCount: 3,
      activeOptionCount: 3,
      excludedOptionCount: 0,
      thresholds: {
        minDragDistancePx: 40,
        minReleaseVelocityPxPerSec: 350,
      },
      pointerSamples: [],
      frameSamples: [],
    })

    disabledLogger.addSpinReport(report)
    enabledLogger.addSpinReport(report)

    expect(disabledLogger.getSpinReports()).toHaveLength(0)
    expect(enabledLogger.getLastSpinReport()?.reportId).toBe('spin-report-test')

    enabledLogger.clearSpinReports()
    expect(enabledLogger.getSpinReports()).toHaveLength(0)
    debug.mockRestore()
  })
})
