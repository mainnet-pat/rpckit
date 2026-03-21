import { webSocket } from '@rpckit/websocket'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock isows
// biome-ignore lint/suspicious/noExplicitAny: mock instances
const mockInstances: any[] = []
let autoConnect = true

vi.mock('isows', () => {
  const MockWebSocket = class {
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    sent: string[] = []
    readyState = 1
    url: string

    constructor(url: string) {
      this.url = url
      mockInstances.push(this)
      if (autoConnect) setTimeout(() => this.onopen?.(), 0)
    }

    send(data: string) {
      this.sent.push(data)
    }

    close() {
      this.onclose?.()
    }
  }
  return { WebSocket: MockWebSocket }
})

// biome-ignore lint/suspicious/noExplicitAny: mock return type
function lastWs(): any {
  return mockInstances[mockInstances.length - 1]
}

describe('WebSocket transport', () => {
  beforeEach(() => {
    mockInstances.length = 0
    autoConnect = true
  })

  it('sends a request and receives a response', async () => {
    const transport = webSocket({
      url: 'wss://test',
      batch: false,
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(1))

    const req = JSON.parse(lastWs().sent[0])
    expect(req.method).toBe('server.ping')

    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })

    expect(await promise).toBeNull()
    await transport.close()
  })

  it('handles subscription notifications', async () => {
    const transport = webSocket({
      url: 'wss://test',
      batch: false,
    })

    const received: unknown[] = []
    const unsub = await new Promise<() => void>((resolve) => {
      const subPromise = transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => {
          received.push(data)
        },
      )

      vi.waitFor(() => expect(lastWs().sent.length).toBe(1)).then(() => {
        const req = JSON.parse(lastWs().sent[0])
        lastWs().onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: { height: 100, hex: 'ab' },
            id: req.id,
          }),
        })
        subPromise.then(resolve)
      })
    })

    // Initial result delivered
    expect(received).toEqual([{ height: 100, hex: 'ab' }])

    // Notification
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 101, hex: 'cd' }],
      }),
    })
    await vi.waitFor(() =>
      expect(received).toEqual([
        { height: 100, hex: 'ab' },
        [{ height: 101, hex: 'cd' }],
      ]),
    )

    // Unsubscribe (base transport does local cleanup only, no unsubscribe request)
    await unsub()
    expect(lastWs().sent.length).toBe(1)

    await transport.close()
  })

  it('ignores empty messages', async () => {
    const transport = webSocket({
      url: 'wss://test-empty',
      batch: false,
    })

    const promise = transport.request('server.ping')
    await vi.waitFor(() => expect(lastWs().sent.length).toBe(1))

    // Empty message should not crash
    lastWs().onmessage?.({ data: '  ' })

    const req = JSON.parse(lastWs().sent[0])
    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })

    expect(await promise).toBeNull()
    await transport.close()
  })

  it('getSocket returns null before connect, socket after', async () => {
    const transport = webSocket({
      url: 'wss://test',
      batch: false,
    })

    // Before connection, getSocket returns null
    expect(transport.getSocket()).toBeNull()

    // After connecting, getSocket returns the socket
    await transport.connect()
    const socket = transport.getSocket()
    expect(socket).toBeTruthy()
    expect(socket?.url).toBe('wss://test')

    await transport.close()
  })

  it('getSocketAsync connects and returns socket', async () => {
    const transport = webSocket({
      url: 'wss://test',
      batch: false,
    })

    // getSocketAsync should connect and return the socket
    const socket = await transport.getSocketAsync()
    expect(socket).toBeTruthy()
    expect(socket.url).toBe('wss://test')

    await transport.close()
  })

  it('re-sends handshake on reconnect', async () => {
    const transport = webSocket({
      url: 'wss://test-reconnect',
      batch: false,
      handshake: { method: 'server.version', params: ['client', '1.0'] },
      reconnect: { delay: 10, attempts: 1 },
    })

    // Initial connection
    const promise = transport.request('server.ping')
    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )

    // Respond to handshake
    const handshake1 = JSON.parse(lastWs().sent[0])
    expect(handshake1.method).toBe('server.version')
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['ok'],
        id: handshake1.id,
      }),
    })

    // Respond to the actual request
    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req = JSON.parse(lastWs().sent[1])
    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })
    await promise

    const wsBeforeClose = lastWs()

    // Simulate disconnect — triggers reconnect
    wsBeforeClose.onclose?.()

    // Wait for new WebSocket to be created and handshake re-sent
    await vi.waitFor(() => {
      const ws = lastWs()
      return ws !== wsBeforeClose && ws.sent.length >= 1
    })

    const handshake2 = JSON.parse(lastWs().sent[0])
    expect(handshake2.method).toBe('server.version')
    expect(handshake2.params).toEqual(['client', '1.0'])

    // Complete handshake so transport settles
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['ok'],
        id: handshake2.id,
      }),
    })

    await transport.close()
  })

  it('lazy initialization - no socket created until first use', async () => {
    const initialCount = mockInstances.length

    // Creating transport should NOT create a WebSocket
    const transport = webSocket({
      url: 'wss://lazy-test',
      batch: false,
    })

    // No new WebSocket instances should be created
    expect(mockInstances.length).toBe(initialCount)

    // getSocket should return null before any connection
    expect(transport.getSocket()).toBeNull()

    // First request triggers connection
    const promise = transport.request('server.ping')

    // Now a WebSocket should be created and request sent
    await vi.waitFor(() => expect(lastWs()?.sent.length).toBe(1))
    expect(mockInstances.length).toBe(initialCount + 1)
    expect(lastWs().url).toBe('wss://lazy-test')

    // Complete the request
    const req = JSON.parse(lastWs().sent[0])
    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })
    await promise

    await transport.close()
  })

  it('rejects with connection timeout when socket does not connect', async () => {
    autoConnect = false

    const transport = webSocket({
      url: 'wss://slow-server',
      batch: false,
      connectTimeout: 50,
    })

    await expect(transport.connect()).rejects.toThrow('Connection timeout')
    await transport.close()
  })

  it('rejects with connection timeout when handshake stalls', async () => {
    // Socket connects, but server.version never gets a response
    const transport = webSocket({
      url: 'wss://stalled-handshake',
      batch: false,
      connectTimeout: 50,
      handshake: { method: 'server.version', params: ['client', '1.6'] },
    })

    await expect(transport.connect()).rejects.toThrow('Connection timeout')
    await transport.close()
  })

  it('subscription reuse delivers most recent notification to new subscribers', async () => {
    const transport = webSocket({
      url: 'wss://test-reuse',
      batch: false,
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // First subscriber
    const unsub1 = await new Promise<() => void>((resolve) => {
      const subPromise = transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => {
          received1.push(data)
        },
      )

      vi.waitFor(() => expect(lastWs().sent.length).toBe(1)).then(() => {
        const req = JSON.parse(lastWs().sent[0])
        lastWs().onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: { height: 100, hex: 'initial' },
            id: req.id,
          }),
        })
        subPromise.then(resolve)
      })
    })

    // First subscriber receives initial result
    expect(received1).toEqual([{ height: 100, hex: 'initial' }])

    // Simulate some notifications (time passes, new blocks come in)
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 101, hex: 'block101' }],
      }),
    })
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 102, hex: 'block102' }],
      }),
    })

    // First subscriber received notifications
    await vi.waitFor(() =>
      expect(received1).toEqual([
        { height: 100, hex: 'initial' },
        [{ height: 101, hex: 'block101' }],
        [{ height: 102, hex: 'block102' }],
      ]),
    )

    // Second subscriber taps into existing subscription
    // Should NOT send another subscribe request
    const sentBefore = lastWs().sent.length
    const unsub2 = await transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        received2.push(data)
      },
    )

    // No new request sent (reusing existing subscription)
    expect(lastWs().sent.length).toBe(sentBefore)

    // Second subscriber should get the most recent notification (block 102), NOT the stale initial result (block 100)
    expect(received2).toEqual([[{ height: 102, hex: 'block102' }]])

    // New notification should be delivered to both
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 103, hex: 'block103' }],
      }),
    })
    await vi.waitFor(() => {
      expect(received1).toHaveLength(4)
      expect(received2).toHaveLength(2)
    })
    expect(received1[3]).toEqual([{ height: 103, hex: 'block103' }])
    expect(received2[1]).toEqual([{ height: 103, hex: 'block103' }])

    await unsub1()
    await unsub2()
    await transport.close()
  })

  it('subscription reuse delivers initial result when no notifications received yet', async () => {
    const transport = webSocket({
      url: 'wss://test-reuse-no-notif',
      batch: false,
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // First subscriber
    const unsub1 = await new Promise<() => void>((resolve) => {
      const subPromise = transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => {
          received1.push(data)
        },
      )

      vi.waitFor(() => expect(lastWs().sent.length).toBe(1)).then(() => {
        const req = JSON.parse(lastWs().sent[0])
        lastWs().onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: { height: 100, hex: 'initial' },
            id: req.id,
          }),
        })
        subPromise.then(resolve)
      })
    })

    // First subscriber receives initial result
    expect(received1).toEqual([{ height: 100, hex: 'initial' }])

    // Second subscriber immediately (no notifications received yet)
    const unsub2 = await transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        received2.push(data)
      },
    )

    // Second subscriber should get the initial result (since no notifications yet)
    expect(received2).toEqual([{ height: 100, hex: 'initial' }])

    await unsub1()
    await unsub2()
    await transport.close()
  })

  it('subscription reuse with transformInitialResult does not double-transform lastNotification', async () => {
    // Simulates Electrum Cash pattern where:
    //   initial result from server: statusHash (raw value)
    //   transformInitialResult: (method, params, result) => [...params, ...result]
    //     → [scripthash, statusHash]
    //   notification from server: params = [scripthash, newStatusHash]
    //
    // Bug: when a second subscriber joins after a notification, lastNotification
    // (already [scripthash, newStatusHash]) was passed through transformInitialResult
    // again, producing [scripthash, [scripthash, newStatusHash]] instead of
    // [scripthash, newStatusHash].
    const transport = webSocket({
      url: 'wss://test-double-transform',
      batch: false,
      transformInitialResult: (_method, params, result) => [
        ...params,
        ...result,
      ],
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // First subscriber
    const unsub1 = await new Promise<() => void>((resolve) => {
      const subPromise = transport.subscribe(
        'blockchain.scripthash.subscribe',
        'scripthash_abc',
        (data) => {
          received1.push(data)
        },
      )

      vi.waitFor(() => expect(lastWs().sent.length).toBe(1)).then(() => {
        const req = JSON.parse(lastWs().sent[0])
        // Server returns raw status hash as initial result
        lastWs().onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: 'status_initial',
            id: req.id,
          }),
        })
        subPromise.then(resolve)
      })
    })

    // First subscriber gets transformed initial result: [scripthash, statusHash]
    expect(received1).toEqual([['scripthash_abc', 'status_initial']])

    // Notification arrives from server (already in [scripthash, status] format)
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.scripthash.subscribe',
        params: ['scripthash_abc', 'status_updated'],
      }),
    })

    await vi.waitFor(() =>
      expect(received1).toEqual([
        ['scripthash_abc', 'status_initial'],
        ['scripthash_abc', 'status_updated'],
      ]),
    )

    // Second subscriber joins existing subscription after notification
    const unsub2 = await transport.subscribe(
      'blockchain.scripthash.subscribe',
      'scripthash_abc',
      (data) => {
        received2.push(data)
      },
    )

    // Second subscriber should get lastNotification as-is: [scripthash, status]
    // NOT double-transformed: [scripthash, [scripthash, status]]
    expect(received2).toEqual([['scripthash_abc', 'status_updated']])

    await unsub1()
    await unsub2()
    await transport.close()
  })

  it('concurrent subscribes to same method+params send only one RPC request', async () => {
    const transport = webSocket({
      url: 'wss://test-concurrent-dedup',
      batch: false,
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // Launch two subscribes concurrently before the server responds
    const subPromise1 = transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => received1.push(data),
    )
    const subPromise2 = transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => received2.push(data),
    )

    // Wait for a message to be sent
    await vi.waitFor(() => expect(lastWs().sent.length).toBeGreaterThanOrEqual(1))

    // Only ONE RPC request should have been sent
    expect(lastWs().sent.length).toBe(1)

    // Respond to the single request
    const req = JSON.parse(lastWs().sent[0])
    expect(req.method).toBe('blockchain.headers.subscribe')
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: { height: 200, hex: 'aa' },
        id: req.id,
      }),
    })

    const [unsub1, unsub2] = await Promise.all([subPromise1, subPromise2])

    // Both subscribers should have received the initial result
    expect(received1).toEqual([{ height: 200, hex: 'aa' }])
    expect(received2).toEqual([{ height: 200, hex: 'aa' }])

    // Subsequent notifications go to both
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 201, hex: 'bb' }],
      }),
    })
    await vi.waitFor(() => {
      expect(received1).toHaveLength(2)
      expect(received2).toHaveLength(2)
    })

    // Still only one RPC request total
    expect(lastWs().sent.length).toBe(1)

    await unsub1()
    await unsub2()
    await transport.close()
  })

  it('unsubscribing one listener keeps subscription alive for remaining listeners', async () => {
    const transport = webSocket({
      url: 'wss://test-partial-unsub',
      batch: false,
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // First subscriber
    const unsub1 = await new Promise<() => Promise<void>>((resolve) => {
      const subPromise = transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => received1.push(data),
      )

      vi.waitFor(() => expect(lastWs().sent.length).toBe(1)).then(() => {
        const req = JSON.parse(lastWs().sent[0])
        lastWs().onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: { height: 300 },
            id: req.id,
          }),
        })
        subPromise.then(resolve)
      })
    })

    // Second subscriber
    const unsub2 = await transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => received2.push(data),
    )

    // Unsubscribe the first listener
    await unsub1()

    // Notification should still reach the second listener
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 301 }],
      }),
    })

    // First listener should NOT receive the notification (already unsubscribed)
    await vi.waitFor(() => expect(received2).toHaveLength(2))
    expect(received1).toEqual([{ height: 300 }])
    expect(received2[1]).toEqual([{ height: 301 }])

    await unsub2()
    await transport.close()
  })

  it('onUnsubscribe is called only when the last listener unsubscribes', async () => {
    const onUnsubscribe = vi.fn()
    const transport = webSocket({
      url: 'wss://test-on-unsub',
      batch: false,
      onUnsubscribe,
    })

    // First subscriber
    const unsub1 = await new Promise<() => Promise<void>>((resolve) => {
      const subPromise = transport.subscribe(
        'blockchain.headers.subscribe',
        () => {},
      )

      vi.waitFor(() => expect(lastWs().sent.length).toBe(1)).then(() => {
        const req = JSON.parse(lastWs().sent[0])
        lastWs().onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: { height: 400 },
            id: req.id,
          }),
        })
        subPromise.then(resolve)
      })
    })

    // Second subscriber
    const unsub2 = await transport.subscribe(
      'blockchain.headers.subscribe',
      () => {},
    )

    // Unsubscribe first — onUnsubscribe should NOT fire
    await unsub1()
    expect(onUnsubscribe).not.toHaveBeenCalled()

    // Unsubscribe last — onUnsubscribe SHOULD fire
    await unsub2()
    expect(onUnsubscribe).toHaveBeenCalledOnce()

    await transport.close()
  })

  it('different params create separate subscriptions', async () => {
    const transport = webSocket({
      url: 'wss://test-different-params',
      batch: false,
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // Subscribe with params ['addr1']
    const subPromise1 = transport.subscribe(
      'blockchain.scripthash.subscribe',
      'addr1',
      (data) => received1.push(data),
    )

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(1))
    const req1 = JSON.parse(lastWs().sent[0])
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: 'status1',
        id: req1.id,
      }),
    })
    const unsub1 = await subPromise1

    // Subscribe with params ['addr2'] — should send a SECOND RPC request
    const subPromise2 = transport.subscribe(
      'blockchain.scripthash.subscribe',
      'addr2',
      (data) => received2.push(data),
    )

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req2 = JSON.parse(lastWs().sent[1])
    expect(req2.params).toEqual(['addr2'])
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: 'status2',
        id: req2.id,
      }),
    })
    const unsub2 = await subPromise2

    // Two separate RPC requests were sent
    expect(lastWs().sent.length).toBe(2)

    expect(received1).toEqual(['status1'])
    expect(received2).toEqual(['status2'])

    await unsub1()
    await unsub2()
    await transport.close()
  })

  it('transformInitialResult returning undefined suppresses delivery', async () => {
    const transport = webSocket({
      url: 'wss://test-suppress',
      batch: false,
      // Simulate Ethereum-style subscription where initial result is subscription ID
      transformInitialResult: () => undefined,
    })

    const received: unknown[] = []
    let unsub: (() => Promise<void>) | undefined

    await new Promise<void>((resolve) => {
      const subPromise = transport.subscribe(
        'eth_subscribe',
        'newHeads',
        (data) => {
          received.push(data)
        },
      )

      vi.waitFor(() => expect(lastWs().sent.length).toBe(1)).then(() => {
        const req = JSON.parse(lastWs().sent[0])
        // Server returns subscription ID as initial result
        lastWs().onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            result: '0xabc123',
            id: req.id,
          }),
        })
        subPromise.then((u) => {
          unsub = u
          resolve()
        })
      })
    })

    // Initial result should NOT be delivered (transformInitialResult returned undefined)
    expect(received).toEqual([])

    // Notification should still be delivered
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_subscribe',
        params: [{ number: '0x100' }],
      }),
    })
    await vi.waitFor(() => expect(received).toEqual([[{ number: '0x100' }]]))

    await unsub?.()
    await transport.close()
  })
})
