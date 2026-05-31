import type { WheelHistory } from '../domain/types'

const HISTORY_STORAGE_PREFIX = 'vertical-wheel:history:'

function getHistoryStorageKey(wheelId: string): string {
  return `${HISTORY_STORAGE_PREFIX}${wheelId}`
}

export function saveWheelHistory(history: WheelHistory): void {
  localStorage.setItem(getHistoryStorageKey(history.wheelId), JSON.stringify(history))
}

export function loadWheelHistory(wheelId: string): WheelHistory | undefined {
  const value = localStorage.getItem(getHistoryStorageKey(wheelId))

  if (!value) {
    return undefined
  }

  try {
    return JSON.parse(value) as WheelHistory
  } catch {
    return undefined
  }
}

export function deleteWheelHistory(wheelId: string): void {
  localStorage.removeItem(getHistoryStorageKey(wheelId))
}
