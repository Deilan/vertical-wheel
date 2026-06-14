import { describe, expect, it } from 'vitest'
import {
  createDebugLogExport,
  createDiagnosticsBundle,
  createDownloadFileName,
  createLocationSummary,
  createSpinReportsExport,
  sanitizeDiagnosticsPayload,
} from './diagnosticsExport'

describe('diagnostics export helpers', () => {
  it('creates deterministic JSON file names', () => {
    expect(
      createDownloadFileName(
        'vertical-wheel-debug-log',
        new Date('2026-06-14T03:04:05.000Z'),
      ),
    ).toBe('vertical-wheel-debug-log-20260614-030405.json')
  })

  it('creates a diagnostics bundle without exposing the full hash', () => {
    const location = createLocationSummary({
      pathname: '/vertical-wheel/',
      search: '?debug=1',
      hash: `#wheel=${'a'.repeat(300)}`,
    })
    const bundle = createDiagnosticsBundle({
      events: [
        {
          id: 1,
          timestamp: '2026-06-14T00:00:00.000Z',
          category: 'spin',
          name: 'valid_spin',
        },
      ],
      spinReports: [],
      location,
      userAgent: 'Test Browser',
      exportedAt: '2026-06-14T00:00:00.000Z',
    })

    expect(bundle.location).toEqual({
      pathname: '/vertical-wheel/',
      search: '?debug=1',
      hashPresent: true,
      hashLength: 307,
    })
    expect(JSON.stringify(bundle)).not.toContain('#wheel=')
    expect(bundle.counts).toEqual({ debugLogCount: 1, spinReportCount: 0 })
  })

  it('sanitizes base64 image-like payloads', () => {
    const sanitized = sanitizeDiagnosticsPayload({
      image: {
        kind: 'data',
        value: `data:image/webp;base64,${'a'.repeat(900)}`,
      },
    })

    expect(sanitized).toEqual({
      image: {
        kind: 'data',
        approximateLength: 923,
        mimePrefix: 'data:image/webp',
      },
    })
  })

  it('exports debug logs and empty spin reports as structured JSON objects', () => {
    const debugLog = createDebugLogExport([], '2026-06-14T00:00:00.000Z')
    const spinReports = createSpinReportsExport([], '2026-06-14T00:00:00.000Z')

    expect(debugLog).toMatchObject({
      type: 'debug-log',
      debugLogCount: 0,
      entries: [],
    })
    expect(spinReports).toMatchObject({
      type: 'spin-reports',
      spinReportCount: 0,
      spinReports: [],
    })
  })
})
