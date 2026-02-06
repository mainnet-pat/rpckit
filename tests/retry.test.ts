import { withRetry } from '@rpckit/core'
import { describe, expect, it, vi } from 'vitest'

describe('withRetry', () => {
  it('returns result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await withRetry(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success')

    const result = await withRetry(fn, { retryCount: 3, retryDelay: 10 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))

    await expect(
      withRetry(fn, { retryCount: 2, retryDelay: 10 }),
    ).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('uses exponential backoff', async () => {
    const timestamps: number[] = []
    const fn = vi.fn().mockImplementation(() => {
      timestamps.push(Date.now())
      return Promise.reject(new Error('fail'))
    })

    await expect(
      withRetry(fn, { retryCount: 2, retryDelay: 50 }),
    ).rejects.toThrow()

    expect(timestamps.length).toBe(3)
    // First retry: ~50ms, Second retry: ~100ms (exponential)
    const delay1 = timestamps[1] - timestamps[0]
    const delay2 = timestamps[2] - timestamps[1]
    expect(delay1).toBeGreaterThanOrEqual(40) // ~50ms
    expect(delay1).toBeLessThan(100)
    expect(delay2).toBeGreaterThanOrEqual(90) // ~100ms
    expect(delay2).toBeLessThan(200)
  })

  it('uses default values', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('respects retryCount of 0', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    await expect(withRetry(fn, { retryCount: 0 })).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(1) // No retries
  })
})
