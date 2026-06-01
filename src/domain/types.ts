export type WheelConfigVersion = 1

export type WheelTheme = 'dark' | 'light'

export type AfterResultBehavior = 'keep' | 'exclude' | 'ask'

export type OptionAfterResultBehavior = 'inherit' | 'keep' | 'exclude' | 'ask'

export type ExcludedOptionDisplayMode = 'hide' | 'show-disabled'

export type AfterResultDecision = 'keep' | 'exclude-hide' | 'exclude-show-disabled'

export type WheelImage = {
  kind: 'url' | 'data'
  value: string
}

export type WheelSettings = {
  theme: WheelTheme
  appBackgroundColor: string
  pointerColor: string
  cardHeightPx: number
  cardGapPx: number
  imageSizePx: number
  titleFontSizePx: number
  subtitleFontSizePx: number
  cardBorderRadiusPx: number
  afterResultBehavior: AfterResultBehavior
  excludedOptionDisplayMode: ExcludedOptionDisplayMode
  askAllowedDecisions: AfterResultDecision[]
}

export type WheelOption = {
  id: string
  title: string
  subtitle?: string
  emoji?: string
  image?: WheelImage
  backgroundColor: string
  textColor: string
  afterResultBehavior?: OptionAfterResultBehavior
  askAllowedDecisions?: AfterResultDecision[]
}

export type WheelConfig = {
  version: WheelConfigVersion
  wheel: {
    id: string
    title?: string
    description?: string
    settings: WheelSettings
    options: WheelOption[]
  }
}

export type HistoryEntry = {
  id: string
  optionId: string
  title: string
  subtitle?: string
  createdAt: string
}

export type WheelHistory = {
  wheelId: string
  fingerprint: string
  entries: HistoryEntry[]
}

export type ExcludedOptionState = {
  optionId: string
  displayMode: ExcludedOptionDisplayMode
}

export type WheelSessionState = {
  wheelFingerprint: string
  excludedOptions: ExcludedOptionState[]
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export const WHEEL_LIMITS = {
  minOptions: 2,
  maxOptions: 30,
  titleMaxLength: 60,
  subtitleMaxLength: 120,
  maxEncodedConfigLength: 6000,
} as const

export const WHEEL_SETTING_LIMITS = {
  cardHeightPx: { min: 88, max: 220 },
  cardGapPx: { min: 8, max: 32 },
  imageSizePx: { min: 40, max: 120 },
  titleFontSizePx: { min: 16, max: 36 },
  subtitleFontSizePx: { min: 12, max: 24 },
  cardBorderRadiusPx: { min: 8, max: 32 },
} as const
