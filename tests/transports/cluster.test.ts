import { cluster } from '@rpckit/cluster'
import type {
  ClusterTransport,
  Transport,
  TransportResponse,
  Unsubscribe,
} from '@rpckit/core'
import { describe, expect, it, vi } from 'vitest'

function mockTransport(result: unknown, delay = 0): Transport {
  return {
    url: 'mock://test',
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(result), delay)),
      ),
    subscribe: vi.fn().mockRejectedValue(new Error('no subscriptions')),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function failingTransport(err: string = 'fail'): Transport {
  return {
    url: 'mock://fail',
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockRejectedValue(new Error(err)),
    subscribe: vi.fn().mockRejectedValue(new Error('no subscriptions')),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function subscribingTransport(
  initialResult: unknown,
  _notifications: unknown[] = [],
): Transport & { triggerNotification: (data: unknown) => void } {
  let onData: ((data: unknown) => void) | null = null
  const _notificationIndex = 0

  return {
    url: 'mock://sub',
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockImplementation(async (_method, ...args) => {
      const callback = args.pop() as (data: unknown) => void
      onData = callback
      // Deliver initial result
      callback(initialResult)
      const unsub: Unsubscribe = vi.fn().mockResolvedValue(undefined)
      return unsub
    }),
    close: vi.fn().mockResolvedValue(undefined),
    triggerNotification: (data: unknown) => {
      onData?.(data)
    },
  }
}

describe('Cluster transport', () => {
  it('resolves when quorum is reached with identical results', async () => {
    const t1 = mockTransport(42)
    const t2 = mockTransport(42)
    const t3 = mockTransport(99)

    const transport = cluster([t1, t2, t3], { quorum: 2 })
    expect(await transport.request('test')).toBe(42)
  })

  it('resolves with deep equal objects', async () => {
    const obj = { height: 100, hex: 'ab' }
    const t1 = mockTransport({ ...obj })
    const t2 = mockTransport({ ...obj })
    const t3 = mockTransport({ height: 999, hex: 'zz' })

    const transport = cluster([t1, t2, t3], { quorum: 2 })
    expect(await transport.request('test')).toEqual(obj)
  })

  it('rejects when quorum not reachable', async () => {
    const t1 = mockTransport(1)
    const t2 = mockTransport(2)
    const t3 = mockTransport(3)

    const transport = cluster([t1, t2, t3], { quorum: 2, timeout: 5000 })
    await expect(transport.request('test')).rejects.toThrow(
      'quorum not reached',
    )
  })

  it('rejects early when too many errors', async () => {
    const t1 = failingTransport()
    const t2 = failingTransport()
    const t3 = mockTransport(42, 1000)

    const transport = cluster([t1, t2, t3], { quorum: 2, timeout: 5000 })
    await expect(transport.request('test')).rejects.toThrow(
      'quorum not reachable',
    )
  })

  it('closes all transports', async () => {
    const t1 = mockTransport(1)
    const t2 = mockTransport(1)

    const transport = cluster([t1, t2], { quorum: 2 })
    await transport.close()

    expect(t1.close).toHaveBeenCalled()
    expect(t2.close).toHaveBeenCalled()
  })

  describe('subscriptions', () => {
    it('reaches quorum on initial subscription result', async () => {
      const t1 = subscribingTransport('status-hash-abc')
      const t2 = subscribingTransport('status-hash-abc')
      const t3 = subscribingTransport('status-hash-different')

      const transport = cluster([t1, t2, t3], { quorum: 2 })

      const received: unknown[] = []
      const unsub = await transport.subscribe(
        'blockchain.address.subscribe',
        'addr1',
        (data) => {
          received.push(data)
        },
      )

      expect(received).toEqual(['status-hash-abc'])
      await unsub()
    })

    it('reaches quorum on notifications', async () => {
      const t1 = subscribingTransport('initial')
      const t2 = subscribingTransport('initial')
      const t3 = subscribingTransport('initial')

      const transport = cluster([t1, t2, t3], { quorum: 2 })

      const received: unknown[] = []
      await transport.subscribe(
        'blockchain.address.subscribe',
        'addr1',
        (data) => {
          received.push(data)
        },
      )

      // Initial result
      expect(received).toEqual(['initial'])

      // Send notifications - need 2 of 3 to agree
      t1.triggerNotification('new-status')
      expect(received).toEqual(['initial']) // Not yet quorum

      t2.triggerNotification('new-status')
      expect(received).toEqual(['initial', 'new-status']) // Quorum reached

      // Third one doesn't trigger again
      t3.triggerNotification('new-status')
      expect(received).toEqual(['initial', 'new-status'])
    })

    it('rejects when initial subscription quorum not reached', async () => {
      const t1 = subscribingTransport('a')
      const t2 = subscribingTransport('b')
      const t3 = subscribingTransport('c')

      const transport = cluster([t1, t2, t3], { quorum: 2, timeout: 100 })

      await expect(transport.subscribe('test', () => {})).rejects.toThrow(
        'quorum not reached',
      )
    })
  })

  describe('quorum validation', () => {
    it('throws if quorum is less than 1', () => {
      const t1 = mockTransport(1)

      expect(() => cluster([t1], { quorum: 0 })).toThrow(
        'Quorum must be at least 1',
      )
    })

    it('throws if quorum exceeds number of transports', () => {
      const t1 = mockTransport(1)
      const t2 = mockTransport(1)

      expect(() => cluster([t1, t2], { quorum: 3 })).toThrow(
        'Quorum 3 exceeds number of transports (2)',
      )
    })
  })

  it('returns single transport unwrapped', () => {
    const t1 = mockTransport(42)

    const transport = cluster([t1], { quorum: 1 })

    expect(transport).toBe(t1)
  })
})

describe('Cluster transport onResponse', () => {
  it('notifies on all transport responses', async () => {
    const t1 = mockTransport(42)
    const t2 = mockTransport(42)
    const t3 = mockTransport(99)

    const transport = cluster([t1, t2, t3], { quorum: 2 }) as ClusterTransport

    const responses: TransportResponse[] = []
    transport.onResponse((info) => responses.push(info))

    await transport.request('test.method', 'param1')

    // All 3 transports should have responded
    expect(responses.length).toBeGreaterThanOrEqual(2)
    expect(responses.every((r) => r.method === 'test.method')).toBe(true)
    expect(responses.every((r) => r.status === 'success')).toBe(true)

    await transport.close()
  })

  it('notifies on transport errors', async () => {
    const t1 = failingTransport('error1')
    const t2 = mockTransport(42)
    const t3 = mockTransport(42)

    const transport = cluster([t1, t2, t3], { quorum: 2 }) as ClusterTransport

    const responses: TransportResponse[] = []
    transport.onResponse((info) => responses.push(info))

    await transport.request('test.method')

    const errors = responses.filter((r) => r.status === 'error')
    const successes = responses.filter((r) => r.status === 'success')

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(successes.length).toBeGreaterThanOrEqual(2)

    await transport.close()
  })

  it('unsubscribe stops notifications', async () => {
    const t1 = mockTransport(42)
    const t2 = mockTransport(42)

    const transport = cluster([t1, t2], { quorum: 2 }) as ClusterTransport

    const responses: TransportResponse[] = []
    const unsub = transport.onResponse((info) => responses.push(info))

    await transport.request('test1')
    const countAfterFirst = responses.length

    unsub()

    await transport.request('test2')
    expect(responses.length).toBe(countAfterFirst) // No new notifications

    await transport.close()
  })

  it('exposes transports property', () => {
    const t1 = mockTransport(42)
    const t2 = mockTransport(42)

    const transport = cluster([t1, t2], { quorum: 2 }) as ClusterTransport

    expect(transport.transports).toHaveLength(2)
    expect(transport.transports).toContain(t1)
    expect(transport.transports).toContain(t2)
  })
})
