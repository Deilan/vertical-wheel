import type { DebugEvent } from './debugLogger'
import type { SpinTelemetryReport } from './spinTelemetry'

export type DiagnosticsLocationSummary = {
  pathname: string
  search: string
  hashPresent: boolean
  hashLength: number
}

export type DiagnosticsBundleInput = {
  events: DebugEvent[]
  spinReports: SpinTelemetryReport[]
  location: DiagnosticsLocationSummary
  userAgent?: string
  appVersion?: string
  exportedAt?: string
}

const APP_NAME = 'Vertical Wheel'
const MAX_STRING_LENGTH = 500
const MAX_DEPTH = 8

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function createDownloadFileName(prefix: string, date = new Date()): string {
  const timestamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`

  return `${prefix}-${timestamp}.json`
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated, length=${value.length}]`
}

function sanitizeString(value: string): unknown {
  if (value.startsWith('data:image/')) {
    const mimePrefix = value.slice(0, value.indexOf(';') > 0 ? value.indexOf(';') : 32)

    return {
      kind: 'data',
      approximateLength: value.length,
      mimePrefix: truncateString(mimePrefix),
    }
  }

  if (value.includes('#wheel=')) {
    return `[share link omitted, length=${value.length}]`
  }

  return truncateString(value)
}

export function sanitizeDiagnosticsPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return sanitizeString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[array depth limit, length=${value.length}]`
    }

    return value.map((item) => sanitizeDiagnosticsPayload(item, depth + 1))
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    if (
      record.kind === 'data' &&
      typeof record.value === 'string' &&
      record.value.startsWith('data:image/')
    ) {
      return sanitizeString(record.value)
    }

    if (depth >= MAX_DEPTH) {
      return '[object depth limit]'
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, entryValue]) => [
        key,
        sanitizeDiagnosticsPayload(entryValue, depth + 1),
      ]),
    )
  }

  return String(value)
}

export function createLocationSummary(location: Pick<Location, 'pathname' | 'search' | 'hash'>): DiagnosticsLocationSummary {
  return {
    pathname: location.pathname,
    search: location.search,
    hashPresent: location.hash.length > 0,
    hashLength: location.hash.length,
  }
}

export function createDebugLogExport(events: DebugEvent[], exportedAt = new Date().toISOString()) {
  return {
    exportedAt,
    appName: APP_NAME,
    type: 'debug-log',
    debugLogCount: events.length,
    entries: sanitizeDiagnosticsPayload(events),
  }
}

export function createSpinReportsExport(
  spinReports: SpinTelemetryReport[],
  exportedAt = new Date().toISOString(),
) {
  return {
    exportedAt,
    appName: APP_NAME,
    type: 'spin-reports',
    spinReportCount: spinReports.length,
    spinReports: sanitizeDiagnosticsPayload(spinReports),
  }
}

export function createDiagnosticsBundle({
  events,
  spinReports,
  location,
  userAgent,
  appVersion,
  exportedAt = new Date().toISOString(),
}: DiagnosticsBundleInput) {
  return {
    exportedAt,
    appName: APP_NAME,
    appVersion,
    location,
    userAgent: userAgent ? sanitizeDiagnosticsPayload(userAgent) : undefined,
    counts: {
      debugLogCount: events.length,
      spinReportCount: spinReports.length,
    },
    debugLog: sanitizeDiagnosticsPayload(events),
    spinReports: sanitizeDiagnosticsPayload(spinReports),
  }
}

export function downloadJsonFile(fileName: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
