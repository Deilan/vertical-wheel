import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import {
  getCyclicWheelRepeatCycles,
  getPointerAlignedRepeatedIndex,
  normalizeCyclicWheelPosition,
} from './domain/cyclicWheel'
import { demoWheelConfig } from './domain/demoWheel'
import {
  addHistoryEntry,
  clearHistory,
  createHistoryEntry,
  reconcileHistoryForConfig,
} from './domain/history'
import {
  applyAfterResultDecision,
  getActiveOptionCount,
  getAutomaticAfterResultDecision,
  getEffectiveAfterResultBehavior,
  getEffectiveAskDecisionErrors,
  getEffectiveAskAllowedDecisions,
  getExcludedOptionDisplayMode,
  getVisibleOptions,
  restoreAllExcludedOptions,
  restoreOptionToRotation,
  resolveTerminalEligibleTarget,
  validateAskAllowedDecisions,
} from './domain/optionExclusion'
import {
  calculateTerminalContinuationDurationMs,
  calculateTerminalSettleDurationMs,
  calculateSpinOutcome,
  defaultSpinPhysicsConfig,
  snapPositionToCard,
} from './domain/spinPhysics'
import { createShareHash, readShareConfigFromHash } from './domain/shareConfig'
import type {
  AfterResultDecision,
  ExcludedOptionDisplayMode,
  OptionAfterResultBehavior,
  WheelConfig,
  WheelHistory,
  WheelOption,
  WheelSessionState,
  WheelSettings,
} from './domain/types'
import { WHEEL_LIMITS, WHEEL_SETTING_LIMITS } from './domain/types'
import { parseWheelConfigJson } from './domain/validation'
import { getWheelFingerprint } from './domain/fingerprint'
import { getWinningOption, getWinningOptionIndex } from './domain/winningOption'
import {
  loadWheelHistory,
  saveWheelHistory,
} from './storage/historyStorage'
import {
  loadWheelSessionState,
  saveWheelSessionState,
} from './storage/wheelSessionStorage'
import { loadWheelConfig, saveWheelConfig } from './storage/wheelStorage'
import { debugLogger } from './utils/debugLogger'
import { compressImageFile, isSupportedImageFile } from './utils/imageCompression'
import {
  appendBoundedFrameSample,
  appendBoundedPointerSample,
  createSpinTelemetryReport,
} from './utils/spinTelemetry'
import {
  createDebugLogExport,
  createDiagnosticsBundle,
  createDownloadFileName,
  createLocationSummary,
  createSpinReportsExport,
  downloadJsonFile,
} from './utils/diagnosticsExport'
import type {
  SpinTelemetryFrameSample,
  SpinTelemetryOptionSummary,
  SpinTelemetryPointerSample,
  SpinTelemetryReport,
  SpinTelemetryVisibleOptionSummary,
} from './utils/spinTelemetry'
import styles from './App.module.css'

type AppMode = 'spin' | 'edit'
type NumberSettingKey = keyof typeof WHEEL_SETTING_LIMITS
type AppMessage = { kind: 'success' | 'info' | 'error'; text: string }
type PendingAfterResultDecision = {
  option: WheelOption
  allowedDecisions: AfterResultDecision[]
}
type GestureState = {
  pointerId: number
  startY: number
  startPositionPx: number
  startTimeMs: number
  previousY: number
  previousTimeMs: number
  lastY: number
  lastTimeMs: number
  pointerSamples: SpinTelemetryPointerSample[]
}

const historyDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const numberSettingControls: Array<{
  key: NumberSettingKey
  label: string
  unit: string
}> = [
  { key: 'cardHeightPx', label: 'Высота карточки', unit: 'px' },
  { key: 'cardGapPx', label: 'Отступ между карточками', unit: 'px' },
  { key: 'imageSizePx', label: 'Размер emoji', unit: 'px' },
  { key: 'titleFontSizePx', label: 'Размер названия', unit: 'px' },
  { key: 'subtitleFontSizePx', label: 'Размер подзаголовка', unit: 'px' },
  { key: 'cardBorderRadiusPx', label: 'Скругление карточки', unit: 'px' },
]
const snapTransitionEasing = 'cubic-bezier(0.12, 0.72, 0.12, 1)'
const coastTransitionEasing = 'linear'
const spinTransitionEasing = 'cubic-bezier(0.25, 0.5, 0.35, 1)'
const afterResultBehaviorOptions: Array<{
  value: WheelSettings['afterResultBehavior']
  label: string
}> = [
  { value: 'keep', label: 'Оставлять в вращении' },
  { value: 'exclude', label: 'Исключать из вращения' },
  { value: 'ask', label: 'Спрашивать каждый раз' },
]
const optionAfterResultBehaviorOptions: Array<{
  value: NonNullable<OptionAfterResultBehavior>
  label: string
}> = [
  { value: 'inherit', label: 'Как у барабана' },
  { value: 'keep', label: 'Всегда оставлять' },
  { value: 'exclude', label: 'Исключать' },
  { value: 'ask', label: 'Спрашивать' },
]
const excludedDisplayModeOptions: Array<{
  value: ExcludedOptionDisplayMode
  label: string
}> = [
  { value: 'hide', label: 'Скрывать из барабана' },
  { value: 'show-disabled', label: 'Показывать недоступными' },
]
const afterResultDecisionOptions: Array<{
  value: AfterResultDecision
  label: string
}> = [
  { value: 'keep', label: 'Оставить' },
  { value: 'exclude-hide', label: 'Исключить и скрыть' },
  { value: 'exclude-show-disabled', label: 'Исключить, но показывать недоступной' },
]

function createWheelSessionState(config: WheelConfig): WheelSessionState {
  return {
    wheelFingerprint: getWheelFingerprint(config),
    excludedOptions: [],
  }
}

function cloneWheelConfig(config: WheelConfig): WheelConfig {
  return {
    version: 1,
    wheel: {
      ...config.wheel,
      settings: { ...config.wheel.settings },
      options: config.wheel.options.map((option) => ({
        ...option,
        image: option.image ? { ...option.image } : undefined,
      })),
    },
  }
}

function getInitialWheelConfig(): WheelConfig {
  return cloneWheelConfig(demoWheelConfig)
}

function getRandomJitterCards(): number {
  return (Math.random() * 2 - 1) * defaultSpinPhysicsConfig.randomJitterCards
}

function formatHistoryDate(value: string): string {
  return historyDateFormatter.format(new Date(value))
}

function getOptionMedia(option: WheelOption): string {
  if (option.image) {
    return ''
  }

  return option.emoji || '•'
}

function getShareUrl(config: WheelConfig): { ok: true; value: string } | { ok: false; error: string } {
  const hash = createShareHash(config)

  if (!hash.ok) {
    return hash
  }

  return {
    ok: true,
    value: `${window.location.origin}${window.location.pathname}${window.location.search}${hash.value}`,
  }
}

function downloadJson(config: WheelConfig) {
  const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'vertical-wheel-config.json'
  link.click()
  URL.revokeObjectURL(url)
}

function readFileAsText(file: File): Promise<string> {
  return file.text()
}

function getWheelSummary(config: WheelConfig) {
  return {
    wheelId: config.wheel.id,
    title: config.wheel.title,
    optionCount: config.wheel.options.length,
    theme: config.wheel.settings.theme,
  }
}

function getOptionSummary(option: WheelOption) {
  return {
    optionId: option.id,
    title: option.title,
    hasSubtitle: Boolean(option.subtitle),
    hasEmoji: Boolean(option.emoji),
    hasImage: Boolean(option.image),
    image: option.image,
  }
}

function getTelemetryOptionSummary(
  option: WheelOption | undefined,
  index?: number,
  metadata?: {
    originalIndex?: number
    visibleIndex?: number
    active?: boolean
    excluded?: boolean
    excludedDisplayMode?: ExcludedOptionDisplayMode
    positionPx?: number
  },
): SpinTelemetryOptionSummary | undefined {
  if (!option) {
    return undefined
  }

  return {
    id: option.id,
    title: option.title,
    index,
    ...metadata,
  }
}

function getVisibleOptionTelemetry({
  allOptions,
  visibleOptions,
  sessionState,
}: {
  allOptions: WheelOption[]
  visibleOptions: WheelOption[]
  sessionState: WheelSessionState
}): SpinTelemetryVisibleOptionSummary[] {
  const originalIndexById = new Map(allOptions.map((option, index) => [option.id, index]))

  return visibleOptions.map((option, visibleIndex) => {
    const excludedDisplayMode = getExcludedOptionDisplayMode(option.id, sessionState)

    return {
      id: option.id,
      title: option.title,
      originalIndex: originalIndexById.get(option.id) ?? -1,
      visibleIndex,
      active: excludedDisplayMode === undefined,
      excluded: excludedDisplayMode !== undefined,
      excludedDisplayMode,
    }
  })
}

function getHistorySummary(history: WheelHistory) {
  return {
    wheelId: history.wheelId,
    entries: history.entries.length,
    fingerprint: history.fingerprint,
  }
}

