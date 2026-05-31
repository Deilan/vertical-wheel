import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
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
import type {
  WheelConfig,
  WheelHistory,
  WheelOption,
  WheelSettings,
} from './domain/types'
import { WHEEL_LIMITS, WHEEL_SETTING_LIMITS } from './domain/types'
import { getWinningOption } from './domain/winningOption'
import {
  loadWheelHistory,
  saveWheelHistory,
} from './storage/historyStorage'
import styles from './App.module.css'

type AppMode = 'spin' | 'edit'
type NumberSettingKey = keyof typeof WHEEL_SETTING_LIMITS
type GestureState = {
  pointerId: number
  startY: number
  startPositionPx: number
  previousY: number
  previousTimeMs: number
  lastY: number
  lastTimeMs: number
}

const repeatCycles = 9
const centerCycle = Math.floor(repeatCycles / 2)
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

function WheelCard({
  option,
  settings,
  isActive,
}: {
  option: WheelOption
  settings: WheelSettings
  isActive: boolean
}) {
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
      <span className={styles.media} aria-hidden="true">
        {getOptionMedia(option)}
      </span>
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
    [options],
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
  validationMessages,
  onHistoryChange,
  onEdit,
}: {
  config: WheelConfig
  history: WheelHistory
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
    pendingResultRef.current = undefined
    animationTimerRef.current = undefined
    setIsAnimating(false)
    setTransitionMs(0)

    if (!result) {
      return
    }

    onHistoryChange(addHistoryEntry(history, createHistoryEntry(result)))
  }

  function animateTo(finalPositionPx: number, durationMs: number, result?: WheelOption) {
    if (animationTimerRef.current !== undefined) {
      window.clearTimeout(animationTimerRef.current)
    }

    pendingResultRef.current = result
    setIsAnimating(true)
    setTransitionMs(durationMs)
    setPositionPx(finalPositionPx)
    animationTimerRef.current = window.setTimeout(finishAnimation, durationMs + 40)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isAnimatingRef.current || !isValid) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const timeMs = performance.now()
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPositionPx: positionRef.current,
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
    const nextPositionPx = gesture.startPositionPx - (event.clientY - gesture.startY)
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

    animateTo(outcome.finalPositionPx, outcome.durationMs, result)
  }

  function handleClearHistory() {
    const nextHistory = clearHistory(config)
    saveWheelHistory(nextHistory)
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
  onSpin,
}: {
  config: WheelConfig
  validationMessages: string[]
  onConfigChange: (config: WheelConfig) => void
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
    updateWheel({
      settings: {
        ...wheel.settings,
        ...patch,
      },
    })
  }

  function updateOption(optionId: string, patch: Partial<WheelOption>) {
    updateWheel({
      options: wheel.options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option,
      ),
    })
  }

  function addOption() {
    if (wheel.options.length >= WHEEL_LIMITS.maxOptions) {
      return
    }

    updateWheel({
      options: [...wheel.options, createEmptyOption()],
    })
  }

  function deleteOption(optionId: string) {
    if (wheel.options.length <= WHEEL_LIMITS.minOptions) {
      return
    }

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
              onMoveDown={() => moveOption(option.id, 1)}
              onMoveUp={() => moveOption(option.id, -1)}
              onUpdate={(patch) => updateOption(option.id, patch)}
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
    </article>
  )
}

function App() {
  const [config, setConfig] = useState<WheelConfig>(() => cloneWheelConfig(demoWheelConfig))
  const [mode, setMode] = useState<AppMode>('spin')
  const [history, setHistory] = useState<WheelHistory>(() =>
    reconcileHistoryForConfig(loadWheelHistory(demoWheelConfig.wheel.id), demoWheelConfig),
  )
  const validationMessages = useMemo(() => validateEditableConfig(config), [config])

  useEffect(() => {
    saveWheelHistory(history)
  }, [history])

  function commitConfig(nextConfig: WheelConfig) {
    setConfig(nextConfig)
    setHistory((currentHistory) => reconcileHistoryForConfig(currentHistory, nextConfig))
  }

  function handleHistoryChange(nextHistory: WheelHistory) {
    setHistory(nextHistory)
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
          validationMessages={validationMessages}
        />
      ) : (
        <EditScreen
          config={config}
          onConfigChange={commitConfig}
          onSpin={() => setMode('spin')}
          validationMessages={validationMessages}
        />
      )}
    </main>
  )
}

export default App
