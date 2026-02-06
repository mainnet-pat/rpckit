import type {
  FallbackTransport,
  Transport,
  TransportResponse,
} from '@rpckit/core'
import { fallback, shouldThrow } from '@rpckit/fallback'
import {
  fallback as electrumFallback,
  shouldThrow as electrumShouldThrow,
} from '@rpckit/fallback/electrum-cash'
import { describe, expect, it, vi } from 'vitest'

function mockTransport(overrides: Partial<Transport> = {}): Transport {
  return {
    url: 'mock://test',
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockRejectedValue(new Error('fail')),
    subscribe: vi.fn().mockRejectedValue(new Error('no subscriptions')),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('Fallback transport', () => {
  it('returns result from first successful transport', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('from-t1') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('from-t2') })

    const transport = fallback([t1, t2])
    expect(await transport.request('test')).toBe('from-t1')
    expect(t2.request).not.toHaveBeenCalled()
  })

  it('falls back to next transport on error', async () => {
    const t1 = mockTransport()
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('from-t2') })

    const transport = fallback([t1, t2])
    expect(await transport.request('test')).toBe('from-t2')
  })

  it('throws last error when all fail', async () => {
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('err1')),
    })
    const t2 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('err2')),
    })

    const transport = fallback([t1, t2])
    await expect(transport.request('test')).rejects.toThrow('err2')
  })

  it('stops immediately with shouldThrow', async () => {
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('fatal')),
    })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2], { shouldThrow: () => true })

    await expect(transport.request('test')).rejects.toThrow('fatal')
    expect(t2.request).not.toHaveBeenCalled()
  })

  it('default shouldThrow stops on deterministic JSON-RPC errors', async () => {
    const rpcError = Object.assign(new Error('Invalid params'), {
      code: -32602,
    })
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(rpcError),
    })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    // No shouldThrow option — uses the default
    const transport = fallback([t1, t2])

    await expect(transport.request('test')).rejects.toThrow('Invalid params')
    expect(t2.request).not.toHaveBeenCalled()
  })

  it('default shouldThrow falls through on transient errors', async () => {
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('connection refused')),
    })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2])

    expect(await transport.request('test')).toBe('ok')
  })

  it('delegates subscriptions to first supporting transport', async () => {
    const unsub = vi.fn()
    const t1 = mockTransport()
    const t2 = mockTransport({
      subscribe: vi.fn().mockResolvedValue(unsub),
    })

    const transport = fallback([t1, t2])
    const result = await transport.subscribe('sub', () => {})
    expect(result).toBe(unsub)
  })

  it('closes all transports', async () => {
    const t1 = mockTransport()
    const t2 = mockTransport()

    const transport = fallback([t1, t2])
    await transport.close()

    expect(t1.close).toHaveBeenCalled()
    expect(t2.close).toHaveBeenCalled()
  })

  it('eager connect resolves on first success', async () => {
    const order: string[] = []
    const t1 = mockTransport({
      connect: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              order.push('t1')
              resolve(undefined)
            }, 100),
          ),
      ),
    })
    const t2 = mockTransport({
      connect: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              order.push('t2')
              resolve(undefined)
            }, 10),
          ),
      ),
    })

    const transport = fallback([t1, t2], { eagerConnect: true })

    await transport.connect()

    // Should resolve after t2 (fastest), not wait for t1
    expect(order).toEqual(['t2'])

    // Wait for t1 to finish in background
    await new Promise((r) => setTimeout(r, 150))
    expect(order).toEqual(['t2', 't1'])

    await transport.close()
  })

  it('eager connect resolves even if some transports fail', async () => {
    const t1 = mockTransport({
      connect: vi.fn().mockRejectedValue(new Error('fail')),
    })
    const t2 = mockTransport({
      connect: vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve(undefined), 10)),
        ),
    })

    const transport = fallback([t1, t2], { eagerConnect: true })

    // Should not throw — t2 succeeds
    await transport.connect()

    await transport.close()
  })

  it('non-eager connect waits for all transports', async () => {
    const order: string[] = []
    const t1 = mockTransport({
      connect: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              order.push('t1')
              resolve(undefined)
            }, 50),
          ),
      ),
    })
    const t2 = mockTransport({
      connect: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              order.push('t2')
              resolve(undefined)
            }, 10),
          ),
      ),
    })

    const transport = fallback([t1, t2])

    await transport.connect()

    // Both should have completed
    expect(order).toContain('t1')
    expect(order).toContain('t2')

    await transport.close()
  })
})

