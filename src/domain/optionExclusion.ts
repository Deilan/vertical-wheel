import { getWheelFingerprint } from './fingerprint'
import type {
  AfterResultBehavior,
  AfterResultDecision,
  ExcludedOptionDisplayMode,
  OptionAfterResultBehavior,
  ValidationResult,
  WheelConfig,
  WheelOption,
  WheelSettings,
  WheelSessionState,
} from './types'

export const defaultAfterResultBehavior: AfterResultBehavior = 'keep'
export const defaultExcludedOptionDisplayMode: ExcludedOptionDisplayMode = 'hide'
export const defaultAskAllowedDecisions: AfterResultDecision[] = [
  'keep',
  'exclude-hide',
  'exclude-show-disabled',
]

const afterResultDecisions = new Set<AfterResultDecision>(defaultAskAllowedDecisions)

export function getEffectiveAfterResultBehavior(
  wheelBehavior: AfterResultBehavior,
  optionBehavior: OptionAfterResultBehavior | undefined = 'inherit',
): AfterResultBehavior {
  if (optionBehavior === undefined || optionBehavior === 'inherit') {
    return wheelBehavior
  }

  return optionBehavior
}

export function validateAskAllowedDecisions(
  decisions: unknown,
): ValidationResult<AfterResultDecision[]> {
  if (!Array.isArray(decisions)) {
    return { ok: false, error: 'Допустимые решения должны быть массивом.' }
  }

  const deduped: AfterResultDecision[] = []
  const seen = new Set<AfterResultDecision>()

  for (const decision of decisions) {
    if (decision !== 'keep' && decision !== 'exclude-hide' && decision !== 'exclude-show-disabled') {
      return { ok: false, error: 'Недопустимое решение для режима вопроса.' }
    }

    if (!seen.has(decision)) {
      seen.add(decision)
      deduped.push(decision)
    }
  }

  if (deduped.length < 2) {
    return { ok: false, error: 'Для режима вопроса нужны хотя бы два допустимых решения.' }
  }

  return { ok: true, value: deduped }
}

export function getEffectiveAskAllowedDecisions(
  wheelAllowedDecisions: AfterResultDecision[],
  optionAllowedDecisions?: AfterResultDecision[],
): AfterResultDecision[] {
  return optionAllowedDecisions ?? wheelAllowedDecisions
}

export function getEffectiveAskDecisionErrors(
  options: WheelOption[],
  settings: Pick<WheelSettings, 'afterResultBehavior' | 'askAllowedDecisions'>,
): Array<{ optionId: string; error: string }> {
  return options.flatMap((option) => {
    const behavior = getEffectiveAfterResultBehavior(
      settings.afterResultBehavior,
      option.afterResultBehavior,
    )

    if (behavior !== 'ask') {
      return []
    }

    const decisions = validateAskAllowedDecisions(
      getEffectiveAskAllowedDecisions(settings.askAllowedDecisions, option.askAllowedDecisions),
    )

    return decisions.ok ? [] : [{ optionId: option.id, error: decisions.error }]
  })
}

export function isOptionExcluded(optionId: string, sessionState: WheelSessionState): boolean {
  return sessionState.excludedOptions.some((option) => option.optionId === optionId)
}

export function getExcludedOptionDisplayMode(
  optionId: string,
  sessionState: WheelSessionState,
): ExcludedOptionDisplayMode | undefined {
  return sessionState.excludedOptions.find((option) => option.optionId === optionId)?.displayMode
}

export function getActiveOptions(
  options: WheelOption[],
  sessionState: WheelSessionState,
): WheelOption[] {
  return options.filter((option) => !isOptionExcluded(option.id, sessionState))
}

export function getVisibleOptions(
  options: WheelOption[],
  sessionState: WheelSessionState,
): WheelOption[] {
  return options.filter((option) => getExcludedOptionDisplayMode(option.id, sessionState) !== 'hide')
}

export function excludeOptionFromRotation(
  state: WheelSessionState,
  optionId: string,
  displayMode: ExcludedOptionDisplayMode,
): WheelSessionState {
  return {
    ...state,
    excludedOptions: [
      ...state.excludedOptions.filter((option) => option.optionId !== optionId),
      { optionId, displayMode },
    ],
  }
}

