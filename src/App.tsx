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
import type { WheelHistory, WheelOption } from './domain/types'
import { getWinningOption } from './domain/winningOption'
import {
  loadWheelHistory,
  saveWheelHistory,
} from './storage/historyStorage'
import styles from './App.module.css'

const wheelConfig = demoWheelConfig
const wheel = wheelConfig.wheel
const repeatCycles = 9
const centerCycle = Math.floor(repeatCycles / 2)
const repeatedOptions = Array.from({ length: repeatCycles }, (_, cycleIndex) =>
  wheel.options.map((option) => ({
    option,
    key: `${cycleIndex}-${option.id}`,
  })),
).flat()
const baseOptionIndex = centerCycle * wheel.options.length
const cardStepPx = wheel.settings.cardHeightPx + wheel.settings.cardGapPx
const historyDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

type GestureState = {
  pointerId: number
  startY: number
  startPositionPx: number
  previousY: number
  previousTimeMs: number
  lastY: number
  lastTimeMs: number
}

function loadInitialHistory(): WheelHistory {
  return reconcileHistoryForConfig(loadWheelHistory(wheel.id), wheelConfig)
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

  return option.emoji ?? '•'
}

function App() {
  const [positionPx, setPositionPx] = useState(0)
  const [transitionMs, setTransitionMs] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [history, setHistory] = useState(loadInitialHistory)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [wheelHeightPx, setWheelHeightPx] = useState(360)
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<GestureState | null>(null)
  const animationTimerRef = useRef<number | undefined>(undefined)
  const pendingResultRef = useRef<WheelOption | undefined>(undefined)
  const isAnimatingRef = useRef(false)
  const positionRef = useRef(0)

  const trackTranslatePx =
    wheelHeightPx / 2 -
    (baseOptionIndex * cardStepPx + wheel.settings.cardHeightPx / 2) -
    positionPx
  const activeOption = useMemo(
    () => getWinningOption(wheel.options, positionPx, cardStepPx),
    [positionPx],
  )
  const lastResult = history.entries[0]

  useEffect(() => {
    positionRef.current = positionPx
  }, [positionPx])

  useEffect(() => {
    isAnimatingRef.current = isAnimating
  }, [isAnimating])

  useEffect(() => {
    const element = wheelRef.current

    if (!element) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      setWheelHeightPx(entry.contentRect.height)
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    saveWheelHistory(history)
  }, [history])

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

    const entry = createHistoryEntry(result)
    setHistory((currentHistory) => addHistoryEntry(currentHistory, entry))
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
    if (isAnimatingRef.current) {
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
        ? getWinningOption(wheel.options, outcome.finalPositionPx, cardStepPx)
        : undefined

    animateTo(outcome.finalPositionPx, outcome.durationMs, result)
  }

  function handleClearHistory() {
    const nextHistory = clearHistory(wheelConfig)
    saveWheelHistory(nextHistory)
    setHistory(nextHistory)
  }

  return (
    <main className={styles.page}>
      <section className={styles.screen} aria-labelledby="wheel-title">
        <header className={styles.header}>
          <p className={styles.kicker}>Вертикальный барабан</p>
          <h1 id="wheel-title">{wheel.title}</h1>
          {wheel.description ? (
            <p className={styles.description}>{wheel.description}</p>
          ) : null}
        </header>

        <div className={styles.wheelShell}>
          <div
            className={styles.pointer}
            style={{ '--pointer-color': wheel.settings.pointerColor } as CSSProperties}
            aria-hidden="true"
          />
          <div
            ref={wheelRef}
            className={styles.wheelViewport}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            aria-label="Барабан выбора. Проведите вверх или вниз, чтобы запустить вращение."
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
                <div
                  className={styles.card}
                  data-active={option.id === activeOption.id}
                  key={key}
                  style={
                    {
                      '--card-bg': option.backgroundColor,
                      '--card-text': option.textColor,
                      '--card-height': `${wheel.settings.cardHeightPx}px`,
                      '--card-gap': `${wheel.settings.cardGapPx}px`,
                      '--card-radius': `${wheel.settings.cardBorderRadiusPx}px`,
                      '--image-size': `${wheel.settings.imageSizePx}px`,
                      '--title-size': `${wheel.settings.titleFontSizePx}px`,
                      '--subtitle-size': `${wheel.settings.subtitleFontSizePx}px`,
                    } as CSSProperties
                  }
                >
                  <span className={styles.media} aria-hidden="true">
                    {getOptionMedia(option)}
                  </span>
                  <span className={styles.cardText}>
                    <strong>{option.title}</strong>
                    {option.subtitle ? <small>{option.subtitle}</small> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className={styles.result} aria-live="polite">
          <span className={styles.resultLabel}>Последний результат</span>
          <strong>{lastResult ? lastResult.title : 'Проведите по барабану'}</strong>
          {lastResult?.subtitle ? <small>{lastResult.subtitle}</small> : null}
        </section>

        <section className={styles.history}>
          <button
            className={styles.historyToggle}
            type="button"
            onClick={() => setIsHistoryOpen((isOpen) => !isOpen)}
            aria-expanded={isHistoryOpen}
          >
            История ({history.entries.length})
          </button>

          {isHistoryOpen ? (
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
                  <button
                    className={styles.clearButton}
                    type="button"
                    onClick={handleClearHistory}
                  >
                    Очистить историю
                  </button>
                </>
              ) : (
                <p className={styles.emptyHistory}>История пока пустая.</p>
              )}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  )
}

export default App