describe('Fallback transport with ranking', () => {
  it('reorders transports by stability', async () => {
    // t1: failing, t2: healthy, t3: healthy
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('down')),
    })
    const t2 = mockTransport({
      request: vi.fn().mockResolvedValue('t2'),
    })
    const t3 = mockTransport({
      request: vi.fn().mockResolvedValue('t3'),
    })

    const transport = fallback([t1, t2, t3], {
      rank: {
        interval: 10_000,
        timeout: 200,
        sampleCount: 3,
        weights: { latency: 0.3, stability: 0.7 },
        ping: (t) => t.request('ping' as never),
      },
    })

    // Wait for first sample to complete
    await new Promise((r) => setTimeout(r, 50))

    // t1 (failing) should be demoted; t2 or t3 should be first
    const result = await transport.request('test')
    expect(result === 't2' || result === 't3').toBe(true)

    await transport.close()
  })

  it('uses custom ping function', async () => {
    const customPing = vi.fn().mockResolvedValue('pong')
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2], {
      rank: {
        interval: 10_000,
        timeout: 200,
        ping: customPing,
      },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(customPing).toHaveBeenCalledWith(t1)

    await transport.close()
  })

  it('demotes transport that starts failing', async () => {
    let t1Fail = false
    const t1 = mockTransport({
      request: vi
        .fn()
        .mockImplementation(() =>
          t1Fail ? Promise.reject(new Error('fail')) : Promise.resolve('t1'),
        ),
    })
    const t2 = mockTransport({
      request: vi.fn().mockResolvedValue('t2'),
    })

    const transport = fallback([t1, t2], {
      rank: {
        interval: 20,
        timeout: 200,
        sampleCount: 1,
        ping: (t) => t.request('ping' as never),
      },
    })

    // t1 starts failing immediately
    t1Fail = true

    // Let a sample complete
    await new Promise((r) => setTimeout(r, 50))

    // t2 should now be first since t1 has 0 stability
    expect(await transport.request('test')).toBe('t2')

    await transport.close()
  })

  it('rank: true without ping skips health probing', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2], { rank: true })

    await new Promise((r) => setTimeout(r, 50))
    // No pings should have been made (no ping function provided)
    expect(t1.request).not.toHaveBeenCalled()
    expect(t2.request).not.toHaveBeenCalled()
    // Still works for normal requests
    expect(await transport.request('test')).toBe('ok')

    await transport.close()
  })

  it('exposes scores property', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('down')),
    })

    const transport = fallback([t1, t2], {
      rank: {
        interval: 10_000,
        timeout: 200,
        sampleCount: 1,
        ping: (t) => t.request('ping' as never),
      },
    })

    // Initial scores before any sample
    expect(transport.scores).toHaveLength(2)

    // Wait for first sample
    await new Promise((r) => setTimeout(r, 50))

    expect(transport.scores).toHaveLength(2)
    // t1 healthy, t2 failing — t1 should have higher score
    // biome-ignore lint/style/noNonNullAssertion: verified by expect above
    const t1Score = transport.scores.find((s) => s.transport === t1)!
    // biome-ignore lint/style/noNonNullAssertion: verified by expect above
    const t2Score = transport.scores.find((s) => s.transport === t2)!
    expect(t1Score.stability).toBe(1)
    expect(t2Score.stability).toBe(0)
    expect(t1Score.score).toBeGreaterThan(t2Score.score)
    expect(t1Score.latency).toBeTypeOf('number')

    await transport.close()
  })

  it('onScores notifies listeners on score changes', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2], {
      rank: {
        interval: 10_000,
        timeout: 200,
        ping: (t) => t.request('ping' as never),
      },
    })

    const received: unknown[] = []
    const unsub = transport.onScores((scores) => {
      received.push(scores)
    })

    await new Promise((r) => setTimeout(r, 50))

    expect(received.length).toBeGreaterThanOrEqual(1)
    const scores = received[0] as Array<{ transport: Transport; score: number }>
    expect(scores).toHaveLength(2)
    expect(scores.map((s) => s.transport)).toContain(t1)
    expect(scores.map((s) => s.transport)).toContain(t2)

    await unsub()
    await transport.close()
  })

  it('onScores unsubscribe stops notifications', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2], {
      rank: {
        interval: 20,
        timeout: 200,
        ping: (t) => t.request('ping' as never),
      },
    })

    const received: unknown[] = []
    const unsub = transport.onScores((scores) => {
      received.push(scores)
    })

    await new Promise((r) => setTimeout(r, 30))
    await unsub()
    const countAfterUnsub = received.length

    await new Promise((r) => setTimeout(r, 60))
    expect(received.length).toBe(countAfterUnsub)

    await transport.close()
  })

  it('stops ranking on close', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2], {
      rank: { interval: 30, ping: (t) => t.request('ping' as never) },
    })

    // Let first sample run
    await new Promise((r) => setTimeout(r, 20))
    const callCount = (t1.request as ReturnType<typeof vi.fn>).mock.calls.length

    await transport.close()

    // Wait — no more pings should fire
    await new Promise((r) => setTimeout(r, 100))
    expect((t1.request as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callCount,
    )
  })
})

