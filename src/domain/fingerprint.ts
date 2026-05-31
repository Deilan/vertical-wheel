import type { WheelConfig } from './types'

function stableStringify(value: unknown): string {
  return JSON.stringify(value)
}

export function getWheelFingerprint(config: WheelConfig): string {
  const semanticOptions = config.wheel.options.map((option) => ({
    id: option.id,
    title: option.title,
    subtitle: option.subtitle ?? '',
  }))

  return stableStringify({
    version: config.version,
    options: semanticOptions,
  })
}
