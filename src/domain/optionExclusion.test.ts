import { describe, expect, it } from 'vitest'
import { demoWheelConfig } from './demoWheel'
import { getWheelFingerprint } from './fingerprint'
import {
  adjustLandingIndexToEligibleOption,
  adjustLandingPositionToEligibleOption,
  applyAfterResultDecision,
  canSpinWithActiveOptions,
  excludeOptionFromRotation,
  getActiveOptionCount,
  getActiveOptions,
  getAutomaticAfterResultDecision,
  getEffectiveAfterResultBehavior,
  getEffectiveAskDecisionErrors,
  getEffectiveAskAllowedDecisions,
  getExcludedOptionDisplayMode,
  getVisibleOptions,
  isOptionExcluded,
  reconcileExcludedOptionsForConfig,
  restoreAllExcludedOptions,
  restoreOptionToRotation,
  validateAskAllowedDecisions,
} from './optionExclusion'
import type { WheelConfig, WheelSessionState } from './types'

function createSession(excludedOptions: WheelSessionState['excludedOptions'] = []): WheelSessionState {
  return {
    wheelFingerprint: getWheelFingerprint(demoWheelConfig),
    excludedOptions,
  }
}

describe('option exclusion domain logic', () => {
  it('resolves effective after-result behavior from global and option settings', () => {
    expect(getEffectiveAfterResultBehavior('exclude')).toBe('exclude')
    expect(getEffectiveAfterResultBehavior('exclude', 'inherit')).toBe('exclude')
    expect(getEffectiveAfterResultBehavior('exclude', 'keep')).toBe('keep')
    expect(getEffectiveAfterResultBehavior('keep', 'exclude')).toBe('exclude')
    expect(getEffectiveAfterResultBehavior('keep', 'ask')).toBe('ask')
    expect(getEffectiveAfterResultBehavior('exclude', 'ask')).toBe('ask')
  })

  it('inherits or overrides allowed ask decisions', () => {
    const wheelDecisions = ['keep', 'exclude-hide'] as const
    const optionDecisions = ['exclude-hide', 'exclude-show-disabled'] as const

    expect(getEffectiveAskAllowedDecisions([...wheelDecisions])).toEqual([...wheelDecisions])
    expect(getEffectiveAskAllowedDecisions([...wheelDecisions], [...optionDecisions])).toEqual([
      ...optionDecisions,
    ])
  })

  it('validates ask decisions and deduplicates safe values', () => {
    const valid = validateAskAllowedDecisions(['keep', 'exclude-hide', 'keep'])
    const invalidDecision = validateAskAllowedDecisions(['keep', 'delete'])
    const tooFew = validateAskAllowedDecisions(['keep'])

    expect(valid).toEqual({ ok: true, value: ['keep', 'exclude-hide'] })
    expect(invalidDecision.ok).toBe(false)
    expect(tooFew.ok).toBe(false)
  })

  it('reports inherited ask decision errors for option ask overrides', () => {
    const errors = getEffectiveAskDecisionErrors(
      [
        {
          ...demoWheelConfig.wheel.options[0],
          afterResultBehavior: 'ask',
        },
        demoWheelConfig.wheel.options[1],
      ],
      {
        afterResultBehavior: 'keep',
        askAllowedDecisions: ['keep'],
      },
    )

    expect(errors).toEqual([
      {
        optionId: demoWheelConfig.wheel.options[0].id,
        error: 'Для режима вопроса нужны хотя бы два допустимых решения.',
      },
    ])
  })

  it('excludes, restores, and restores all options', () => {
    const excluded = excludeOptionFromRotation(createSession(), 'pizza', 'hide')
    const restored = restoreOptionToRotation(excluded, 'pizza')
    const allRestored = restoreAllExcludedOptions(
      excludeOptionFromRotation(excluded, 'movie', 'show-disabled'),
    )

    expect(isOptionExcluded('pizza', excluded)).toBe(true)
    expect(getExcludedOptionDisplayMode('pizza', excluded)).toBe('hide')
    expect(isOptionExcluded('pizza', restored)).toBe(false)
    expect(allRestored.excludedOptions).toEqual([])
  })

  it('applies after-result decisions to session state', () => {
    const state = createSession()

    expect(applyAfterResultDecision(state, 'pizza', 'keep')).toBe(state)
    expect(getExcludedOptionDisplayMode('pizza', applyAfterResultDecision(state, 'pizza', 'exclude-hide'))).toBe('hide')
    expect(getExcludedOptionDisplayMode('pizza', applyAfterResultDecision(state, 'pizza', 'exclude-show-disabled'))).toBe('show-disabled')
  })

  it('calculates active and visible options from hidden and disabled exclusions', () => {
    const state = createSession([
      { optionId: 'pizza', displayMode: 'hide' },
      { optionId: 'movie', displayMode: 'show-disabled' },
    ])
    const activeOptions = getActiveOptions(demoWheelConfig.wheel.options, state)
    const visibleOptions = getVisibleOptions(demoWheelConfig.wheel.options, state)

    expect(activeOptions.map((option) => option.id)).not.toContain('pizza')
    expect(activeOptions.map((option) => option.id)).not.toContain('movie')
    expect(visibleOptions.map((option) => option.id)).not.toContain('pizza')
    expect(visibleOptions.map((option) => option.id)).toContain('movie')
  })

  it('allows spins only when at least two active options remain', () => {
    const options = demoWheelConfig.wheel.options.slice(0, 3)
    const oneActive = createSession([
      { optionId: options[0].id, displayMode: 'hide' },
      { optionId: options[1].id, displayMode: 'hide' },
    ])
    const twoActive = createSession([{ optionId: options[0].id, displayMode: 'hide' }])

    expect(getActiveOptionCount(options, oneActive)).toBe(1)
    expect(canSpinWithActiveOptions(options, oneActive)).toBe(false)
    expect(canSpinWithActiveOptions(options, twoActive)).toBe(true)
  })

  it('resolves automatic decisions from effective behavior and display mode', () => {
    expect(getAutomaticAfterResultDecision('keep', 'hide')).toBe('keep')
    expect(getAutomaticAfterResultDecision('exclude', 'hide')).toBe('exclude-hide')
    expect(getAutomaticAfterResultDecision('exclude', 'show-disabled')).toBe('exclude-show-disabled')
    expect(getAutomaticAfterResultDecision('ask', 'hide')).toBeUndefined()
  })

  it('keeps landing candidate when it is active', () => {
    const adjusted = adjustLandingIndexToEligibleOption({
      options: demoWheelConfig.wheel.options,
      sessionState: createSession(),
      candidateIndex: 2,
      spinDirection: 1,
    })

    expect(adjusted?.index).toBe(2)
    expect(adjusted?.option.id).toBe(demoWheelConfig.wheel.options[2].id)
  })

  it('adjusts landing by spin direction and wraps around excluded options', () => {
    const options = demoWheelConfig.wheel.options
    const state = createSession([
      { optionId: options[0].id, displayMode: 'show-disabled' },
      { optionId: options[1].id, displayMode: 'show-disabled' },
      { optionId: options[4].id, displayMode: 'show-disabled' },
    ])
    const forward = adjustLandingIndexToEligibleOption({
      options,
      sessionState: state,
      candidateIndex: 0,
      spinDirection: 1,
    })
    const backward = adjustLandingIndexToEligibleOption({
      options,
      sessionState: state,
      candidateIndex: 0,
      spinDirection: -1,
    })

    expect(forward?.index).toBe(2)
    expect(forward?.option.id).toBe(options[2].id)
    expect(backward?.index).toBe(3)
    expect(backward?.option.id).toBe(options[3].id)
  })

  it('never returns an excluded option and handles no eligible target safely', () => {
    const options = demoWheelConfig.wheel.options.slice(0, 2)
    const state = createSession([
      { optionId: options[0].id, displayMode: 'show-disabled' },
      { optionId: options[1].id, displayMode: 'show-disabled' },
    ])

    expect(
      adjustLandingIndexToEligibleOption({
        options,
        sessionState: state,
        candidateIndex: 0,
        spinDirection: 1,
      }),
    ).toBeUndefined()
  })

  it('adjusts snapped landing position to an eligible option in spin direction', () => {
    const options = demoWheelConfig.wheel.options
    const cardStepPx = 100
    const state = createSession([
      { optionId: options[1].id, displayMode: 'show-disabled' },
      { optionId: options[2].id, displayMode: 'show-disabled' },
    ])
    const adjusted = adjustLandingPositionToEligibleOption({
      options,
      sessionState: state,
      candidatePositionPx: 100,
      cardStepPx,
      spinDirection: 1,
    })

    expect(adjusted?.index).toBe(3)
    expect(adjusted?.positionPx).toBe(300)
    expect(adjusted?.option.id).toBe(options[3].id)
    expect(adjusted?.candidateIndex).toBe(1)
    expect(adjusted?.candidateOption.id).toBe(options[1].id)
    expect(adjusted?.candidatePositionPx).toBe(100)
    expect(adjusted?.candidateWasExcluded).toBe(true)
    expect(adjusted?.extensionCards).toBe(2)
    expect(adjusted?.extensionPx).toBe(200)
  })

  it('does not apply an eligibility extension when snapped landing candidate is active', () => {
    const options = demoWheelConfig.wheel.options
    const adjusted = adjustLandingPositionToEligibleOption({
      options,
      sessionState: createSession([{ optionId: options[1].id, displayMode: 'show-disabled' }]),
      candidatePositionPx: 200,
      cardStepPx: 100,
      spinDirection: 1,
    })

    expect(adjusted?.index).toBe(2)
    expect(adjusted?.positionPx).toBe(200)
    expect(adjusted?.candidateWasExcluded).toBe(false)
    expect(adjusted?.extensionCards).toBe(0)
    expect(adjusted?.extensionPx).toBe(0)
  })

  it('keeps hidden excluded options out of the visible landing track', () => {
    const options = demoWheelConfig.wheel.options
    const sessionState = createSession([{ optionId: options[1].id, displayMode: 'hide' }])
    const visibleOptions = getVisibleOptions(options, sessionState)
    const adjusted = adjustLandingPositionToEligibleOption({
      options: visibleOptions,
      sessionState,
      candidatePositionPx: 100,
      cardStepPx: 100,
      spinDirection: 1,
    })

    expect(visibleOptions.some((option) => option.id === options[1].id)).toBe(false)
    expect(adjusted?.candidateWasExcluded).toBe(false)
    expect(adjusted?.option.id).toBe(visibleOptions[1].id)
  })

  it('reconciles excluded session state for config fingerprint and option ids', () => {
    const visualOnlyConfig: WheelConfig = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          cardHeightPx: demoWheelConfig.wheel.settings.cardHeightPx + 8,
        },
      },
    }
    const semanticConfig: WheelConfig = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: demoWheelConfig.wheel.options.slice(1),
      },
    }
    const state = createSession([{ optionId: 'pizza', displayMode: 'hide' }])

    expect(reconcileExcludedOptionsForConfig(state, visualOnlyConfig).excludedOptions).toEqual(state.excludedOptions)
    expect(reconcileExcludedOptionsForConfig(state, semanticConfig).excludedOptions).toEqual([])
  })
})
