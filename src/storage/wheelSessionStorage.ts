import type { WheelSessionState } from '../domain/types'

const SESSION_STORAGE_PREFIX = 'vertical-wheel:session:'

function getSessionStorageKey(wheelFingerprint: string): string {
  return `${SESSION_STORAGE_PREFIX}${wheelFingerprint}`
}

function isWheelSessionState(value: unknown): value is WheelSessionState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const candidate = value as Partial<WheelSessionState>

  return (
    typeof candidate.wheelFingerprint === 'string' &&
    Array.isArray(candidate.excludedOptions) &&
    candidate.excludedOptions.every(
      (option) =>
        option !== null &&
        typeof option === 'object' &&
        typeof option.optionId === 'string' &&
        (option.displayMode === 'hide' || option.displayMode === 'show-disabled'),
    )
  )
}

export function saveWheelSessionState(state: WheelSessionState): void {
  localStorage.setItem(getSessionStorageKey(state.wheelFingerprint), JSON.stringify(state))
}

export function loadWheelSessionState(wheelFingerprint: string): WheelSessionState | undefined {
  const value = localStorage.getItem(getSessionStorageKey(wheelFingerprint))

  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown

    return isWheelSessionState(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function deleteWheelSessionState(wheelFingerprint: string): void {
  localStorage.removeItem(getSessionStorageKey(wheelFingerprint))
}
