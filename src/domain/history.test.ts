import { describe, expect, it } from 'vitest'
import { demoWheelConfig } from './demoWheel'
import { addHistoryEntry, createHistoryEntry, reconcileHistoryForConfig } from './history'

describe('history logic', () => {
  it('keeps only the latest 10 entries', () => {
    let history = reconcileHistoryForConfig(undefined, demoWheelConfig)

    for (let index = 0; index < 12; index += 1) {
      history = addHistoryEntry(
        history,
        createHistoryEntry(demoWheelConfig.wheel.options[0], new Date(`2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`)),
      )
    }

    expect(history.entries).toHaveLength(10)
    expect(history.entries[0].createdAt).toBe('2026-01-12T00:00:00.000Z')
  })

  it('preserves history when only visual settings change', () => {
    const history = addHistoryEntry(
      reconcileHistoryForConfig(undefined, demoWheelConfig),
      createHistoryEntry(demoWheelConfig.wheel.options[0], new Date('2026-01-01T00:00:00.000Z')),
    )
    const visualChanged = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        settings: {
          ...demoWheelConfig.wheel.settings,
          pointerColor: '#000000',
        },
      },
    }

    expect(reconcileHistoryForConfig(history, visualChanged).entries).toHaveLength(1)
  })

  it('resets history when semantic option data changes', () => {
    const history = addHistoryEntry(
      reconcileHistoryForConfig(undefined, demoWheelConfig),
      createHistoryEntry(demoWheelConfig.wheel.options[0], new Date('2026-01-01T00:00:00.000Z')),
    )
    const semanticChanged = {
      ...demoWheelConfig,
      wheel: {
        ...demoWheelConfig.wheel,
        options: [
          { ...demoWheelConfig.wheel.options[0], title: 'Другое название' },
          ...demoWheelConfig.wheel.options.slice(1),
        ],
      },
    }

    expect(reconcileHistoryForConfig(history, semanticChanged).entries).toHaveLength(0)
  })
})