describe('Fallback transport unwrapping', () => {
  it('returns single transport unwrapped', () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1])

    expect(transport).toBe(t1)
  })
})

describe('Fallback transport onResponse', () => {
  it('notifies on successful request', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('result1') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('result2') })

    const transport = fallback([t1, t2]) as FallbackTransport

    const responses: TransportResponse[] = []
    transport.onResponse((info) => responses.push(info))

    await transport.request('test.method', 'param1')

    expect(responses).toHaveLength(1)
    expect(responses[0].method).toBe('test.method')
    expect(responses[0].params).toEqual(['param1'])
    expect(responses[0].transport).toBe(t1)
    expect(responses[0].response).toBe('result1')
    expect(responses[0].status).toBe('success')

    await transport.close()
  })

  it('notifies on failed request before fallback', async () => {
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('t1 failed')),
    })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('result2') })

    const transport = fallback([t1, t2]) as FallbackTransport

    const responses: TransportResponse[] = []
    transport.onResponse((info) => responses.push(info))

    await transport.request('test.method')

    expect(responses).toHaveLength(2)
    // First: t1 error
    expect(responses[0].transport).toBe(t1)
    expect(responses[0].status).toBe('error')
    expect(responses[0].error).toBeInstanceOf(Error)
    // Second: t2 success
    expect(responses[1].transport).toBe(t2)
    expect(responses[1].status).toBe('success')
    expect(responses[1].response).toBe('result2')

    await transport.close()
  })

  it('unsubscribe stops notifications', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = fallback([t1, t2]) as FallbackTransport

    const responses: TransportResponse[] = []
    const unsub = transport.onResponse((info) => responses.push(info))

    await transport.request('test1')
    expect(responses).toHaveLength(1)

    unsub()

    await transport.request('test2')
    expect(responses).toHaveLength(1) // No new notifications

    await transport.close()
  })
})

describe('shouldThrow', () => {
  it('returns true for JSON-RPC parse error (-32700)', () => {
    const error = Object.assign(new Error('Parse error'), { code: -32700 })
    expect(shouldThrow(error)).toBe(true)
  })

  it('returns true for JSON-RPC invalid request (-32600)', () => {
    const error = Object.assign(new Error('Invalid Request'), { code: -32600 })
    expect(shouldThrow(error)).toBe(true)
  })

  it('returns true for JSON-RPC invalid params (-32602)', () => {
    const error = Object.assign(new Error('Invalid params'), { code: -32602 })
    expect(shouldThrow(error)).toBe(true)
  })

  it('returns false for JSON-RPC internal error (-32603)', () => {
    const error = Object.assign(new Error('Internal error'), { code: -32603 })
    expect(shouldThrow(error)).toBe(false)
  })

  it('returns false for transient errors without code', () => {
    expect(shouldThrow(new Error('connection refused'))).toBe(false)
  })

  it('is composable with custom logic', () => {
    const custom = (error: Error) =>
      shouldThrow(error) || error.message.includes('revert')

    const rpcErr = Object.assign(new Error('Invalid params'), { code: -32602 })
    expect(custom(rpcErr)).toBe(true)

    const revertErr = new Error('execution revert')
    expect(custom(revertErr)).toBe(true)

    expect(custom(new Error('timeout'))).toBe(false)
  })
})

