import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import {
  getCyclicWheelRepeatCycles,
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
  calculateSpinOutcome,
  defaultSpinPhysicsConfig,
} from './domain/spinPhysics'
import { createShareHash, readShareConfigFromHash } from './domain/shareConfig'
import type {
  WheelConfig,
  WheelHistory,
  WheelOption,
  WheelSettings,
} from './domain/types'
import { WHEEL_LIMITS, WHEEL_SETTING_LIMITS } from './domain/types'
import { parseWheelConfigJson } from './domain/validation'
import { getWinningOption } from './domain/winningOption'
import {
  loadWheelHistory,
  saveWheelHistory,
} from './storage/historyStorage'
import { loadWheelConfig, saveWheelConfig } from './storage/wheelStorage'
import { debugLogger } from './utils/debugLogger'
import { compressImageFile, isSupportedImageFile } from './utils/imageCompression'
import styles from './App.module.css'

type AppMode = 'spin' | 'edit'
type NumberSettingKey = keyof typeof WHEEL_SETTING_LIMITS
type AppMessage = { kind: 'success' | 'error'; text: string }
type GestureState = {
  pointerId: number
  startY: number
  startPositionPx: number
  previousY: number
  previousTimeMs: number
  lastY: number
  lastTimeMs: number
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
  const { options } = config.wheel

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
}: {
  option: WheelOption
  settings: WheelSettings
  isActive: boolean
}) {
  const image = option.image

  return (
    <div
      className={styles.card}
      data-active={isActive}
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
  isInteractive,
  viewportRef,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: {
  config: WheelConfig
  positionPx: number
  transitionMs: number
  isInteractive: boolean
  viewportRef?: React.RefObject<HTMLDivElement | null>
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerEnd?: (event: PointerEvent<HTMLDivElement>) => void
}) {
  const [wheelHeightPx, setWheelHeightPx] = useState(360)
  const { settings, options } = config.wheel
  const cardStepPx = getCardStepPx(settings)
  const repeatCycles = getCyclicWheelRepeatCycles(
    options.length,
    defaultSpinPhysicsConfig.maxVirtualCardsToTravel,
  )
  const centerCycle = Math.floor(repeatCycles / 2)
  const baseOptionIndex = centerCycle * options.length
  const activeOption = options.length > 0 ? getWinningOption(options, positionPx, cardStepPx) : undefined
  const trackTranslatePx =
    wheelHeightPx / 2 -
    (baseOptionIndex * cardStepPx + settings.cardHeightPx / 2) -
    positionPx
  const repeatedOptions = useMemo(
    () =>
      Array.from({ length: repeatCycles }, (_, cycleIndex) =>
        options.map((option) => ({
          option,
          key: `${cycleIndex}-${option.id}`,
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
        <div
          className={styles.wheelTrack}
          style={
            {
              '--track-y': `${trackTranslatePx}px`,
              '--transition-ms': `${transitionMs}ms`,
            } as CSSProperties
          }
        >
          {repeatedOptions.map(({ option, key }) => (
            <WheelCard
              isActive={option.id === activeOption?.id}
              key={key}
              option={option}
              settings={settings}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SpinScreen({
  config,
  history,
  statusMessage,
  validationMessages,
  onHistoryChange,
  onEdit,
}: {
  config: WheelConfig
  history: WheelHistory
  statusMessage?: AppMessage
  validationMessages: string[]
  onHistoryChange: (history: WheelHistory) => void
  onEdit: () => void
}) {
  const [positionPx, setPositionPx] = useState(0)
  const [transitionMs, setTransitionMs] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<GestureState | null>(null)
  const animationTimerRef = useRef<number | undefined>(undefined)
  const pendingFinalPositionRef = useRef<number | undefined>(undefined)
  const pendingResultRef = useRef<WheelOption | undefined>(undefined)
  const isAnimatingRef = useRef(false)
  const positionRef = useRef(0)
  const lastResult = history.entries[0]
  const isValid = validationMessages.length === 0
  const cardStepPx = getCardStepPx(config.wheel.settings)

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
    }
  }, [])

  function finishAnimation() {
    const result = pendingResultRef.current
    const finalPositionPx = pendingFinalPositionRef.current ?? positionRef.current
    const normalizedPositionPx = normalizeCyclicWheelPosition(
      finalPositionPx,
      cardStepPx,
      config.wheel.options.length,
    )
    pendingResultRef.current = undefined
    pendingFinalPositionRef.current = undefined
    animationTimerRef.current = undefined
    setIsAnimating(false)
    setTransitionMs(0)
    setPositionPx(normalizedPositionPx)
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
  }

  function animateTo(finalPositionPx: number, durationMs: number, result?: WheelOption) {
    if (animationTimerRef.current !== undefined) {
      window.clearTimeout(animationTimerRef.current)
    }

    pendingResultRef.current = result
    pendingFinalPositionRef.current = finalPositionPx
    setIsAnimating(true)
    setTransitionMs(durationMs)
    setPositionPx(finalPositionPx)
    debugLogger.log('spin', 'animation_start', {
      finalPositionPx,
      durationMs,
      hasResult: Boolean(result),
    })
    animationTimerRef.current = window.setTimeout(finishAnimation, durationMs + 40)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isAnimatingRef.current || !isValid) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const timeMs = performance.now()
    const startPositionPx = normalizeCyclicWheelPosition(
      positionRef.current,
      cardStepPx,
      config.wheel.options.length,
    )
    setPositionPx(startPositionPx)
    debugLogger.log('spin', 'pointer_down', {
      pointerType: event.pointerType,
      startY: event.clientY,
      positionPx: startPositionPx,
    })
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPositionPx,
      previousY: event.clientY,
      previousTimeMs: timeMs,
      lastY: event.clientY,
      lastTimeMs: timeMs,
    }
    setTransitionMs(0)
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
      config.wheel.options.length,
    )
    const timeMs = performance.now()
    gesture.previousY = gesture.lastY
    gesture.previousTimeMs = gesture.lastTimeMs
    gesture.lastY = event.clientY
    gesture.lastTimeMs = timeMs
    setPositionPx(nextPositionPx)
  }

  function endGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return
    }

    gestureRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const dragDistancePx = Math.abs(event.clientY - gesture.startY)
    const timeDeltaMs = Math.max(gesture.lastTimeMs - gesture.previousTimeMs, 16)
    const pointerVelocityPxPerSec =
      ((gesture.lastY - gesture.previousY) / timeDeltaMs) * 1000
    const releaseVelocityPxPerSec = -pointerVelocityPxPerSec
    debugLogger.log('spin', 'pointer_up', {
      pointerType: event.pointerType,
      dragDistancePx,
      releaseVelocityPxPerSec,
      positionPx: positionRef.current,
    })
    const outcome = calculateSpinOutcome({
      currentPositionPx: positionRef.current,
      dragDistancePx,
      releaseVelocityPxPerSec,
      cardStepPx,
      jitterCards: getRandomJitterCards(),
    })
    const result =
      outcome.kind === 'spin'
        ? getWinningOption(config.wheel.options, outcome.finalPositionPx, cardStepPx)
        : undefined

    debugLogger.log('spin', outcome.kind === 'spin' ? 'valid_spin' : 'weak_gesture', {
      outcome,
      dragDistancePx,
      releaseVelocityPxPerSec,
    })

    if (result) {
      debugLogger.log('spin', 'result_selection', {
        result: getOptionSummary(result),
        finalPositionPx: outcome.finalPositionPx,
      })
    }

    animateTo(outcome.finalPositionPx, outcome.durationMs, result)
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

      {statusMessage ? (
        <div className={statusMessage.kind === 'error' ? styles.validationBox : styles.statusBox} role="status">
          {statusMessage.text}
        </div>
      ) : null}

      <WheelView
        config={config}
        isInteractive={isValid}
        onPointerDown={handlePointerDown}
        onPointerEnd={endGesture}
        onPointerMove={handlePointerMove}
        positionPx={positionPx}
        transitionMs={transitionMs}
        viewportRef={wheelRef}
      />

      <section className={styles.result} aria-live="polite">
        <span className={styles.resultLabel}>Последний результат</span>
        <strong>{lastResult ? lastResult.title : 'Проведите по барабану'}</strong>
        {lastResult?.subtitle ? <small>{lastResult.subtitle}</small> : null}
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

function EditScreen({
  config,
  validationMessages,
  onConfigChange,
  onExportJson,
  onImportJson,
  onShareLink,
  onStatus,
  onSpin,
  statusMessage,
}: {
  config: WheelConfig
  validationMessages: string[]
  onConfigChange: (config: WheelConfig) => void
  onExportJson: () => void
  onImportJson: (file: File) => void
  onShareLink: () => void
  onStatus: (message: AppMessage) => void
  onSpin: () => void
  statusMessage?: AppMessage
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

      {statusMessage ? (
        <div className={statusMessage.kind === 'error' ? styles.validationBox : styles.statusBox} role="status">
          {statusMessage.text}
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
    </article>
  )
}

function DebugPanel({
  events,
  onClear,
  onCopy,
}: {
  events: ReturnType<typeof debugLogger.getEvents>
  onClear: () => void
  onCopy: () => void
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
        <button type="button" onClick={onClear}>
          Очистить лог
        </button>
      </div>
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
  const [config, setConfig] = useState<WheelConfig>(() => getInitialWheelConfig())
  const [mode, setMode] = useState<AppMode>('spin')
  const [history, setHistory] = useState<WheelHistory>(() =>
    reconcileHistoryForConfig(loadWheelHistory(demoWheelConfig.wheel.id), demoWheelConfig),
  )
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [statusMessage, setStatusMessage] = useState<AppMessage | undefined>()
  const validationMessages = useMemo(() => validateEditableConfig(config), [config])

  useEffect(() => {
    return debugLogger.subscribe(() => {
      setIsDebugEnabled(debugLogger.isEnabled())
      setDebugEvents(debugLogger.getEvents())
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
        debugLogger.log('app', 'config_loaded', {
          source: localConfig ? 'local' : 'demo',
          config: getWheelSummary(nextConfig),
        })
        debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
        setHistory(nextHistory)
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
        const nextHistory = reconcileHistoryForConfig(loadWheelHistory(nextConfig.wheel.id), nextConfig)
        debugLogger.log('app', 'config_loaded', {
          source: 'share',
          config: getWheelSummary(nextConfig),
        })
        debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
        setHistory(nextHistory)
        setMode('spin')
        setStatusMessage({
          kind: 'success',
          text: 'Барабан из ссылки загружен. Картинки в ссылку не входят.',
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
      debugLogger.log('app', 'config_loaded', {
        source: localConfig ? 'local' : 'demo',
        config: getWheelSummary(nextConfig),
      })
      debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
      setHistory(nextHistory)
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
    setStatusMessage(undefined)
  }

  function handleHistoryChange(nextHistory: WheelHistory) {
    setHistory(nextHistory)
  }

  function applyImportedConfig(nextConfig: WheelConfig, message: string) {
    const clonedConfig = cloneWheelConfig(nextConfig)
    const nextHistory = reconcileHistoryForConfig(loadWheelHistory(clonedConfig.wheel.id), clonedConfig)

    setConfig(clonedConfig)
    debugLogger.log('history', 'reconcile', getHistorySummary(nextHistory))
    setHistory(nextHistory)
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
      setStatusMessage({ kind: 'success', text: 'Ссылка скопирована. Картинки в нее не входят.' })
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

  function handleClearDebugLog() {
    debugLogger.clear()
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
          statusMessage={statusMessage}
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
          statusMessage={statusMessage}
          validationMessages={validationMessages}
        />
      )}
      {isDebugEnabled ? (
        <DebugPanel
          events={debugEvents}
          onClear={handleClearDebugLog}
          onCopy={() => {
            void handleCopyDebugLog()
          }}
        />
      ) : null}
    </main>
  )
}

export default App
