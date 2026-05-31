import type { HistoryEntry, WheelConfig, WheelHistory, WheelOption } from './types'
import { getWheelFingerprint } from './fingerprint'

const MAX_HISTORY_ENTRIES = 10

export function createHistoryEntry(option: WheelOption, createdAt = new Date()): HistoryEntry {
  return {
    id: `${createdAt.toISOString()}-${option.id}`,
    optionId: option.id,
    title: option.title,
    subtitle: option.subtitle,
    createdAt: createdAt.toISOString(),
  }
}

export function addHistoryEntry(history: WheelHistory, entry: HistoryEntry): WheelHistory {
  return {
    ...history,
    entries: [entry, ...history.entries].slice(0, MAX_HISTORY_ENTRIES),
  }
}

export function createEmptyHistory(config: WheelConfig): WheelHistory {
  return {
    wheelId: config.wheel.id,
    fingerprint: getWheelFingerprint(config),
    entries: [],
  }
}

export function reconcileHistoryForConfig(
  history: WheelHistory | undefined,
  config: WheelConfig,
): WheelHistory {
  const fingerprint = getWheelFingerprint(config)

  if (!history || history.wheelId !== config.wheel.id || history.fingerprint !== fingerprint) {
    return {
      wheelId: config.wheel.id,
      fingerprint,
      entries: [],
    }
  }

  return history
}

export function clearHistory(config: WheelConfig): WheelHistory {
  return createEmptyHistory(config)
}