function getCardStepPx(settings: WheelSettings): number {
  return settings.cardHeightPx + settings.cardGapPx
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function createOptionId(): string {
  return `option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function validateEditableConfig(config: WheelConfig): string[] {
  const messages: string[] = []
  const { options, settings } = config.wheel

  if (settings.afterResultBehavior === 'ask') {
    const decisions = validateAskAllowedDecisions(settings.askAllowedDecisions)

    if (!decisions.ok) {
      messages.push(decisions.error)
    }
  }

  if (options.length < WHEEL_LIMITS.minOptions) {
    messages.push(`Нужно минимум ${WHEEL_LIMITS.minOptions} опции.`)
  }

  if (options.length > WHEEL_LIMITS.maxOptions) {
    messages.push(`Можно добавить не больше ${WHEEL_LIMITS.maxOptions} опций.`)
  }

  for (const [index, option] of options.entries()) {
    const titleLength = Array.from(option.title).length

    if (option.title.trim().length === 0) {
      messages.push(`Опция ${index + 1}: название обязательно.`)
    } else if (titleLength > WHEEL_LIMITS.titleMaxLength) {
      messages.push(
        `Опция ${index + 1}: название должно быть до ${WHEEL_LIMITS.titleMaxLength} символов.`,
      )
    }

    if (
      option.subtitle &&
      Array.from(option.subtitle).length > WHEEL_LIMITS.subtitleMaxLength
    ) {
      messages.push(
        `Опция ${index + 1}: подзаголовок должен быть до ${WHEEL_LIMITS.subtitleMaxLength} символов.`,
      )
    }

    const effectiveAskError = getEffectiveAskDecisionErrors([option], settings)[0]

    if (effectiveAskError) {
      messages.push(`Опция ${index + 1}: ${effectiveAskError.error}`)
    }
  }

  return messages
}

function createEmptyOption(): WheelOption {
  return {
    id: createOptionId(),
    title: 'Новая опция',
    subtitle: '',
    emoji: '✨',
    backgroundColor: '#f8fafc',
    textColor: '#111827',
  }
}

function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(value)
  }

  return Promise.reject(new Error('Clipboard API is unavailable.'))
}

function WheelCard({
  option,
  settings,
  isActive,
  isDisabled,
}: {
  option: WheelOption
  settings: WheelSettings
  isActive: boolean
  isDisabled: boolean
}) {
  const image = option.image

  return (
    <div
      className={styles.card}
      data-active={isActive}
      data-disabled={isDisabled}
      style={
        {
          '--card-bg': option.backgroundColor,
          '--card-text': option.textColor,
          '--card-height': `${settings.cardHeightPx}px`,
          '--card-gap': `${settings.cardGapPx}px`,
          '--card-radius': `${settings.cardBorderRadiusPx}px`,
          '--image-size': `${settings.imageSizePx}px`,
          '--title-size': `${settings.titleFontSizePx}px`,
          '--subtitle-size': `${settings.subtitleFontSizePx}px`,
        } as CSSProperties
      }
    >
      {image ? (
        <img className={styles.mediaImage} src={image.value} alt="" />
      ) : (
        <span className={styles.media} aria-hidden="true">
          {getOptionMedia(option)}
        </span>
      )}
      <span className={styles.cardText}>
        <strong>{option.title.trim() || 'Без названия'}</strong>
        {option.subtitle ? <small>{option.subtitle}</small> : null}
      </span>
    </div>
  )
}

function WheelView({
  config,
  positionPx,
  transitionMs,
  transitionEasing = snapTransitionEasing,
  isInteractive,
  showActiveHighlight = true,
  disabledOptionIds = [],
  viewportRef,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: {
  config: WheelConfig
  positionPx: number
  transitionMs: number
  transitionEasing?: string
  isInteractive: boolean
  showActiveHighlight?: boolean
  disabledOptionIds?: string[]
  viewportRef?: React.RefObject<HTMLDivElement | null>
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerEnd?: (event: PointerEvent<HTMLDivElement>) => void
}) {
  const [wheelHeightPx, setWheelHeightPx] = useState(360)
  const { settings, options } = config.wheel
  const hasOptions = options.length > 0
  const disabledOptionIdSet = useMemo(() => new Set(disabledOptionIds), [disabledOptionIds])
  const cardStepPx = getCardStepPx(settings)
  const repeatCycles = hasOptions
    ? getCyclicWheelRepeatCycles(
        options.length,
        defaultSpinPhysicsConfig.maxVirtualCardsToTravel,
      )
    : 0
  const centerCycle = Math.floor(repeatCycles / 2)
  const baseOptionIndex = centerCycle * options.length
  const activeRepeatedIndex =
    showActiveHighlight && hasOptions
      ? getPointerAlignedRepeatedIndex(
          positionPx,
          cardStepPx,
          options.length,
          baseOptionIndex,
        )
      : undefined
  const trackTranslatePx =
    hasOptions
      ? wheelHeightPx / 2 -
        (baseOptionIndex * cardStepPx + settings.cardHeightPx / 2) -
        positionPx
      : 0
  const repeatedOptions = useMemo(
    () =>
      Array.from({ length: repeatCycles }, (_, cycleIndex) =>
        options.map((option, optionIndex) => ({
          option,
          key: `${cycleIndex}-${option.id}`,
          repeatedIndex: cycleIndex * options.length + optionIndex,
        })),
      ).flat(),
    [options, repeatCycles],
  )

  useEffect(() => {
    const element = viewportRef?.current

    if (!element) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      setWheelHeightPx(entry.contentRect.height)
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [viewportRef])

  return (
    <div className={styles.wheelShell}>
      <div
        className={styles.pointer}
        style={{ '--pointer-color': settings.pointerColor } as CSSProperties}
        aria-hidden="true"
      />
      <div
        ref={viewportRef}
        className={styles.wheelViewport}
        data-interactive={isInteractive}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        aria-label={
          isInteractive
            ? 'Барабан выбора. Проведите вверх или вниз, чтобы запустить вращение.'
            : 'Превью барабана'
        }
      >
        {hasOptions ? (
          <div
            className={styles.wheelTrack}
            style={
              {
                '--track-y': `${trackTranslatePx}px`,
                '--transition-ms': `${transitionMs}ms`,
                '--transition-easing': transitionEasing,
              } as CSSProperties
            }
          >
            {repeatedOptions.map(({ option, key, repeatedIndex }) => (
              <WheelCard
                isActive={repeatedIndex === activeRepeatedIndex && !disabledOptionIdSet.has(option.id)}
                isDisabled={disabledOptionIdSet.has(option.id)}
                key={key}
                option={option}
                settings={settings}
              />
            ))}
          </div>
        ) : (
          <div className={styles.emptyWheel}>Нет видимых опций.</div>
        )}
      </div>
    </div>
  )
}

function SpinScreen({
  config,
  history,
  sessionState,
  pendingDecision,
  validationMessages,
  onHistoryChange,
  onSessionChange,
  onPendingDecisionChange,
  onEdit,
}: {
  config: WheelConfig
  history: WheelHistory
  sessionState: WheelSessionState
  pendingDecision?: PendingAfterResultDecision
  validationMessages: string[]
  onHistoryChange: (history: WheelHistory) => void
  onSessionChange: (sessionState: WheelSessionState) => void
  onPendingDecisionChange: (decision: PendingAfterResultDecision | undefined) => void
  onEdit: () => void
}) {
  const [positionPx, setPositionPx] = useState(0)
  const [transitionMs, setTransitionMs] = useState(0)
  const [transitionEasing, setTransitionEasing] = useState(snapTransitionEasing)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<GestureState | null>(null)
  const animationTimerRef = useRef<number | undefined>(undefined)
  const frameSamplerRef = useRef<number | undefined>(undefined)
  const pendingFinalPositionRef = useRef<number | undefined>(undefined)
  const pendingResultRef = useRef<WheelOption | undefined>(undefined)
  const activeSpinReportRef = useRef<SpinTelemetryReport | undefined>(undefined)
  const isAnimatingRef = useRef(false)
  const positionRef = useRef(0)
  const [resultStatus, setResultStatus] = useState<string | undefined>()
  const lastResult = history.entries[0]
  const cardStepPx = getCardStepPx(config.wheel.settings)
  const visibleOptions = useMemo(
    () => getVisibleOptions(config.wheel.options, sessionState),
    [config.wheel.options, sessionState],
  )
  const visibleConfig = useMemo(
    () => ({
      ...config,
      wheel: {
        ...config.wheel,
        options: visibleOptions,
      },
    }),
    [config, visibleOptions],
  )
  const disabledOptionIds = useMemo(
    () =>
      sessionState.excludedOptions
        .filter((option) => option.displayMode === 'show-disabled')
        .map((option) => option.optionId),
    [sessionState.excludedOptions],
  )
  const activeOptionCount = getActiveOptionCount(config.wheel.options, sessionState)
  const excludedOptionCount = sessionState.excludedOptions.length
  const isValid = validationMessages.length === 0
  const isSpinLockedByActiveCount = activeOptionCount < 2
  const canDragWheel = isValid && !pendingDecision && visibleOptions.length > 0
  const activeCountLockMessage =
    isSpinLockedByActiveCount
      ? activeOptionCount === 1
        ? 'Нельзя крутить: осталась одна активная опция.'
        : 'Нельзя крутить: нет активных опций.'
      : undefined

  useEffect(() => {
    positionRef.current = positionPx
  }, [positionPx])

  useEffect(() => {
    isAnimatingRef.current = isAnimating
  }, [isAnimating])

  useEffect(() => {
    return () => {
      if (animationTimerRef.current !== undefined) {
        window.clearTimeout(animationTimerRef.current)
      }
      if (frameSamplerRef.current !== undefined) {
        window.cancelAnimationFrame(frameSamplerRef.current)
      }
    }
  }, [])

  function appendFrameSample(sample: SpinTelemetryFrameSample) {
    const report = activeSpinReportRef.current

    if (!report) {
      return
    }

    report.frameSamples = appendBoundedFrameSample(report.frameSamples, sample)
  }

  function startFrameSampling({
    fromPositionPx,
    toPositionPx,
    durationMs,
    phase,
  }: {
    fromPositionPx: number
    toPositionPx: number
    durationMs: number
    phase: SpinTelemetryFrameSample['phase']
  }) {
    if (!activeSpinReportRef.current || durationMs <= 0) {
      return
    }

    if (frameSamplerRef.current !== undefined) {
      window.cancelAnimationFrame(frameSamplerRef.current)
    }

    const startTimeMs = performance.now()
    const approximateVelocityPxPerSec = ((toPositionPx - fromPositionPx) / durationMs) * 1000

    function sampleFrame(nowMs: number) {
      const elapsedMs = Math.min(nowMs - startTimeMs, durationMs)
      const progress = elapsedMs / durationMs
      const positionPx = fromPositionPx + (toPositionPx - fromPositionPx) * progress

      appendFrameSample({
        elapsedMs: Math.round(elapsedMs),
        positionPx,
        approximateVelocityPxPerSec,
        phase,
      })

      if (elapsedMs < durationMs) {
        frameSamplerRef.current = window.requestAnimationFrame(sampleFrame)
      }
    }

    frameSamplerRef.current = window.requestAnimationFrame(sampleFrame)
  }

  function finishAnimation() {
    const result = pendingResultRef.current
    const finalPositionPx = pendingFinalPositionRef.current ?? positionRef.current
    const normalizedPositionPx = normalizeCyclicWheelPosition(
      finalPositionPx,
      cardStepPx,
      Math.max(visibleOptions.length, 1),
    )
    pendingResultRef.current = undefined
    pendingFinalPositionRef.current = undefined
    animationTimerRef.current = undefined
    setIsAnimating(false)
    setTransitionMs(0)
    setTransitionEasing(snapTransitionEasing)
    setPositionPx(normalizedPositionPx)
    if (frameSamplerRef.current !== undefined) {
      window.cancelAnimationFrame(frameSamplerRef.current)
      frameSamplerRef.current = undefined
    }
    if (activeSpinReportRef.current) {
      activeSpinReportRef.current.frameSamples = appendBoundedFrameSample(
        activeSpinReportRef.current.frameSamples,
        {
          elapsedMs:
            activeSpinReportRef.current.valid?.totalSpinDurationMs ??
            activeSpinReportRef.current.weak?.snapDistancePx ??
            0,
          positionPx: finalPositionPx,
          approximateVelocityPxPerSec: 0,
          phase: 'complete',
        },
      )
      debugLogger.addSpinReport(activeSpinReportRef.current)
      activeSpinReportRef.current = undefined
    }
    debugLogger.log('spin', 'animation_end', {
      finalPositionPx,
      normalizedPositionPx,
      hasResult: Boolean(result),
    })

    if (!result) {
      return
    }

    const nextHistory = addHistoryEntry(history, createHistoryEntry(result))
    debugLogger.log('history', 'add', {
      result: getOptionSummary(result),
      history: getHistorySummary(nextHistory),
    })
    onHistoryChange(nextHistory)

    const effectiveBehavior = getEffectiveAfterResultBehavior(
      config.wheel.settings.afterResultBehavior,
      result.afterResultBehavior,
    )
    const automaticDecision = getAutomaticAfterResultDecision(
      effectiveBehavior,
      config.wheel.settings.excludedOptionDisplayMode,
    )

    if (automaticDecision === undefined) {
      const allowedDecisions = getEffectiveAskAllowedDecisions(
        config.wheel.settings.askAllowedDecisions,
        result.askAllowedDecisions,
      )
      onPendingDecisionChange({ option: result, allowedDecisions })
      setResultStatus(undefined)
      debugLogger.log('after-result', 'ask-shown', {
        option: getOptionSummary(result),
        allowedDecisions,
      })
      return
    }

    applyResultDecision(result, automaticDecision)
  }

  function updateSessionState(nextSessionState: WheelSessionState, eventName: string) {
    debugLogger.log('exclusion', eventName, {
      activeCount: getActiveOptionCount(config.wheel.options, nextSessionState),
      excludedCount: nextSessionState.excludedOptions.length,
    })
    debugLogger.log('exclusion', 'active-count-changed', {
      activeCount: getActiveOptionCount(config.wheel.options, nextSessionState),
      totalCount: config.wheel.options.length,
    })
    onSessionChange(nextSessionState)
  }

  function applyResultDecision(option: WheelOption, decision: AfterResultDecision) {
    debugLogger.log('after-result', `decision-${decision}`, {
      option: getOptionSummary(option),
    })
    onPendingDecisionChange(undefined)

    if (decision === 'keep') {
      setResultStatus('Опция остаётся в следующих вращениях.')
      return
    }

    const nextSessionState = applyAfterResultDecision(sessionState, option.id, decision)
    updateSessionState(nextSessionState, 'option-excluded')
    setResultStatus('Опция исключена из следующих вращений.')
  }

  function restoreResultOption(optionId: string) {
    const nextSessionState = restoreOptionToRotation(sessionState, optionId)
    updateSessionState(nextSessionState, 'option-restored')
    setResultStatus('Опция возвращена в вращение.')
  }

  function restoreAllOptions() {
    const nextSessionState = restoreAllExcludedOptions(sessionState)
    updateSessionState(nextSessionState, 'all-restored')
    setResultStatus('Все исключённые опции возвращены в вращение.')
  }

  function animateTo(finalPositionPx: number, durationMs: number, result?: WheelOption) {
    if (animationTimerRef.current !== undefined) {
      window.clearTimeout(animationTimerRef.current)
    }

    pendingResultRef.current = result
    pendingFinalPositionRef.current = finalPositionPx
    setIsAnimating(true)
    setTransitionMs(durationMs)
    setTransitionEasing(result ? spinTransitionEasing : snapTransitionEasing)
    setPositionPx(finalPositionPx)
    debugLogger.log('spin', 'animation_start', {
      finalPositionPx,
      durationMs,
      hasResult: Boolean(result),
    })
    animationTimerRef.current = window.setTimeout(finishAnimation, durationMs + 40)
  }

  function animateSpinTo({
    coastPositionPx,
    inertialPositionPx,
    finalPositionPx,
    coastDurationMs,
    decelerationDurationMs,
    inertialDurationMs,
    snapDurationMs,
    result,
  }: {
    coastPositionPx: number
    inertialPositionPx: number
    finalPositionPx: number
    coastDurationMs: number
    decelerationDurationMs: number
    inertialDurationMs: number
    snapDurationMs: number
    result: WheelOption
  }) {
    if (animationTimerRef.current !== undefined) {
      window.clearTimeout(animationTimerRef.current)
    }

    pendingResultRef.current = result
    pendingFinalPositionRef.current = finalPositionPx
    setIsAnimating(true)
    setTransitionMs(coastDurationMs)
    setTransitionEasing(coastTransitionEasing)
    setPositionPx(coastPositionPx)
    startFrameSampling({
      fromPositionPx: positionRef.current,
      toPositionPx: coastPositionPx,
      durationMs: coastDurationMs,
      phase: 'coast',
    })
    debugLogger.log('spin', 'animation_start', {
      coastPositionPx,
      inertialPositionPx,
      finalPositionPx,
      coastDurationMs,
      decelerationDurationMs,
      inertialDurationMs,
      snapDurationMs,
      hasResult: true,
    })
    animationTimerRef.current = window.setTimeout(() => {
      setTransitionMs(decelerationDurationMs)
      setTransitionEasing(spinTransitionEasing)
      setPositionPx(inertialPositionPx)
      startFrameSampling({
        fromPositionPx: coastPositionPx,
        toPositionPx: inertialPositionPx,
        durationMs: decelerationDurationMs,
        phase: 'deceleration',
      })
      debugLogger.log('spin', 'deceleration_start', {
        coastPositionPx,
        inertialPositionPx,
        decelerationDurationMs,
        result: getOptionSummary(result),
      })
      animationTimerRef.current = window.setTimeout(() => {
        setTransitionMs(snapDurationMs)
        setTransitionEasing(snapTransitionEasing)
        setPositionPx(finalPositionPx)
        startFrameSampling({
          fromPositionPx: inertialPositionPx,
          toPositionPx: finalPositionPx,
          durationMs: snapDurationMs,
          phase: 'final-snap',
        })
        debugLogger.log('spin', 'final_snap_start', {
          inertialPositionPx,
          finalPositionPx,
          snapDistancePx: finalPositionPx - inertialPositionPx,
          snapDurationMs,
          result: getOptionSummary(result),
        })
        animationTimerRef.current = window.setTimeout(finishAnimation, snapDurationMs + 40)
      }, decelerationDurationMs + 40)
    }, coastDurationMs + 40)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (pendingDecision) {
      setResultStatus('Выберите, что сделать с выпавшей опцией, перед следующим вращением.')
      return
    }

    if (isAnimatingRef.current || !isValid || visibleOptions.length === 0) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const timeMs = performance.now()
    const startPositionPx = normalizeCyclicWheelPosition(
      positionRef.current,
      cardStepPx,
      visibleOptions.length,
    )
    setPositionPx(startPositionPx)
    debugLogger.log('spin', 'pointer_down', {
      pointerType: event.pointerType,
      startY: event.clientY,
      positionPx: startPositionPx,
    })
    setIsDragging(true)
    setResultStatus(undefined)
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPositionPx,
      startTimeMs: timeMs,
      previousY: event.clientY,
      previousTimeMs: timeMs,
      lastY: event.clientY,
      lastTimeMs: timeMs,
      pointerSamples: [
        {
          timestampMs: timeMs,
          y: event.clientY,
          positionPx: startPositionPx,
        },
      ],
    }
    setTransitionMs(0)
    setTransitionEasing(snapTransitionEasing)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current

    if (!gesture || gesture.pointerId !== event.pointerId || isAnimatingRef.current) {
      return
    }

    event.preventDefault()
    const nextPositionPx = normalizeCyclicWheelPosition(
      gesture.startPositionPx - (event.clientY - gesture.startY),
      cardStepPx,
      Math.max(visibleOptions.length, 1),
    )
    const timeMs = performance.now()
    gesture.previousY = gesture.lastY
    gesture.previousTimeMs = gesture.lastTimeMs
    gesture.lastY = event.clientY
    gesture.lastTimeMs = timeMs
    gesture.pointerSamples = appendBoundedPointerSample(gesture.pointerSamples, {
      timestampMs: timeMs,
      y: event.clientY,
      positionPx: nextPositionPx,
      instantaneousVelocityPxPerSec:
        ((event.clientY - gesture.previousY) / Math.max(timeMs - gesture.previousTimeMs, 16)) *
        -1000,
    })
    setPositionPx(nextPositionPx)
  }

  function endGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return
    }

    gestureRef.current = null
    setIsDragging(false)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const dragDistancePx = Math.abs(event.clientY - gesture.startY)
    const timeDeltaMs = Math.max(gesture.lastTimeMs - gesture.previousTimeMs, 16)
    const pointerVelocityPxPerSec =
      ((gesture.lastY - gesture.previousY) / timeDeltaMs) * 1000
    const releaseVelocityPxPerSec = -pointerVelocityPxPerSec
    const releasePositionPx = positionRef.current
    const dragDurationMs = Math.max(gesture.lastTimeMs - gesture.startTimeMs, 0)
    const pointerSamples = appendBoundedPointerSample(gesture.pointerSamples, {
      timestampMs: performance.now(),
      y: event.clientY,
      positionPx: releasePositionPx,
      instantaneousVelocityPxPerSec: releaseVelocityPxPerSec,
    })
    const visibleOptionOrder = getVisibleOptionTelemetry({
      allOptions: config.wheel.options,
      visibleOptions,
      sessionState,
    })
    const visibleOptionTelemetryById = new Map(
      visibleOptionOrder.map((option) => [option.id, option]),
    )
    const activeOptionIdsInVisibleOrder = visibleOptionOrder
      .filter((option) => option.active)
      .map((option) => option.id)
    const excludedDisplayStateSummary = {
      hidden: sessionState.excludedOptions.filter((option) => option.displayMode === 'hide').length,
      showDisabled: sessionState.excludedOptions.filter(
        (option) => option.displayMode === 'show-disabled',
      ).length,
    }
    debugLogger.log('spin', 'pointer_up', {
      pointerType: event.pointerType,
      dragDistancePx,
      releaseVelocityPxPerSec,
      positionPx: releasePositionPx,
    })

    if (isSpinLockedByActiveCount) {
      const finalPositionPx = snapPositionToCard(releasePositionPx, cardStepPx)
      const finalSettleDistancePx = finalPositionPx - releasePositionPx
      const finalSettleDurationMs = calculateTerminalSettleDurationMs(finalSettleDistancePx)
      debugLogger.log('spin', 'blocked-active-count', {
        activeCount: activeOptionCount,
        excludedCount: excludedOptionCount,
        dragDistancePx,
        releaseVelocityPxPerSec,
        reason: 'active-count-too-low',
        resultUpdated: false,
        historyUpdated: false,
      })

      if (debugLogger.isEnabled()) {
        debugLogger.addSpinReport(
          createSpinTelemetryReport({
            classification: 'weak gesture',
            dragDistancePx,
            dragDurationMs,
            releaseVelocityPxPerSecRaw: releaseVelocityPxPerSec,
            releaseVelocityPxPerSecAfterClamp: releaseVelocityPxPerSec,
            direction: releaseVelocityPxPerSec >= 0 ? 'up' : 'down',
            startPositionPx: gesture.startPositionPx,
            releasePositionPx,
            cardStepPx,
            optionCount: config.wheel.options.length,
            visibleOptionCount: visibleOptions.length,
            activeOptionCount,
            excludedOptionCount,
            excludedDisplayStateSummary,
            visibleOptionOrder,
            activeOptionIdsInVisibleOrder,
            thresholds: {
              minDragDistancePx: defaultSpinPhysicsConfig.minDragDistancePx,
              minReleaseVelocityPxPerSec: defaultSpinPhysicsConfig.minReleaseVelocityPxPerSec,
            },
            pointerSamples,
            frameSamples: [],
            weak: {
              snapTargetPositionPx: finalPositionPx,
              snapDistancePx: finalSettleDistancePx,
              noResult: true,
              targetSelectionPolicy: 'locked',
              finalSettleAnimated: finalSettleDurationMs > 0,
              finalSettleDurationMs,
              finalSettleDistancePx,
              finalSettleDistanceCards: Math.abs(finalSettleDistancePx / cardStepPx),
              visibleJumpPrevented: finalSettleDurationMs > 120,
              finalCorrectionPx: 0,
            },
          }),
        )
      }

      animateTo(finalPositionPx, finalSettleDurationMs)
      return
    }

    const outcome = calculateSpinOutcome({
      currentPositionPx: releasePositionPx,
      dragDistancePx,
      releaseVelocityPxPerSec,
      cardStepPx,
      jitterCards: getRandomJitterCards(),
    })
    const spinDirection = releaseVelocityPxPerSec >= 0 ? 1 : -1
    const terminalTarget =
      outcome.kind === 'spin'
        ? resolveTerminalEligibleTarget({
            options: visibleOptions,
            sessionState,
            rawPositionPx: outcome.finalPositionPx,
            cardStepPx,
            spinDirection,
          })
        : undefined
    const finalPositionPx = terminalTarget?.positionPx ?? outcome.finalPositionPx
    const eligibilityExtensionPx =
      outcome.kind === 'spin' ? terminalTarget?.eligibilityExtensionPx ?? 0 : 0
    const eligibilityExtensionCards =
      outcome.kind === 'spin' ? terminalTarget?.eligibilityExtensionCards ?? 0 : 0
    const coastPositionPx =
      outcome.kind === 'spin'
        ? outcome.coastPositionPx
        : outcome.finalPositionPx
    const inertialPositionPx =
      outcome.kind === 'spin'
        ? outcome.inertialPositionPx
        : outcome.finalPositionPx
    const finalSnapDistancePx =
      outcome.kind === 'spin'
        ? finalPositionPx - inertialPositionPx
        : outcome.finalPositionPx - positionRef.current
    const terminalContinuationDistancePx =
      outcome.kind === 'spin' ? terminalTarget?.terminalContinuationDistancePx ?? 0 : 0
    const terminalContinuationDistanceCards =
      outcome.kind === 'spin' ? terminalTarget?.terminalContinuationDistanceCards ?? 0 : 0
    const terminalContinuationDurationMs =
      outcome.kind === 'spin' && terminalContinuationDistancePx !== 0
        ? calculateTerminalContinuationDurationMs(finalSnapDistancePx, cardStepPx)
        : 0
    const snapDurationMs =
      outcome.kind === 'spin' && terminalContinuationDistancePx !== 0
        ? terminalContinuationDurationMs
        : calculateTerminalSettleDurationMs(finalSnapDistancePx)
    const result =
      outcome.kind === 'spin'
        ? terminalTarget?.option ?? getWinningOption(visibleOptions, finalPositionPx, cardStepPx)
        : undefined
    const rawCandidateIndex =
      outcome.kind === 'spin'
        ? terminalTarget?.candidateIndex ??
          getWinningOptionIndex(outcome.finalPositionPx, cardStepPx, visibleOptions.length)
        : undefined
    const rawCandidate =
      terminalTarget?.candidateOption ??
      (rawCandidateIndex === undefined ? undefined : visibleOptions[rawCandidateIndex])
    const candidateWasExcluded = rawCandidate
      ? terminalTarget?.candidateWasExcluded ??
        getExcludedOptionDisplayMode(rawCandidate.id, sessionState) !== undefined
      : false
    const rawCandidateTelemetry = rawCandidate
      ? visibleOptionTelemetryById.get(rawCandidate.id)
      : undefined
    const adjustedTelemetry = terminalTarget
      ? visibleOptionTelemetryById.get(terminalTarget.option.id)
      : result
        ? visibleOptionTelemetryById.get(result.id)
        : undefined
    const eligibilityAdjustmentReason =
      outcome.kind !== 'spin'
        ? 'none'
        : terminalTarget
          ? candidateWasExcluded
            ? 'candidate-excluded'
            : 'none'
          : activeOptionCount < 2
            ? 'active-count-too-low'
            : 'no-eligible-options'
    const eligibilityAdjustmentDirection =
      outcome.kind === 'spin' && eligibilityExtensionPx !== 0
        ? spinDirection >= 0
          ? 'forward'
          : 'backward'
        : 'none'
    const finalSnapDistanceCards =
      outcome.kind === 'spin' ? Math.abs(finalSnapDistancePx / cardStepPx) : undefined
    const finalSettleAnimated = snapDurationMs > 0
    const finalSettleDistanceCards =
      outcome.kind === 'spin' ? Math.abs(finalSnapDistancePx / cardStepPx) : undefined
    const eligibilityMovementWasLong = terminalContinuationDistanceCards > 1.5
    const terminalContinuationWasLong = terminalContinuationDistanceCards > 1.5

    if (debugLogger.isEnabled()) {
      if (outcome.kind === 'snap') {
        const finalSettleDistancePx = outcome.finalPositionPx - releasePositionPx
        const finalSettleDurationMs = calculateTerminalSettleDurationMs(finalSettleDistancePx)
        debugLogger.addSpinReport(
          createSpinTelemetryReport({
            classification: 'weak gesture',
            dragDistancePx,
            dragDurationMs,
            releaseVelocityPxPerSecRaw: releaseVelocityPxPerSec,
            releaseVelocityPxPerSecAfterClamp: releaseVelocityPxPerSec,
            direction: releaseVelocityPxPerSec >= 0 ? 'up' : 'down',
            startPositionPx: gesture.startPositionPx,
            releasePositionPx,
            cardStepPx,
            optionCount: config.wheel.options.length,
            visibleOptionCount: visibleOptions.length,
            activeOptionCount,
            excludedOptionCount,
            excludedDisplayStateSummary,
            visibleOptionOrder,
            activeOptionIdsInVisibleOrder,
            thresholds: {
              minDragDistancePx: defaultSpinPhysicsConfig.minDragDistancePx,
              minReleaseVelocityPxPerSec: defaultSpinPhysicsConfig.minReleaseVelocityPxPerSec,
            },
            pointerSamples,
            frameSamples: [],
            weak: {
              snapTargetPositionPx: outcome.finalPositionPx,
              snapDistancePx: finalSettleDistancePx,
              noResult: true,
              targetSelectionPolicy: 'weak-snap',
              finalSettleAnimated: finalSettleDurationMs > 0,
              finalSettleDurationMs,
              finalSettleDistancePx,
              finalSettleDistanceCards: Math.abs(finalSettleDistancePx / cardStepPx),
              visibleJumpPrevented: finalSettleDurationMs > 120,
              finalCorrectionPx: 0,
            },
          }),
        )
      } else {
        activeSpinReportRef.current = createSpinTelemetryReport({
          classification: 'valid spin gesture',
          dragDistancePx,
          dragDurationMs,
          releaseVelocityPxPerSecRaw: releaseVelocityPxPerSec,
          releaseVelocityPxPerSecAfterClamp: outcome.clampedReleaseVelocityPxPerSec,
          direction: releaseVelocityPxPerSec >= 0 ? 'up' : 'down',
          startPositionPx: gesture.startPositionPx,
          releasePositionPx,
          cardStepPx,
          optionCount: config.wheel.options.length,
          visibleOptionCount: visibleOptions.length,
          activeOptionCount,
          excludedOptionCount,
          thresholds: {
            minDragDistancePx: defaultSpinPhysicsConfig.minDragDistancePx,
            minReleaseVelocityPxPerSec: defaultSpinPhysicsConfig.minReleaseVelocityPxPerSec,
          },
          pointerSamples,
          frameSamples: [],
          valid: {
            initialVelocityPxPerSec: releaseVelocityPxPerSec,
            velocityClamp: {
              minPxPerSec: defaultSpinPhysicsConfig.minReleaseVelocityPxPerSec,
              maxPxPerSec: defaultSpinPhysicsConfig.maxReleaseVelocityPxPerSec,
              wasClamped:
                outcome.clampedReleaseVelocityPxPerSec !== releaseVelocityPxPerSec,
            },
            projectedTravelDistancePx: outcome.projectedTravelPx,
            projectedTravelCards: outcome.virtualCardsToTravel,
            actualAnimatedTravelDistancePx: finalPositionPx - releasePositionPx,
            coastDurationMs: outcome.coastDurationMs,
            decelerationDurationMs: outcome.decelerationDurationMs,
            totalSpinDurationMs: outcome.inertialDurationMs + snapDurationMs,
            finalSnapDistancePx,
            finalSnapDistanceCards,
            finalSnapWasLarge: finalSnapDistanceCards !== undefined && finalSnapDistanceCards > 0.5,
            finalPositionBeforeSnapPx: inertialPositionPx,
            finalSnappedPositionPx: finalPositionPx,
            rawLandingCandidate: getTelemetryOptionSummary(rawCandidate, rawCandidateIndex, {
              ...rawCandidateTelemetry,
              positionPx: terminalTarget?.candidatePositionPx ?? outcome.finalPositionPx,
            }),
            rawPhysicalLandingCandidate: getTelemetryOptionSummary(rawCandidate, rawCandidateIndex, {
              ...rawCandidateTelemetry,
              positionPx: terminalTarget?.candidatePositionPx ?? outcome.finalPositionPx,
            }),
            rawLandingCandidateExcluded: candidateWasExcluded,
            adjustedEligibleOption: getTelemetryOptionSummary(
              terminalTarget?.option ?? result,
              terminalTarget?.index ?? rawCandidateIndex,
              {
                ...adjustedTelemetry,
                positionPx: finalPositionPx,
              },
            ),
            selectedResult: getTelemetryOptionSummary(
              result,
              terminalTarget?.index ?? rawCandidateIndex,
              {
                ...adjustedTelemetry,
                positionPx: finalPositionPx,
              },
            ),
            candidateWasExcluded,
            adjustedDueToExclusion: candidateWasExcluded,
            targetSelectionPolicy: terminalTarget?.targetSelectionPolicy ?? 'raw-active',
            localEligibleTargetSelectionApplied:
              terminalTarget?.localEligibleTargetSelectionApplied ?? false,
            rawTerminalLandingPositionPx: outcome.finalPositionPx,
            nearestEligibleTarget: getTelemetryOptionSummary(
              terminalTarget?.option ?? result,
              terminalTarget?.index ?? rawCandidateIndex,
              {
                ...adjustedTelemetry,
                positionPx: finalPositionPx,
              },
            ),
            nearestEligibleDistancePx: terminalTarget?.nearestEligibleDistancePx ?? 0,
            nearestEligibleDistanceCards: terminalTarget?.nearestEligibleDistanceCards ?? 0,
            directionPreferredTarget: getTelemetryOptionSummary(
              terminalTarget?.directionPreferredOption,
              terminalTarget?.directionPreferredIndex,
              terminalTarget?.directionPreferredPositionPx === undefined
                ? undefined
                : {
                    positionPx: terminalTarget.directionPreferredPositionPx,
                  },
            ),
            directionPreferredDistanceCards: terminalTarget?.directionPreferredDistanceCards,
            reverseDirectionCandidate: getTelemetryOptionSummary(
              terminalTarget?.reverseDirectionOption,
              terminalTarget?.reverseDirectionIndex,
              terminalTarget?.reverseDirectionPositionPx === undefined
                ? undefined
                : {
                    positionPx: terminalTarget.reverseDirectionPositionPx,
                  },
            ),
            reverseDirectionCandidateDistanceCards:
              terminalTarget?.reverseDirectionDistanceCards,
            chosenTargetDirection: terminalTarget?.chosenTargetDirection ?? 'none',
            directionPreserved: terminalTarget?.directionPreserved ?? true,
            reverseDirectionCandidateIgnored:
              terminalTarget?.reverseDirectionCandidateIgnored ?? false,
            rawExcludedLandingBypassed: terminalTarget?.rawExcludedLandingBypassed ?? false,
            rawInertialPositionPx: outcome.inertialPositionPx,
            rawRoundedTerminalPositionPx: outcome.finalPositionPx,
            rawTerminalLandingWasExcluded: candidateWasExcluded,
            resolvedEligibleTarget: getTelemetryOptionSummary(
              terminalTarget?.option ?? result,
              terminalTarget?.index ?? rawCandidateIndex,
              {
                ...adjustedTelemetry,
                positionPx: finalPositionPx,
              },
            ),
            terminalContinuationDistancePx,
            terminalContinuationDistanceCards,
            terminalContinuationDurationMs,
            terminalContinuationWasLong,
            terminalContinuationStartedBeforeStop: terminalContinuationDistancePx !== 0,
            eligibilityMovementWasLong,
            eligibilityAdjustmentApplied: eligibilityExtensionPx !== 0,
            eligibilityAdjustmentReason,
            eligibilityAdjustmentDirection,
            eligibilityExtensionCards,
            eligibilityExtensionPx,
            projectedPositionBeforeEligibilityAdjustmentPx:
              terminalTarget?.candidatePositionPx ?? outcome.finalPositionPx,
            projectedPositionAfterEligibilityAdjustmentPx: finalPositionPx,
            positionBeforeFinalSnapPx: inertialPositionPx,
            totalTravelBeforeEligibilityExtensionPx: outcome.finalPositionPx - releasePositionPx,
            totalTravelAfterEligibilityExtensionPx: finalPositionPx - releasePositionPx,
            totalDurationBeforeEligibilityExtensionMs: outcome.durationMs,
            totalDurationAfterEligibilityExtensionMs: outcome.inertialDurationMs + snapDurationMs,
            finalSettleAnimated,
            finalSettleDurationMs: snapDurationMs,
            finalSettleDistancePx: finalSnapDistancePx,
            finalSettleDistanceCards,
            visibleJumpPrevented: snapDurationMs > 120,
            finalCorrectionPx: 0,
            safetyClampApplied: outcome.safetyClampApplied,
          },
        })
      }
    }

    debugLogger.log('spin', outcome.kind === 'spin' ? 'valid_spin' : 'weak_gesture', {
      outcome,
      dragDistancePx,
      releaseVelocityPxPerSec,
      projectedTravelPx: outcome.kind === 'spin' ? outcome.projectedTravelPx : undefined,
      decelerationDurationMs: outcome.kind === 'spin' ? outcome.inertialDurationMs : undefined,
      finalSnapDistancePx,
      rawPhysicalOutcome:
        outcome.kind === 'spin'
          ? {
              rawInertialPositionPx: outcome.inertialPositionPx,
              rawRoundedTerminalPositionPx: outcome.finalPositionPx,
              rawTerminalLandingCandidate: getTelemetryOptionSummary(
                rawCandidate,
                rawCandidateIndex,
                {
                  ...rawCandidateTelemetry,
                  positionPx: terminalTarget?.candidatePositionPx ?? outcome.finalPositionPx,
                },
              ),
              projectedTravelPx: outcome.projectedTravelPx,
            }
          : undefined,
      resolvedEligibleOutcome:
        outcome.kind === 'spin'
          ? {
              finalPositionPx,
              selectedResult: getTelemetryOptionSummary(
                result,
                terminalTarget?.index ?? rawCandidateIndex,
                {
                  ...adjustedTelemetry,
                  positionPx: finalPositionPx,
                },
              ),
              targetSelectionPolicy: terminalTarget?.targetSelectionPolicy ?? 'raw-active',
              directionPreserved: terminalTarget?.directionPreserved ?? true,
              terminalContinuationDistancePx,
              terminalContinuationDurationMs,
            }
          : undefined,
    })

    if (result) {
      debugLogger.log('spin', 'result_selection', {
        result: getOptionSummary(result),
        finalPositionPx,
      })
    }

    if (outcome.kind === 'spin' && result) {
      animateSpinTo({
        coastPositionPx,
        inertialPositionPx,
        finalPositionPx,
        coastDurationMs: outcome.coastDurationMs,
        decelerationDurationMs: outcome.decelerationDurationMs,
        inertialDurationMs: outcome.inertialDurationMs,
        snapDurationMs,
        result,
      })
      return
    }

    animateTo(finalPositionPx, outcome.durationMs, result)
  }

  function handleClearHistory() {
    const nextHistory = clearHistory(config)
    saveWheelHistory(nextHistory)
    debugLogger.log('history', 'clear', getHistorySummary(nextHistory))
    onHistoryChange(nextHistory)
  }

  return (
    <section className={styles.screen} aria-labelledby="wheel-title">
      <header className={styles.header}>
        <p className={styles.kicker}>Вертикальный барабан</p>
        <div className={styles.headerRow}>
          <h1 id="wheel-title">{config.wheel.title || 'Без названия'}</h1>
          <button className={styles.secondaryButton} type="button" onClick={onEdit}>
            Редактировать
          </button>
        </div>
        {config.wheel.description ? (
          <p className={styles.description}>{config.wheel.description}</p>
        ) : null}
      </header>

      {isValid ? null : (
        <div className={styles.validationBox} role="alert">
          <strong>Барабан нужно исправить</strong>
          <ul>
            {validationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <section className={styles.sessionStatus} aria-label="Состояние исключённых опций">
        <div className={styles.sessionSummary}>
          <span>Активно: {activeOptionCount} из {config.wheel.options.length}</span>
          <span>Исключено: {excludedOptionCount}</span>
          {excludedOptionCount > 0 ? (
            <button className={styles.inlineButton} type="button" onClick={restoreAllOptions}>
              Вернуть все
            </button>
          ) : null}
        </div>
        <p
          className={styles.sessionLockMessage}
          data-visible={activeCountLockMessage ? 'true' : 'false'}
          role={activeCountLockMessage ? 'alert' : undefined}
        >
          {activeCountLockMessage}
        </p>
      </section>

      <WheelView
        config={visibleConfig}
        disabledOptionIds={disabledOptionIds}
        isInteractive={canDragWheel}
        onPointerDown={handlePointerDown}
        onPointerEnd={endGesture}
        onPointerMove={handlePointerMove}
        positionPx={positionPx}
        showActiveHighlight={!isDragging && !isAnimating}
        transitionEasing={transitionEasing}
        transitionMs={transitionMs}
        viewportRef={wheelRef}
      />

      <section className={styles.result} aria-live="polite">
        <span className={styles.resultLabel}>Последний результат</span>
        <strong>{lastResult ? lastResult.title : 'Проведите по барабану'}</strong>
        {lastResult?.subtitle ? <small>{lastResult.subtitle}</small> : null}
        {resultStatus ? <span className={styles.resultStatus}>{resultStatus}</span> : null}
        {pendingDecision ? (
          <div className={styles.resultActions}>
            {afterResultDecisionOptions
              .filter((option) => pendingDecision.allowedDecisions.includes(option.value))
              .map((option) => (
                <button
                  className={styles.inlineButton}
                  key={option.value}
                  type="button"
                  onClick={() => applyResultDecision(pendingDecision.option, option.value)}
                >
                  {option.label}
                </button>
              ))}
          </div>
        ) : lastResult ? (
          <div className={styles.resultActions}>
            {getExcludedOptionDisplayMode(lastResult.optionId, sessionState) ? (
              <button
                className={styles.inlineButton}
                type="button"
                onClick={() => restoreResultOption(lastResult.optionId)}
              >
                Вернуть в вращение
              </button>
            ) : (
              <button
                className={styles.inlineButton}
                type="button"
                onClick={() => {
                  const nextSessionState = applyAfterResultDecision(
                    sessionState,
                    lastResult.optionId,
                    config.wheel.settings.excludedOptionDisplayMode === 'hide'
                      ? 'exclude-hide'
                      : 'exclude-show-disabled',
                  )
                  updateSessionState(nextSessionState, 'option-excluded')
                  setResultStatus('Опция исключена из следующих вращений.')
                }}
              >
                Исключить из следующих вращений
              </button>
            )}
          </div>
        ) : null}
      </section>

      <ResultHistory
        history={history}
        isOpen={isHistoryOpen}
        onClear={handleClearHistory}
        onToggle={() => setIsHistoryOpen((isOpen) => !isOpen)}
      />
    </section>
  )
}

function ResultHistory({
  history,
  isOpen,
  onToggle,
  onClear,
}: {
  history: WheelHistory
  isOpen: boolean
  onToggle: () => void
  onClear: () => void
}) {
  return (
    <section className={styles.history}>
      <button
        className={styles.historyToggle}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        История ({history.entries.length})
      </button>

      {isOpen ? (
        <div className={styles.historyPanel}>
          {history.entries.length > 0 ? (
            <>
              <ol className={styles.historyList}>
                {history.entries.map((entry) => (
                  <li className={styles.historyItem} key={entry.id}>
                    <span>
                      <strong>{entry.title}</strong>
                      {entry.subtitle ? <small>{entry.subtitle}</small> : null}
                    </span>
                    <time dateTime={entry.createdAt}>
                      {formatHistoryDate(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
              <button className={styles.clearButton} type="button" onClick={onClear}>
                Очистить историю
              </button>
            </>
          ) : (
            <p className={styles.emptyHistory}>История пока пустая.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}

function ToastNotification({
  message,
  onClose,
}: {
  message: AppMessage
  onClose: () => void
}) {
  useEffect(() => {
    if (message.kind === 'error') {
      return undefined
    }

    const timeoutId = window.setTimeout(onClose, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [message, onClose])

  return (
    <aside
      className={styles.toast}
      data-kind={message.kind}
      role={message.kind === 'error' ? 'alert' : 'status'}
      aria-live={message.kind === 'error' ? 'assertive' : 'polite'}
    >
      <span>{message.text}</span>
      <button type="button" onClick={onClose} aria-label="Закрыть уведомление">
        ×
      </button>
    </aside>
  )
}

function EditScreen({
  config,
  validationMessages,
  onConfigChange,
  onExportJson,
  onImportJson,
  onShareLink,
  onStatus,
  onSpin,
}: {
  config: WheelConfig
  validationMessages: string[]
  onConfigChange: (config: WheelConfig) => void
  onExportJson: () => void
  onImportJson: (file: File) => void
  onShareLink: () => void
  onStatus: (message: AppMessage) => void
  onSpin: () => void
}) {
  const { wheel } = config

  function updateWheel(patch: Partial<WheelConfig['wheel']>) {
    onConfigChange({
      ...config,
      wheel: {
        ...wheel,
        ...patch,
      },
    })
  }

  function updateSettings(patch: Partial<WheelSettings>) {
    debugLogger.log('editor', 'visual_setting_change', patch)
    updateWheel({
      settings: {
        ...wheel.settings,
        ...patch,
      },
    })
  }

  function updateOption(optionId: string, patch: Partial<WheelOption>) {
    if ('title' in patch || 'subtitle' in patch) {
      debugLogger.log('editor', 'semantic_option_change', {
        optionId,
        patch,
      })
    } else if ('emoji' in patch || 'backgroundColor' in patch || 'textColor' in patch) {
      debugLogger.log('editor', 'option_visual_change', {
        optionId,
        patch,
      })
    }

    updateWheel({
      options: wheel.options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option,
      ),
    })
  }

  async function uploadOptionImage(optionId: string, file: File) {
    if (!isSupportedImageFile(file)) {
      debugLogger.log('image', 'upload_error', {
        optionId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        error: 'unsupported_type',
      })
      onStatus({ kind: 'error', text: 'Поддерживаются только PNG, JPG, JPEG и WebP.' })
      return
    }

    try {
      const compressed = await compressImageFile(file)
      updateOption(optionId, {
        image: {
          kind: 'data',
          value: compressed.dataUrl,
        },
      })
      debugLogger.log('image', 'upload_success', {
        optionId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        compressed,
      })
      onStatus({ kind: 'success', text: 'Картинка сжата и добавлена.' })
    } catch (error) {
      debugLogger.log('image', 'upload_error', {
        optionId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        error: error instanceof Error ? error.message : 'unknown_error',
      })
      onStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Не удалось обработать картинку.',
      })
    }
  }

  function addOption() {
    if (wheel.options.length >= WHEEL_LIMITS.maxOptions) {
      return
    }

    const option = createEmptyOption()
    debugLogger.log('editor', 'option_add', {
      option: getOptionSummary(option),
      nextOptionCount: wheel.options.length + 1,
    })
    updateWheel({
      options: [...wheel.options, option],
    })
  }

  function deleteOption(optionId: string) {
    if (wheel.options.length <= WHEEL_LIMITS.minOptions) {
      return
    }

    debugLogger.log('editor', 'option_delete', {
      optionId,
      nextOptionCount: wheel.options.length - 1,
    })
    updateWheel({
      options: wheel.options.filter((option) => option.id !== optionId),
    })
  }

  function moveOption(optionId: string, direction: -1 | 1) {
    const index = wheel.options.findIndex((option) => option.id === optionId)
    const nextIndex = index + direction

    if (index < 0 || nextIndex < 0 || nextIndex >= wheel.options.length) {
      return
    }

    const nextOptions = [...wheel.options]
    const [option] = nextOptions.splice(index, 1)
    nextOptions.splice(nextIndex, 0, option)
    debugLogger.log('editor', 'option_reorder', {
      optionId,
      fromIndex: index,
      toIndex: nextIndex,
    })
    updateWheel({ options: nextOptions })
  }

  function updateNumberSetting(key: NumberSettingKey, rawValue: number) {
    const limit = WHEEL_SETTING_LIMITS[key]
    const value = Number.isFinite(rawValue) ? rawValue : limit.min

    updateSettings({
      [key]: clampNumber(value, limit.min, limit.max),
    })
  }

  return (
    <section className={styles.editor} aria-labelledby="editor-title">
      <header className={styles.editorHeader}>
        <div>
          <p className={styles.kicker}>Редактор</p>
          <h1 id="editor-title">Настройка барабана</h1>
        </div>
        <button className={styles.primaryButton} type="button" onClick={onSpin}>
          К барабану
        </button>
      </header>

      {validationMessages.length > 0 ? (
        <div className={styles.validationBox} role="alert">
          <strong>Проверьте настройки</strong>
          <ul>
            {validationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className={styles.editorSection} aria-labelledby="exchange-title">
        <h2 id="exchange-title">Файл и ссылка</h2>
        <div className={styles.exchangeActions}>
          <button className={styles.secondaryButton} type="button" onClick={onExportJson}>
            Экспорт JSON
          </button>
          <label className={styles.fileButton}>
            Импорт JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]

                if (file) {
                  onImportJson(file)
                  event.currentTarget.value = ''
                }
              }}
            />
          </label>
          <button className={styles.secondaryButton} type="button" onClick={onShareLink}>
            Скопировать ссылку
          </button>
        </div>
      </section>

      <section className={styles.previewPanel} aria-label="Превью барабана">
        <WheelView
          config={config}
          isInteractive={false}
          positionPx={0}
          transitionMs={0}
        />
      </section>

      <section className={styles.editorSection} aria-labelledby="general-title">
        <h2 id="general-title">Общее</h2>
        <label className={styles.field}>
          <span>Название</span>
          <input
            type="text"
            value={wheel.title ?? ''}
            onChange={(event) => updateWheel({ title: event.target.value })}
            placeholder="Название барабана"
          />
        </label>
        <label className={styles.field}>
          <span>Описание</span>
          <textarea
            value={wheel.description ?? ''}
            onChange={(event) => updateWheel({ description: event.target.value })}
            placeholder="Короткое описание"
            rows={3}
          />
        </label>
      </section>

      <WheelSettingsEditor settings={wheel.settings} onChange={updateSettings} onNumberChange={updateNumberSetting} />

      <section className={styles.editorSection} aria-labelledby="options-title">
        <div className={styles.sectionHeader}>
          <h2 id="options-title">Опции</h2>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={addOption}
            disabled={wheel.options.length >= WHEEL_LIMITS.maxOptions}
          >
            Добавить
          </button>
        </div>
        <div className={styles.optionEditors}>
          {wheel.options.map((option, index) => (
            <OptionEditor
              canDelete={wheel.options.length > WHEEL_LIMITS.minOptions}
              canMoveDown={index < wheel.options.length - 1}
              canMoveUp={index > 0}
              index={index}
              key={option.id}
              option={option}
              onDelete={() => deleteOption(option.id)}
              onImageUrlChange={(value) => {
                debugLogger.log('image', 'url_set', {
                  optionId: option.id,
                  url: value,
                  isEmpty: value.trim().length === 0,
                })
                updateOption(option.id, {
                  image: value.trim()
                    ? {
                        kind: 'url',
                        value: value.trim(),
                      }
                    : undefined,
                })
              }}
              onMoveDown={() => moveOption(option.id, 1)}
              onMoveUp={() => moveOption(option.id, -1)}
              onRemoveImage={() => {
                debugLogger.log('image', 'remove', {
                  optionId: option.id,
                  image: option.image,
                })
                updateOption(option.id, { image: undefined })
              }}
              onUpdate={(patch) => updateOption(option.id, patch)}
              onUploadImage={(file) => uploadOptionImage(option.id, file)}
            />
          ))}
        </div>
      </section>
    </section>
  )
}

function WheelSettingsEditor({
  settings,
  onChange,
  onNumberChange,
}: {
  settings: WheelSettings
  onChange: (patch: Partial<WheelSettings>) => void
  onNumberChange: (key: NumberSettingKey, value: number) => void
}) {
  function toggleWheelDecision(decision: AfterResultDecision, isChecked: boolean) {
    const nextDecisions = isChecked
      ? [...settings.askAllowedDecisions, decision]
      : settings.askAllowedDecisions.filter((item) => item !== decision)

    onChange({ askAllowedDecisions: nextDecisions })
  }

  return (
    <section className={styles.editorSection} aria-labelledby="visual-title">
      <h2 id="visual-title">Внешний вид</h2>
      <label className={styles.field}>
        <span>Тема</span>
        <select
          value={settings.theme}
          onChange={(event) => onChange({ theme: event.target.value as WheelSettings['theme'] })}
        >
          <option value="dark">Темная</option>
          <option value="light">Светлая</option>
        </select>
      </label>
      <div className={styles.colorGrid}>
        <label className={styles.field}>
          <span>Фон приложения</span>
          <input
            type="color"
            value={settings.appBackgroundColor}
            onChange={(event) => onChange({ appBackgroundColor: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>Цвет указателя</span>
          <input
            type="color"
            value={settings.pointerColor}
            onChange={(event) => onChange({ pointerColor: event.target.value })}
          />
        </label>
      </div>
      <div className={styles.behaviorGrid}>
        <label className={styles.field}>
          <span>После выпадения</span>
          <select
            value={settings.afterResultBehavior}
            onChange={(event) =>
              onChange({ afterResultBehavior: event.target.value as WheelSettings['afterResultBehavior'] })
            }
          >
            {afterResultBehaviorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Исключённые опции</span>
          <select
            value={settings.excludedOptionDisplayMode}
            onChange={(event) =>
              onChange({ excludedOptionDisplayMode: event.target.value as ExcludedOptionDisplayMode })
            }
          >
            {excludedDisplayModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {settings.afterResultBehavior === 'ask' ? (
        <fieldset className={styles.checkboxGroup}>
          <legend>Доступные решения</legend>
          {afterResultDecisionOptions.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={settings.askAllowedDecisions.includes(option.value)}
                onChange={(event) => toggleWheelDecision(option.value, event.currentTarget.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {settings.askAllowedDecisions.length < 2 ? (
            <small className={styles.fieldError}>Выберите минимум два решения.</small>
          ) : null}
        </fieldset>
      ) : null}
      <div className={styles.rangeList}>
        {numberSettingControls.map(({ key, label, unit }) => {
          const limit = WHEEL_SETTING_LIMITS[key]

          return (
            <label className={styles.rangeField} key={key}>
              <span>{label}</span>
              <input
                type="range"
                min={limit.min}
                max={limit.max}
                value={settings[key]}
                onChange={(event) => onNumberChange(key, event.currentTarget.valueAsNumber)}
              />
              <span className={styles.numberInputWrap}>
                <input
                  type="number"
                  min={limit.min}
                  max={limit.max}
                  value={settings[key]}
                  onChange={(event) => onNumberChange(key, event.currentTarget.valueAsNumber)}
                />
                <small>{unit}</small>
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

function OptionEditor({
  option,
  index,
  canMoveUp,
  canMoveDown,
  canDelete,
  onUpdate,
  onUploadImage,
  onImageUrlChange,
  onRemoveImage,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  option: WheelOption
  index: number
  canMoveUp: boolean
  canMoveDown: boolean
  canDelete: boolean
  onUpdate: (patch: Partial<WheelOption>) => void
  onUploadImage: (file: File) => void
  onImageUrlChange: (value: string) => void
  onRemoveImage: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}) {
  const isTitleInvalid = option.title.trim().length === 0
  const usesCustomAskDecisions = option.askAllowedDecisions !== undefined
  const optionAskDecisions = option.askAllowedDecisions ?? []

  function toggleOptionDecision(decision: AfterResultDecision, isChecked: boolean) {
    const nextDecisions = isChecked
      ? [...optionAskDecisions, decision]
      : optionAskDecisions.filter((item) => item !== decision)

    onUpdate({ askAllowedDecisions: nextDecisions })
  }

  return (
    <article className={styles.optionEditor}>
      <div className={styles.optionEditorHeader}>
        <h3>Опция {index + 1}</h3>
        <div className={styles.optionActions}>
          <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Поднять опцию">
            ↑
          </button>
          <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Опустить опцию">
            ↓
          </button>
          <button type="button" onClick={onDelete} disabled={!canDelete}>
            Удалить
          </button>
        </div>
      </div>
      <label className={styles.field}>
        <span>Название</span>
        <input
          type="text"
          value={option.title}
          onChange={(event) => onUpdate({ title: event.target.value })}
          aria-invalid={isTitleInvalid}
        />
        {isTitleInvalid ? <small className={styles.fieldError}>Название обязательно.</small> : null}
      </label>
      <label className={styles.field}>
        <span>Подзаголовок</span>
        <input
          type="text"
          value={option.subtitle ?? ''}
          onChange={(event) => onUpdate({ subtitle: event.target.value })}
        />
      </label>
      <div className={styles.optionInlineFields}>
        <label className={styles.field}>
          <span>Emoji</span>
          <input
            type="text"
            value={option.emoji ?? ''}
            onChange={(event) => onUpdate({ emoji: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>Фон</span>
          <input
            type="color"
            value={option.backgroundColor}
            onChange={(event) => onUpdate({ backgroundColor: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>Текст</span>
          <input
            type="color"
            value={option.textColor}
            onChange={(event) => onUpdate({ textColor: event.target.value })}
          />
        </label>
      </div>
      <div className={styles.imageControls}>
        <label className={styles.fileButton}>
          Загрузить картинку
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]

              if (file) {
                onUploadImage(file)
                event.currentTarget.value = ''
              }
            }}
          />
        </label>
        <label className={styles.field}>
          <span>URL картинки</span>
          <input
            type="url"
            value={option.image?.kind === 'url' ? option.image.value : ''}
            onChange={(event) => onImageUrlChange(event.target.value)}
            placeholder="https://example.com/image.webp"
          />
        </label>
        {option.image ? (
          <button className={styles.secondaryButton} type="button" onClick={onRemoveImage}>
            Убрать картинку
          </button>
        ) : null}
      </div>
      <div className={styles.behaviorPanel}>
        <label className={styles.field}>
          <span>После выпадения этой опции</span>
          <select
            value={option.afterResultBehavior ?? 'inherit'}
            onChange={(event) =>
              onUpdate({
                afterResultBehavior: event.target.value as OptionAfterResultBehavior,
                askAllowedDecisions:
                  event.target.value === 'ask' ? option.askAllowedDecisions : undefined,
              })
            }
          >
            {optionAfterResultBehaviorOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {option.afterResultBehavior === 'ask' ? (
          <fieldset className={styles.checkboxGroup}>
            <legend>Решения для этой опции</legend>
            <label>
              <input
                type="checkbox"
                checked={!usesCustomAskDecisions}
                onChange={(event) =>
                  onUpdate({
                    askAllowedDecisions: event.currentTarget.checked
                      ? undefined
                      : ['keep', 'exclude-hide'],
                  })
                }
              />
              <span>Как у барабана</span>
            </label>
            {usesCustomAskDecisions ? (
              <>
                {afterResultDecisionOptions.map((item) => (
                  <label key={item.value}>
                    <input
                      type="checkbox"
                      checked={optionAskDecisions.includes(item.value)}
                      onChange={(event) => toggleOptionDecision(item.value, event.currentTarget.checked)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
                {optionAskDecisions.length < 2 ? (
                  <small className={styles.fieldError}>Выберите минимум два решения.</small>
                ) : null}
              </>
            ) : null}
          </fieldset>
        ) : null}
      </div>
    </article>
  )
}

function DebugPanel({
  events,
  spinReports,
  onClear,
  onClearSpinReports,
  onCopy,
  onCopyAllSpinReports,
  onCopyLastSpinReport,
  onDownloadBundle,
  onDownloadDebugLog,
  onDownloadSpinReports,
}: {
  events: ReturnType<typeof debugLogger.getEvents>
  spinReports: ReturnType<typeof debugLogger.getSpinReports>
  onClear: () => void
  onClearSpinReports: () => void
  onCopy: () => void
  onCopyAllSpinReports: () => void
  onCopyLastSpinReport: () => void
  onDownloadBundle: () => void
  onDownloadDebugLog: () => void
  onDownloadSpinReports: () => void
}) {
  const recentEvents = events.slice(-20).reverse()

  return (
    <aside className={styles.debugPanel} aria-label="Диагностический режим">
      <div className={styles.debugPanelHeader}>
        <strong>Debug: включен</strong>
        <span>{events.length}/300</span>
      </div>
      <div className={styles.debugActions}>
        <button type="button" onClick={onCopy}>
          Скопировать лог
        </button>
        <button type="button" onClick={onDownloadDebugLog}>
          Скачать лог
        </button>
        <button type="button" onClick={onClear}>
          Очистить лог
        </button>
        <button type="button" onClick={onDownloadBundle}>
          Скачать diagnostics bundle
        </button>
      </div>
      <details>
        <summary>Spin reports ({spinReports.length})</summary>
        <div className={styles.debugActions}>
          <button type="button" onClick={onCopyLastSpinReport} disabled={spinReports.length === 0}>
            Скопировать последний spin report
          </button>
          <button type="button" onClick={onCopyAllSpinReports} disabled={spinReports.length === 0}>
            Скопировать все spin reports
          </button>
          <button type="button" onClick={onDownloadSpinReports}>
            Скачать spin reports
          </button>
          <button type="button" onClick={onClearSpinReports} disabled={spinReports.length === 0}>
            Очистить spin reports
          </button>
        </div>
      </details>
      <details>
        <summary>Последние события</summary>
        <ol className={styles.debugEventList}>
          {recentEvents.map((event) => (
            <li key={event.id}>
              <code>
                {event.timestamp} [{event.category}] {event.name}
              </code>
            </li>
          ))}
        </ol>
      </details>
    </aside>
  )
}

function App() {
  const [isDebugEnabled, setIsDebugEnabled] = useState(() =>
    debugLogger.configureFromSearch(window.location.search, window.sessionStorage),
  )
  const [debugEvents, setDebugEvents] = useState(debugLogger.getEvents())
  const [spinReports, setSpinReports] = useState(debugLogger.getSpinReports())
  const [config, setConfig] = useState<WheelConfig>(() => getInitialWheelConfig())
  const [sessionState, setSessionState] = useState<WheelSessionState>(() =>
    createWheelSessionState(demoWheelConfig),
  )
  const [pendingDecision, setPendingDecision] = useState<PendingAfterResultDecision | undefined>()
  const [mode, setMode] = useState<AppMode>('spin')
  const [history, setHistory] = useState<WheelHistory>(() =>
    reconcileHistoryForConfig(loadWheelHistory(demoWheelConfig.wheel.id), demoWheelConfig),
  )
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [statusMessage, setStatusMessage] = useState<AppMessage | undefined>()
  const validationMessages = useMemo(() => validateEditableConfig(config), [config])
  const closeToast = useCallback(() => setStatusMessage(undefined), [])

  useEffect(() => {
    return debugLogger.subscribe(() => {
      setIsDebugEnabled(debugLogger.isEnabled())
      setDebugEvents(debugLogger.getEvents())
      setSpinReports(debugLogger.getSpinReports())
    })
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadInitialConfig() {
      debugLogger.log('app', 'initialization_start', {
        hashPresent: window.location.hash.length > 0,
        search: window.location.search,
      })
      const shareConfig = readShareConfigFromHash(window.location.hash)

      if (!shareConfig.ok) {
        debugLogger.log('share', 'decode_error', {
          error: shareConfig.error,
        })
        const localConfig = await loadWheelConfig()
        const nextConfig = localConfig ? cloneWheelConfig(localConfig) : getInitialWheelConfig()

        if (isCancelled) {
          return
        }

        setConfig(nextConfig)
        const nextHistory = reconcileHistoryForConfig(loadWheelHistory(nextConfig.wheel.id), nextConfig)
        const nextSessionState =
          loadWheelSessionState(getWheelFingerprint(nextConfig)) ?? createWheelSessionState(nextConfig)
        debugLogger.log('app', 'config_loaded', {
          source: localConfig ? 'local' : 'demo',
          config: getWheelSummary(nextConfig),
        })
        debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
        debugLogger.log('exclusion', 'active-count-changed', {
          activeCount: getActiveOptionCount(nextConfig.wheel.options, nextSessionState),
          totalCount: nextConfig.wheel.options.length,
        })
        setHistory(nextHistory)
        setSessionState(nextSessionState)
        setPendingDecision(undefined)
        setMode('spin')
        setStatusMessage({
          kind: 'error',
          text: shareConfig.error,
        })
        setIsConfigLoaded(true)
        return
      }

      if (shareConfig.value) {
        const nextConfig = cloneWheelConfig(shareConfig.value)
        debugLogger.log('share', 'decode_success', {
          config: getWheelSummary(nextConfig),
        })

        await saveWheelConfig(nextConfig)

        if (isCancelled) {
          return
        }

        setConfig(nextConfig)
        const nextSessionState = createWheelSessionState(nextConfig)
        const nextHistory = reconcileHistoryForConfig(loadWheelHistory(nextConfig.wheel.id), nextConfig)
        debugLogger.log('app', 'config_loaded', {
          source: 'share',
          config: getWheelSummary(nextConfig),
        })
        debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
        setHistory(nextHistory)
        setSessionState(nextSessionState)
        setPendingDecision(undefined)
        setMode('spin')
        setStatusMessage({
          kind: 'success',
          text: 'Барабан из ссылки загружен. URL-картинки сохранены, локальные не входят в ссылку.',
        })
        setIsConfigLoaded(true)
        return
      }

      const localConfig = await loadWheelConfig()
      const nextConfig = localConfig ? cloneWheelConfig(localConfig) : getInitialWheelConfig()

      if (isCancelled) {
        return
      }

      setConfig(nextConfig)
      const nextHistory = reconcileHistoryForConfig(loadWheelHistory(nextConfig.wheel.id), nextConfig)
      const nextSessionState =
        loadWheelSessionState(getWheelFingerprint(nextConfig)) ?? createWheelSessionState(nextConfig)
      debugLogger.log('app', 'config_loaded', {
        source: localConfig ? 'local' : 'demo',
        config: getWheelSummary(nextConfig),
      })
      debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
      setHistory(nextHistory)
      setSessionState(nextSessionState)
      setPendingDecision(undefined)
      setIsConfigLoaded(true)
    }

    void loadInitialConfig()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isConfigLoaded) {
      return
    }

    void saveWheelConfig(config)
  }, [config, isConfigLoaded])

  useEffect(() => {
    saveWheelHistory(history)
  }, [history])

  useEffect(() => {
    if (!isConfigLoaded) {
      return
    }

    saveWheelSessionState(sessionState)
  }, [sessionState, isConfigLoaded])

  function commitConfig(nextConfig: WheelConfig) {
    setConfig(nextConfig)
    setHistory((currentHistory) => {
      const nextHistory = reconcileHistoryForConfig(currentHistory, nextConfig)
      debugLogger.log('history', 'reconcile', {
        before: getHistorySummary(currentHistory),
        after: getHistorySummary(nextHistory),
        config: getWheelSummary(nextConfig),
      })

      return nextHistory
    })
    setSessionState((currentSessionState) => {
      const nextSessionState = {
        wheelFingerprint: getWheelFingerprint(nextConfig),
        excludedOptions:
          currentSessionState.wheelFingerprint === getWheelFingerprint(nextConfig)
            ? currentSessionState.excludedOptions.filter((excludedOption) =>
                nextConfig.wheel.options.some((option) => option.id === excludedOption.optionId),
              )
            : [],
      }
      debugLogger.log('exclusion', 'active-count-changed', {
        activeCount: getActiveOptionCount(nextConfig.wheel.options, nextSessionState),
        totalCount: nextConfig.wheel.options.length,
      })

      return nextSessionState
    })
    setPendingDecision((currentDecision) =>
      currentDecision &&
      nextConfig.wheel.options.some((option) => option.id === currentDecision.option.id)
        ? currentDecision
        : undefined,
    )
    setStatusMessage(undefined)
  }

  function handleHistoryChange(nextHistory: WheelHistory) {
    setHistory(nextHistory)
  }

  function handleSessionChange(nextSessionState: WheelSessionState) {
    setSessionState(nextSessionState)
  }

  function applyImportedConfig(nextConfig: WheelConfig, message: string) {
    const clonedConfig = cloneWheelConfig(nextConfig)
    const nextHistory = reconcileHistoryForConfig(loadWheelHistory(clonedConfig.wheel.id), clonedConfig)
    const nextSessionState = createWheelSessionState(clonedConfig)

    setConfig(clonedConfig)
    debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
    setHistory(nextHistory)
    setSessionState(nextSessionState)
    setPendingDecision(undefined)
    setMode('spin')
    setStatusMessage({ kind: 'success', text: message })
    void saveWheelConfig(clonedConfig)
  }

  async function handleImportJson(file: File) {
    const text = await readFileAsText(file)
    const result = parseWheelConfigJson(text)

    if (!result.ok) {
      debugLogger.log('json', 'import_error', {
        fileName: file.name,
        fileSize: file.size,
        error: result.error,
      })
      setStatusMessage({ kind: 'error', text: result.error })
      return
    }

    debugLogger.log('json', 'import_success', {
      fileName: file.name,
      fileSize: file.size,
      config: getWheelSummary(result.value),
    })
    applyImportedConfig(result.value, 'JSON импортирован. Открыт режим барабана.')
  }

  function handleExportJson() {
    downloadJson(config)
    debugLogger.log('json', 'export_success', {
      config: getWheelSummary(config),
    })
    setStatusMessage({ kind: 'success', text: 'JSON экспортирован.' })
  }

  async function handleShareLink() {
    const shareUrl = getShareUrl(config)

    if (!shareUrl.ok) {
      debugLogger.log('share', 'create_error', {
        error: shareUrl.error,
        config: getWheelSummary(config),
      })
      setStatusMessage({ kind: 'error', text: shareUrl.error })
      return
    }

    debugLogger.log('share', 'create_success', {
      shareUrl: shareUrl.value,
      config: getWheelSummary(config),
    })
    try {
      await copyTextToClipboard(shareUrl.value)
      debugLogger.log('share', 'copy_success', {
        shareUrl: shareUrl.value,
      })
      setStatusMessage({
        kind: 'success',
        text: 'Ссылка скопирована. URL-картинки сохранены, локальные не входят в ссылку.',
      })
    } catch (error) {
      debugLogger.log('share', 'copy_error', {
        error: error instanceof Error ? error.message : 'unknown_error',
      })
      setStatusMessage({ kind: 'error', text: 'Не удалось скопировать ссылку.' })
    }
  }

  async function handleCopyDebugLog() {
    try {
      await copyTextToClipboard(debugLogger.formatEvents())
      debugLogger.log('app', 'debug_log_copy_success', {
        eventCount: debugLogger.getEvents().length,
      })
    } catch (error) {
      debugLogger.log('app', 'debug_log_copy_error', {
        error: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  async function handleCopyLastSpinReport() {
    const report = debugLogger.getLastSpinReport()

    if (!report) {
      return
    }

    try {
      await copyTextToClipboard(JSON.stringify(report, null, 2))
      debugLogger.log('app', 'spin_report_copy_success', {
        reportId: report.reportId,
      })
    } catch (error) {
      debugLogger.log('app', 'spin_report_copy_error', {
        error: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  async function handleCopyAllSpinReports() {
    try {
      await copyTextToClipboard(JSON.stringify(debugLogger.getSpinReports(), null, 2))
      debugLogger.log('app', 'spin_reports_copy_success', {
        reportCount: debugLogger.getSpinReports().length,
      })
    } catch (error) {
      debugLogger.log('app', 'spin_reports_copy_error', {
        error: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  function handleClearDebugLog() {
    debugLogger.clear()
  }

  function handleClearSpinReports() {
    debugLogger.clearSpinReports()
  }

  function handleDownloadDebugLog() {
    const fileName = createDownloadFileName('vertical-wheel-debug-log')
    downloadJsonFile(fileName, createDebugLogExport(debugLogger.getEvents()))
    debugLogger.log('app', 'debug_log_download_success', {
      eventCount: debugLogger.getEvents().length,
      fileName,
    })
  }

  function handleDownloadSpinReports() {
    const fileName = createDownloadFileName('vertical-wheel-spin-reports')
    downloadJsonFile(fileName, createSpinReportsExport(debugLogger.getSpinReports()))
    debugLogger.log('app', 'spin_reports_download_success', {
      reportCount: debugLogger.getSpinReports().length,
      fileName,
    })
  }

  function handleDownloadDiagnosticsBundle() {
    const fileName = createDownloadFileName('vertical-wheel-diagnostics-bundle')
    downloadJsonFile(
      fileName,
      createDiagnosticsBundle({
        events: debugLogger.getEvents(),
        spinReports: debugLogger.getSpinReports(),
        location: createLocationSummary(window.location),
        userAgent: window.navigator.userAgent,
      }),
    )
    debugLogger.log('app', 'diagnostics_bundle_download_success', {
      eventCount: debugLogger.getEvents().length,
      reportCount: debugLogger.getSpinReports().length,
      fileName,
    })
  }

  return (
    <main
      className={styles.page}
      data-theme={config.wheel.settings.theme}
      style={{ '--app-bg': config.wheel.settings.appBackgroundColor } as CSSProperties}
    >
      {mode === 'spin' ? (
        <SpinScreen
          config={config}
          history={history}
          onEdit={() => setMode('edit')}
          onHistoryChange={handleHistoryChange}
          onPendingDecisionChange={setPendingDecision}
          onSessionChange={handleSessionChange}
          pendingDecision={pendingDecision}
          sessionState={sessionState}
          validationMessages={validationMessages}
        />
      ) : (
        <EditScreen
          config={config}
          onConfigChange={commitConfig}
          onExportJson={handleExportJson}
          onImportJson={(file) => {
            void handleImportJson(file)
          }}
          onShareLink={() => {
            void handleShareLink()
          }}
          onStatus={setStatusMessage}
          onSpin={() => setMode('spin')}
          validationMessages={validationMessages}
        />
      )}
      {statusMessage ? (
        <ToastNotification
          message={statusMessage}
          onClose={closeToast}
        />
      ) : null}
      {isDebugEnabled ? (
        <DebugPanel
          events={debugEvents}
          spinReports={spinReports}
          onClear={handleClearDebugLog}
          onClearSpinReports={handleClearSpinReports}
          onCopy={() => {
            void handleCopyDebugLog()
          }}
          onCopyAllSpinReports={() => {
            void handleCopyAllSpinReports()
          }}
          onCopyLastSpinReport={() => {
            void handleCopyLastSpinReport()
          }}
          onDownloadBundle={handleDownloadDiagnosticsBundle}
          onDownloadDebugLog={handleDownloadDebugLog}
          onDownloadSpinReports={handleDownloadSpinReports}
        />
      ) : null}
    </main>
  )
}

export default App