describe('Electrum Cash fallback variant', () => {
  it('rank: true defaults to server.ping', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = electrumFallback([t1, t2], { rank: true })

    await new Promise((r) => setTimeout(r, 50))
    // server.ping should have been called via the default ping function
    expect(t1.request).toHaveBeenCalledWith('server.ping')
    expect(t2.request).toHaveBeenCalledWith('server.ping')

    await transport.close()
  })

  it('rank config without ping defaults to server.ping', async () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({
      request: vi.fn().mockRejectedValue(new Error('down')),
    })

    const transport = electrumFallback([t1, t2], {
      rank: { interval: 10_000, timeout: 200, sampleCount: 1 },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(t1.request).toHaveBeenCalledWith('server.ping')

    await transport.close()
  })

  it('rank config with custom ping uses custom ping', async () => {
    const customPing = vi.fn().mockResolvedValue('pong')
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = electrumFallback([t1, t2], {
      rank: { interval: 10_000, timeout: 200, ping: customPing },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(customPing).toHaveBeenCalledWith(t1)
    // request should NOT have been called for pings since we use custom ping
    expect(t1.request).not.toHaveBeenCalled()

    await transport.close()
  })

  it('single transport returns unwrapped', () => {
    const t1 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })
    const transport = electrumFallback([t1])
    expect(transport).toBe(t1)
  })

  it('default shouldThrow stops on deterministic RPC error', async () => {
    const rpcError = Object.assign(
      new Error('No such mempool or blockchain transaction'),
      { code: -1 },
    )
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(rpcError),
    })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = electrumFallback([t1, t2])
    await expect(transport.request('test')).rejects.toThrow('No such mempool')
    expect(t2.request).not.toHaveBeenCalled()
  })

  it('default shouldThrow falls through on transient server errors', async () => {
    const warmupError = Object.assign(new Error('Server warming up'), {
      code: -28,
    })
    const t1 = mockTransport({
      request: vi.fn().mockRejectedValue(warmupError),
    })
    const t2 = mockTransport({ request: vi.fn().mockResolvedValue('ok') })

    const transport = electrumFallback([t1, t2])
    expect(await transport.request('test')).toBe('ok')
  })
})

describe('Electrum Cash shouldThrow', () => {
  it('throws for deterministic app errors (RPC_MISC_ERROR -1)', () => {
    const error = Object.assign(new Error('misc'), { code: -1 })
    expect(electrumShouldThrow(error)).toBe(true)
  })

  it('throws for invalid address (RPC_INVALID_ADDRESS_OR_KEY -5)', () => {
    const error = Object.assign(new Error('bad addr'), { code: -5 })
    expect(electrumShouldThrow(error)).toBe(true)
  })

  it('throws for verify rejected (RPC_VERIFY_REJECTED -26)', () => {
    const error = Object.assign(new Error('rejected'), { code: -26 })
    expect(electrumShouldThrow(error)).toBe(true)
  })

  it('throws for tx already in chain (RPC_VERIFY_ALREADY_IN_CHAIN -27)', () => {
    const error = Object.assign(new Error('already in chain'), { code: -27 })
    expect(electrumShouldThrow(error)).toBe(true)
  })

  it('throws for standard JSON-RPC invalid params (-32602)', () => {
    const error = Object.assign(new Error('invalid params'), { code: -32602 })
    expect(electrumShouldThrow(error)).toBe(true)
  })

  it('falls through on RPC_INTERNAL_ERROR (-32603)', () => {
    const error = Object.assign(new Error('internal'), { code: -32603 })
    expect(electrumShouldThrow(error)).toBe(false)
  })

  it('falls through on RPC_OUT_OF_MEMORY (-7)', () => {
    const error = Object.assign(new Error('oom'), { code: -7 })
    expect(electrumShouldThrow(error)).toBe(false)
  })

  it('falls through on RPC_DATABASE_ERROR (-20)', () => {
    const error = Object.assign(new Error('db error'), { code: -20 })
    expect(electrumShouldThrow(error)).toBe(false)
  })

  it('falls through on RPC_IN_WARMUP (-28)', () => {
    const error = Object.assign(new Error('warming up'), { code: -28 })
    expect(electrumShouldThrow(error)).toBe(false)
  })

  it('falls through on RPC_CLIENT_NOT_CONNECTED (-9)', () => {
    const error = Object.assign(new Error('not connected'), { code: -9 })
    expect(electrumShouldThrow(error)).toBe(false)
  })

  it('falls through on RPC_CLIENT_IN_INITIAL_DOWNLOAD (-10)', () => {
    const error = Object.assign(new Error('syncing'), { code: -10 })
    expect(electrumShouldThrow(error)).toBe(false)
  })

  it('falls through on transport errors without code', () => {
    expect(electrumShouldThrow(new Error('ECONNREFUSED'))).toBe(false)
  })
})
