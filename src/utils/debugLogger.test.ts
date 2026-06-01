import { describe, expect, it, vi } from 'vitest'
import { createDebugLogger, sanitizeDebugPayload } from './debugLogger'

describe('debug logger', () => {
  it('does not store events when disabled', () => {
    const logger = createDebugLogger(false)

    logger.log('app', 'ignored', { value: 'test' })

    expect(logger.getEvents()).toHaveLength(0)
  })

  it('stores events when enabled', () => {
    const logger = createDebugLogger(true)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    logger.log('app', 'started', { value: 'test' })

    expect(logger.getEvents()).toHaveLength(1)
    expect(logger.getEvents()[0]).toMatchObject({
      category: 'app',
      name: 'started',
      payload: { value: 'test' },
    })
    debug.mockRestore()
  })

  it('caps the ring buffer at 300 events', () => {
    const logger = createDebugLogger(true)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    for (let index = 0; index < 305; index += 1) {
      logger.log('spin', 'event', { index })
    }

    expect(logger.getEvents()).toHaveLength(300)
    expect(logger.getEvents()[0].payload).toEqual({ index: 5 })
    debug.mockRestore()
  })

  it('truncates large strings', () => {
    const sanitized = sanitizeDebugPayload({ text: 'a'.repeat(240) })

    expect(sanitized).toEqual({
      text: expect.stringContaining('[truncated, length=240]'),
    })
  })

  it('strips base64 image payloads', () => {
    const sanitized = sanitizeDebugPayload({
      image: {
        kind: 'data',
        value: `data:image/webp;base64,${'a'.repeat(400)}`,
      },
    })

    expect(sanitized).toEqual({
      image: {
        kind: 'data',
        approximateLength: 423,
        mimePrefix: 'data:image/webp',
      },
    })
  })
})