export function restoreOptionToRotation(
  state: WheelSessionState,
  optionId: string,
): WheelSessionState {
  return {
    ...state,
    excludedOptions: state.excludedOptions.filter((option) => option.optionId !== optionId),
  }
}

export function restoreAllExcludedOptions(state: WheelSessionState): WheelSessionState {
  return {
    ...state,
    excludedOptions: [],
  }
}

export function reconcileExcludedOptionsForConfig(
  state: WheelSessionState,
  config: WheelConfig,
): WheelSessionState {
  const wheelFingerprint = getWheelFingerprint(config)

  if (state.wheelFingerprint !== wheelFingerprint) {
    return { wheelFingerprint, excludedOptions: [] }
  }

  const optionIds = new Set(config.wheel.options.map((option) => option.id))

  return {
    wheelFingerprint,
    excludedOptions: state.excludedOptions.filter((option) => optionIds.has(option.optionId)),
  }
}

export function getActiveOptionCount(
  options: WheelOption[],
  sessionState: WheelSessionState,
): number {
  return getActiveOptions(options, sessionState).length
}

export function canSpinWithActiveOptions(
  options: WheelOption[],
  sessionState: WheelSessionState,
): boolean {
  return getActiveOptionCount(options, sessionState) >= 2
}

export function applyAfterResultDecision(
  state: WheelSessionState,
  optionId: string,
  decision: AfterResultDecision,
): WheelSessionState {
  if (!afterResultDecisions.has(decision)) {
    return state
  }

  if (decision === 'keep') {
    return state
  }

  return excludeOptionFromRotation(
    state,
    optionId,
    decision === 'exclude-hide' ? 'hide' : 'show-disabled',
  )
}

export function getAutomaticAfterResultDecision(
  effectiveBehavior: AfterResultBehavior,
  defaultDisplayMode: ExcludedOptionDisplayMode,
): AfterResultDecision | undefined {
  if (effectiveBehavior === 'keep') {
    return 'keep'
  }

  if (effectiveBehavior === 'ask') {
    return undefined
  }

  return defaultDisplayMode === 'hide' ? 'exclude-hide' : 'exclude-show-disabled'
}

export function adjustLandingIndexToEligibleOption({
  options,
  sessionState,
  candidateIndex,
  spinDirection,
}: {
  options: WheelOption[]
  sessionState: WheelSessionState
  candidateIndex: number
  spinDirection: number
}): { index: number; option: WheelOption } | undefined {
  if (options.length === 0 || !canSpinWithActiveOptions(options, sessionState)) {
    return undefined
  }

  const direction = spinDirection >= 0 ? 1 : -1
  const normalizedCandidateIndex = ((candidateIndex % options.length) + options.length) % options.length

  for (let offset = 0; offset < options.length; offset += 1) {
    const index =
      (normalizedCandidateIndex + direction * offset + options.length * options.length) %
      options.length
    const option = options[index]

    if (!isOptionExcluded(option.id, sessionState)) {
      return { index, option }
    }
  }

  return undefined
}

export function adjustLandingPositionToEligibleOption({
  options,
  sessionState,
  candidatePositionPx,
  cardStepPx,
  spinDirection,
}: {
  options: WheelOption[]
  sessionState: WheelSessionState
  candidatePositionPx: number
  cardStepPx: number
  spinDirection: number
}): { positionPx: number; index: number; option: WheelOption } | undefined {
  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  if (options.length === 0 || !canSpinWithActiveOptions(options, sessionState)) {
    return undefined
  }

  const direction = spinDirection >= 0 ? 1 : -1
  const candidateVirtualIndex = Math.round(candidatePositionPx / cardStepPx)

  for (let offset = 0; offset < options.length; offset += 1) {
    const virtualIndex = candidateVirtualIndex + direction * offset
    const index = ((virtualIndex % options.length) + options.length) % options.length
    const option = options[index]

    if (!isOptionExcluded(option.id, sessionState)) {
      return {
        positionPx: virtualIndex * cardStepPx,
        index,
        option,
      }
    }
  }

  return undefined
}
