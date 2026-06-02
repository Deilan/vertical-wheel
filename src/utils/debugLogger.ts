import type { SpinTelemetryReport } from './spinTelemetry'

export type DebugCategory =
  | 'app'
  | 'share'
  | 'spin'
  | 'history'
  | 'editor'
  | 'json'
  | 'image'
  | 'exclusion'
  | 'after-result'

export type DebugPayload = Record<string, unknown>

export type DebugEvent = {
  id: number
  timestamp: string
  category: DebugCategory
  name: string
  payload?: unknown
}

type DebugStorage = Pick<Storage, 'getItem' | 'setItem'>

const DEBUG_STORAGE_KEY = 'vertical-wheel:debug'
const MAX_EVENTS = 300
const MAX_SPIN_REPORTS = 50
const MAX_STRING_LENGTH = 180
const MAX_ARRAY_ITEMS = 20
const MAX_DEPTH = 4

function truncateString(value: string, maxLength = MAX_STRING_LENGTH): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}… [truncated, length=${value.length}]`
}

function sanitizeImageString(value: string): unknown {
  const mimePrefix = value.slice(0, value.indexOf(';') > 0 ? value.indexOf(';') : 32)

  return {
    kind: 'data',
    approximateLength: value.length,
    mimePrefix: truncateString(mimePrefix, 48),
  }
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value)
    const path = truncateString(`${url.pathname}${url.search}${url.hash}`, 80)

    return `${url.origin}${path}`
  } catch {
    return truncateString(value)
  }
}

export function sanitizeDebugPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) {
      return sanitizeImageString(value)
    }

    if (value.includes('#wheel=')) {
      return truncateString(value, 120)
    }

    if (/^https?:\/\//u.test(value)) {
      return sanitizeUrl(value)
    }

    return truncateString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[array depth limit, length=${value.length}]`
    }

    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeDebugPayload(item, depth + 1))
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    if (
      record.kind === 'data' &&
      typeof record.value === 'string' &&
      record.value.startsWith('data:image/')
    ) {
      return sanitizeImageString(record.value)
    }

    if (record.kind === 'url' && typeof record.value === 'string') {
      return {
        kind: 'url',
        url: sanitizeUrl(record.value),
      }
    }

    if (depth >= MAX_DEPTH) {
      return '[object depth limit]'
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, entryValue]) => [
        key,
        sanitizeDebugPayload(entryValue, depth + 1),
      ]),
    )
  }

  return String(value)
}

export function createDebugLogger(initialEnabled = false) {
  let enabled = initialEnabled
  let nextId = 1
  let events: DebugEvent[] = []
  let spinReports: SpinTelemetryReport[] = []
  const subscribers = new Set<() => void>()

  function notify() {
    for (const subscriber of subscribers) {
      subscriber()
    }
  }

  return {
    configureFromSearch(search: string, storage?: DebugStorage): boolean {
      const params = new URLSearchParams(search)
      const queryValue = params.get('debug')

      if (queryValue === '1' || queryValue === '0') {
        enabled = queryValue === '1'
        storage?.setItem(DEBUG_STORAGE_KEY, enabled ? '1' : '0')
        notify()
        return enabled
      }

      enabled = storage?.getItem(DEBUG_STORAGE_KEY) === '1'
      notify()
      return enabled
    },

    setEnabled(value: boolean, storage?: DebugStorage) {
      enabled = value
      storage?.setItem(DEBUG_STORAGE_KEY, value ? '1' : '0')
      notify()
    },

    isEnabled() {
      return enabled
    },

    log(category: DebugCategory, name: string, payload?: DebugPayload) {
      if (!enabled) {
        return undefined
      }

      const event: DebugEvent = {
        id: nextId,
        timestamp: new Date().toISOString(),
        category,
        name,
        payload: payload === undefined ? undefined : sanitizeDebugPayload(payload),
      }
      nextId += 1
      events = [...events, event].slice(-MAX_EVENTS)
      console.debug('[vertical-wheel]', event)
      notify()

      return event
    },

    getEvents() {
      return events
    },

    addSpinReport(report: SpinTelemetryReport) {
      if (!enabled) {
        return undefined
      }

      spinReports = [...spinReports, report].slice(-MAX_SPIN_REPORTS)
      console.debug('[vertical-wheel] spin report', {
        reportId: report.reportId,
        classification: report.classification,
        dragDistancePx: report.dragDistancePx,
        releaseVelocityPxPerSecRaw: report.releaseVelocityPxPerSecRaw,
        releaseVelocityPxPerSecAfterClamp: report.releaseVelocityPxPerSecAfterClamp,
        selectedResult: report.valid?.selectedResult,
      })
      notify()

      return report
    },

    getSpinReports() {
      return spinReports
    },

    getLastSpinReport() {
      return spinReports.at(-1)
    },

    clearSpinReports() {
      spinReports = []
      notify()
    },

    clear() {
      events = []
      notify()
    },

    subscribe(subscriber: () => void) {
      subscribers.add(subscriber)

      return () => {
        subscribers.delete(subscriber)
      }
    },

    formatEvents() {
      return JSON.stringify(events, null, 2)
    },
  }
}

export const debugLogger = createDebugLogger(false)
