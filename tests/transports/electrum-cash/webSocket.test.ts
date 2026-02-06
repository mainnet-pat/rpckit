import { webSocket } from '@rpckit/websocket/electrum-cash'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock isows
// biome-ignore lint/suspicious/noExplicitAny: mock instances
const mockInstances: any[] = []

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
      setTimeout(() => this.onopen?.(), 0)
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

describe('Electrum Cash WebSocket transport', () => {
  beforeEach(() => {
    mockInstances.length = 0
  })

  it('sends server.version handshake on connect', async () => {
    const transport = webSocket({
      url: 'wss://electrum-ws-handshake',
      batch: false,
    })

    const promise = transport.request('blockchain.headers.subscribe')

    // Wait for handshake to be sent
    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastWs().sent[0])
    expect(handshake.method).toBe('server.version')
    expect(handshake.params).toEqual(['rpckit', '1.6'])

    // Respond to handshake
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Fulcrum', '1.6'],
        id: handshake.id,
      }),
    })

    // Wait for the actual request to be sent after handshake
    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req = JSON.parse(lastWs().sent[1])
    expect(req.method).toBe('blockchain.headers.subscribe')

    // Respond to the request
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: { height: 100 },
        id: req.id,
      }),
    })

    expect(await promise).toEqual({ height: 100 })
    await transport.close()
  })

  it('uses custom protocolVersion in handshake', async () => {
    const transport = webSocket({
      url: 'wss://electrum-ws-version',
      batch: false,
      protocolVersion: '1.5',
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastWs().sent[0])
    expect(handshake.method).toBe('server.version')
    expect(handshake.params).toEqual(['rpckit', '1.5'])

    // Respond to handshake
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Fulcrum', '1.5'],
        id: handshake.id,
      }),
    })

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req = JSON.parse(lastWs().sent[1])

    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })

    expect(await promise).toBeNull()
    await transport.close()
  })

  it('normalizes keepAlive number to PingConfig with server.ping', async () => {
    vi.useFakeTimers()

    const transport = webSocket({
      url: 'wss://electrum-ws-keepalive',
      batch: false,
      keepAlive: 30000,
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )

    // Respond to handshake
    const handshake = JSON.parse(lastWs().sent[0])
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Fulcrum', '1.6'],
        id: handshake.id,
      }),
    })

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req = JSON.parse(lastWs().sent[1])
    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })
    await promise

    // Advance timers to trigger keepAlive
    const sentBefore = lastWs().sent.length
    await vi.advanceTimersByTimeAsync(30000)

    // A server.ping keepAlive should have been sent
    expect(lastWs().sent.length).toBe(sentBefore + 1)
    const ping = JSON.parse(lastWs().sent[lastWs().sent.length - 1])
    expect(ping.method).toBe('server.ping')

    await transport.close()
    vi.useRealTimers()
  })

  it('fills method in PingConfig if missing', async () => {
    vi.useFakeTimers()

    const transport = webSocket({
      url: 'wss://electrum-ws-keepalive-config',
      batch: false,
      keepAlive: { interval: 15000 },
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastWs().sent[0])
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Fulcrum', '1.6'],
        id: handshake.id,
      }),
    })

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req = JSON.parse(lastWs().sent[1])
    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })
    await promise

    const sentBefore = lastWs().sent.length
    await vi.advanceTimersByTimeAsync(15000)

    expect(lastWs().sent.length).toBe(sentBefore + 1)
    const ping = JSON.parse(lastWs().sent[lastWs().sent.length - 1])
    expect(ping.method).toBe('server.ping')

    await transport.close()
    vi.useRealTimers()
  })

  it('sends unsubscribe request using method.replace convention', async () => {
    const transport = webSocket({
      url: 'wss://electrum-ws-unsub',
      batch: false,
    })

    const received: unknown[] = []
    const subPromise = transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        received.push(data)
      },
    )

    // Wait for handshake
    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )
    const handshake = JSON.parse(lastWs().sent[0])
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Fulcrum', '1.6'],
        id: handshake.id,
      }),
    })

    // Wait for subscribe request
    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const subReq = JSON.parse(lastWs().sent[1])
    expect(subReq.method).toBe('blockchain.headers.subscribe')

    // Respond to subscribe
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: { height: 100, hex: 'ab' },
        id: subReq.id,
      }),
    })

    const unsub = await subPromise
    // transformInitialResult wraps as [...params, result]; params=[] so result is [{ height: 100, hex: 'ab' }]
    expect(received).toEqual([[{ height: 100, hex: 'ab' }]])

    // Unsubscribe — should send blockchain.headers.unsubscribe
    const unsubPromise = unsub()

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(3))
    const unsubReq = JSON.parse(lastWs().sent[2])
    expect(unsubReq.method).toBe('blockchain.headers.unsubscribe')
    expect(unsubReq.params).toEqual([])

    // Respond to unsubscribe
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: true,
        id: unsubReq.id,
      }),
    })

    await unsubPromise
    await transport.close()
  })

  it('accepts url string overload', async () => {
    const transport = webSocket('wss://electrum-ws-string', { batch: false })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastWs().sent[0])
    expect(handshake.method).toBe('server.version')
    expect(handshake.params).toEqual(['rpckit', '1.6'])

    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Fulcrum', '1.6'],
        id: handshake.id,
      }),
    })

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req = JSON.parse(lastWs().sent[1])
    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })

    expect(await promise).toBeNull()
    await transport.close()
  })

  it('does not send unsubscribe when other listeners remain', async () => {
    const transport = webSocket({
      url: 'wss://electrum-ws-multi-unsub',
      batch: false,
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // First subscriber
    const subPromise1 = transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        received1.push(data)
      },
    )

    // Wait for handshake
    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )
    const handshake = JSON.parse(lastWs().sent[0])
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Fulcrum', '1.6'],
        id: handshake.id,
      }),
    })

    // Wait for subscribe request
    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const subReq = JSON.parse(lastWs().sent[1])
    expect(subReq.method).toBe('blockchain.headers.subscribe')

    // Respond to subscribe
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: { height: 100, hex: 'ab' },
        id: subReq.id,
      }),
    })

    const unsub1 = await subPromise1
    expect(received1).toEqual([[{ height: 100, hex: 'ab' }]])

    // Second subscriber taps into existing subscription (no new request)
    const sentBeforeSub2 = lastWs().sent.length
    const unsub2 = await transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        received2.push(data)
      },
    )
    expect(lastWs().sent.length).toBe(sentBeforeSub2) // No new request sent

    // Second subscriber receives the cached initial result
    expect(received2).toEqual([[{ height: 100, hex: 'ab' }]])

    // Send a notification - both receive it
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 101, hex: 'cd' }],
      }),
    })
    expect(received1).toHaveLength(2)
    expect(received2).toHaveLength(2)

    // First subscriber unsubscribes - NO unsubscribe request should be sent
    const sentBeforeUnsub1 = lastWs().sent.length
    await unsub1()
    expect(lastWs().sent.length).toBe(sentBeforeUnsub1) // No unsubscribe sent!

    // Second subscriber should still receive notifications
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 102, hex: 'ef' }],
      }),
    })
    expect(received1).toHaveLength(2) // First subscriber doesn't receive (unsubscribed)
    expect(received2).toHaveLength(3) // Second subscriber still receives

    // Second subscriber unsubscribes - NOW unsubscribe request should be sent
    const unsubPromise2 = unsub2()
    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBe(sentBeforeUnsub1 + 1),
    )
    const unsubReq = JSON.parse(lastWs().sent[lastWs().sent.length - 1])
    expect(unsubReq.method).toBe('blockchain.headers.unsubscribe')

    // Respond to unsubscribe
    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: true,
        id: unsubReq.id,
      }),
    })

    await unsubPromise2
    await transport.close()
  })

  it('allows user config to override handshake', async () => {
    const transport = webSocket({
      url: 'wss://electrum-ws-override',
      batch: false,
      handshake: {
        method: 'custom.version',
        params: ['myapp', '2.0'],
      },
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastWs().sent.length).toBeGreaterThanOrEqual(1),
    )

    // User's handshake should override the electrum default
    const handshake = JSON.parse(lastWs().sent[0])
    expect(handshake.method).toBe('custom.version')
    expect(handshake.params).toEqual(['myapp', '2.0'])

    lastWs().onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        result: ['Server', '2.0'],
        id: handshake.id,
      }),
    })

    await vi.waitFor(() => expect(lastWs().sent.length).toBe(2))
    const req = JSON.parse(lastWs().sent[1])
    lastWs().onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id }),
    })

    expect(await promise).toBeNull()
    await transport.close()
  })
})
