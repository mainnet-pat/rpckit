import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSockets: MockSocket[] = []
let autoConnect = true

class MockSocket extends EventEmitter {
  written: string[] = []

  constructor() {
    super()
    mockSockets.push(this)
  }

  setEncoding() {}

  write(data: string) {
    this.written.push(data)
  }

  destroy() {}
}

vi.mock('net', () => ({
  createConnection: (_opts: unknown, cb: () => void) => {
    const socket = new MockSocket()
    if (autoConnect) setTimeout(cb, 0)
    return socket
  },
}))

import { tcp } from '@rpckit/tcp'

function lastSocket(): MockSocket {
  return mockSockets[mockSockets.length - 1]
}

describe('TCP transport', () => {
  beforeEach(() => {
    mockSockets.length = 0
    autoConnect = true
  })

  it('sends newline-delimited JSON-RPC and receives response', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(1))

    expect(lastSocket().written[0]).toMatch(/\n$/)
    const req = JSON.parse(lastSocket().written[0].trim())
    expect(req.method).toBe('server.ping')

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id })}\n`,
    )

    expect(await promise).toBeNull()
    await transport.close()
  })

  it('handles partial messages (buffer accumulation)', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(1))

    const req = JSON.parse(lastSocket().written[0].trim())
    const response = JSON.stringify({
      jsonrpc: '2.0',
      result: 'ok',
      id: req.id,
    })

    // Send in two chunks
    lastSocket().emit('data', response.slice(0, 10))
    lastSocket().emit('data', `${response.slice(10)}\n`)

    expect(await promise).toBe('ok')
    await transport.close()
  })

  it('handles subscriptions', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
    })

    const received: unknown[] = []
    const subPromise = transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        received.push(data)
      },
    )

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(1))

    const req = JSON.parse(lastSocket().written[0].trim())
    lastSocket().emit(
      'data',
      JSON.stringify({ jsonrpc: '2.0', result: { height: 1 }, id: req.id }) +
        '\n',
    )

    const unsub = await subPromise
    expect(received).toEqual([{ height: 1 }])

    // Notification
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 2 }],
      })}\n`,
    )
    expect(received).toEqual([{ height: 1 }, [{ height: 2 }]])

    // Unsubscribe (base transport does local cleanup only, no unsubscribe request)
    await unsub()
    expect(lastSocket().written.length).toBe(1)

    await transport.close()
  })

  it('getSocket returns null before connect, socket after', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
    })

    // Before connection, getSocket returns null
    expect(transport.getSocket()).toBeNull()

    // After connecting, getSocket returns the socket
    await transport.connect()
    const socket = transport.getSocket()
    expect(socket).toBeTruthy()

    await transport.close()
  })

  it('getSocketAsync connects and returns socket', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
    })

    // getSocketAsync should connect and return the socket
    const socket = await transport.getSocketAsync()
    expect(socket).toBeTruthy()

    await transport.close()
  })

  it('re-sends handshake on reconnect', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
      handshake: { method: 'server.version', params: ['client', '1.0'] },
      reconnect: { delay: 10, attempts: 1 },
    })

    // Initial connection
    const promise = transport.request('server.ping')
    await vi.waitFor(() =>
      expect(lastSocket().written.length).toBeGreaterThanOrEqual(1),
    )

    // Respond to handshake
    const handshake1 = JSON.parse(lastSocket().written[0].trim())
    expect(handshake1.method).toBe('server.version')
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['ok'], id: handshake1.id })}\n`,
    )

    // Respond to actual request
    await vi.waitFor(() => expect(lastSocket().written.length).toBe(2))
    const req = JSON.parse(lastSocket().written[1].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id })}\n`,
    )
    await promise

    const socketsBefore = mockSockets.length

    // Simulate disconnect — triggers reconnect
    lastSocket().emit('close')

    // Wait for new socket to be created and handshake re-sent
    await vi.waitFor(() => {
      return (
        mockSockets.length > socketsBefore && lastSocket().written.length >= 1
      )
    })

    const handshake2 = JSON.parse(lastSocket().written[0].trim())
    expect(handshake2.method).toBe('server.version')
    expect(handshake2.params).toEqual(['client', '1.0'])

    // Complete handshake so transport settles
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['ok'], id: handshake2.id })}\n`,
    )

    await transport.close()
  })

  it('lazy initialization - no socket created until first use', async () => {
    const initialCount = mockSockets.length

    // Creating transport should NOT create a socket
    const transport = tcp({
      host: '127.0.0.1',
      port: 50099,
      batch: false,
    })

    // No new socket instances should be created
    expect(mockSockets.length).toBe(initialCount)

    // getSocket should return null before any connection
    expect(transport.getSocket()).toBeNull()

    // First request triggers connection
    const promise = transport.request('server.ping')

    // Now a socket should be created and request sent
    await vi.waitFor(() => expect(lastSocket()?.written.length).toBe(1))
    expect(mockSockets.length).toBe(initialCount + 1)

    // Complete the request
    const req = JSON.parse(lastSocket().written[0].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id })}\n`,
    )
    await promise

    await transport.close()
  })

  it('subscription reuse delivers most recent notification to new subscribers', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
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

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(1))

    const req = JSON.parse(lastSocket().written[0].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        result: { height: 100, hex: 'initial' },
        id: req.id,
      })}\n`,
    )

    const unsub1 = await subPromise1
    expect(received1).toEqual([{ height: 100, hex: 'initial' }])

    // Simulate some notifications (time passes, new blocks come in)
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 101, hex: 'block101' }],
      })}\n`,
    )
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 102, hex: 'block102' }],
      })}\n`,
    )

    // First subscriber received notifications
    expect(received1).toEqual([
      { height: 100, hex: 'initial' },
      [{ height: 101, hex: 'block101' }],
      [{ height: 102, hex: 'block102' }],
    ])

    // Second subscriber taps into existing subscription
    // Should NOT send another subscribe request
    const writtenBefore = lastSocket().written.length
    const unsub2 = await transport.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        received2.push(data)
      },
    )

    // No new request sent (reusing existing subscription)
    expect(lastSocket().written.length).toBe(writtenBefore)

    // Second subscriber should get the most recent notification (block 102), NOT the stale initial result
    expect(received2).toEqual([[{ height: 102, hex: 'block102' }]])

    // New notification should be delivered to both
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.headers.subscribe',
        params: [{ height: 103, hex: 'block103' }],
      })}\n`,
    )
    expect(received1).toHaveLength(4)
    expect(received2).toHaveLength(2)
    expect(received1[3]).toEqual([{ height: 103, hex: 'block103' }])
    expect(received2[1]).toEqual([{ height: 103, hex: 'block103' }])

    await unsub1()
    await unsub2()
    await transport.close()
  })

  it('subscription reuse delivers initial result when no notifications received yet', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
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

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(1))

    const req = JSON.parse(lastSocket().written[0].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        result: { height: 100, hex: 'initial' },
        id: req.id,
      })}\n`,
    )

    const unsub1 = await subPromise1
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
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
      transformInitialResult: (_method, params, result) => [
        ...params,
        ...result,
      ],
    })

    const received1: unknown[] = []
    const received2: unknown[] = []

    // First subscriber
    const subPromise1 = transport.subscribe(
      'blockchain.scripthash.subscribe',
      'scripthash_abc',
      (data) => {
        received1.push(data)
      },
    )

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(1))

    const req = JSON.parse(lastSocket().written[0].trim())
    // Server returns raw status hash as initial result
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        result: 'status_initial',
        id: req.id,
      })}\n`,
    )

    const unsub1 = await subPromise1
    // First subscriber gets transformed initial result: [scripthash, statusHash]
    expect(received1).toEqual([['scripthash_abc', 'status_initial']])

    // Notification arrives from server (already in [scripthash, status] format)
    lastSocket().emit(
      'data',
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.scripthash.subscribe',
        params: ['scripthash_abc', 'status_updated'],
      })}\n`,
    )

    expect(received1).toEqual([
      ['scripthash_abc', 'status_initial'],
      ['scripthash_abc', 'status_updated'],
    ])

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

  it('rejects with connection timeout when socket does not connect', async () => {
    autoConnect = false

    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
      connectTimeout: 50,
    })

    await expect(transport.connect()).rejects.toThrow('Connection timeout')
    await transport.close()
  })

  it('rejects with connection timeout when handshake stalls', async () => {
    // Socket connects, but server.version never gets a response
    const transport = tcp({
      host: '127.0.0.1',
      port: 50001,
      batch: false,
      connectTimeout: 50,
      handshake: { method: 'server.version', params: ['client', '1.6'] },
    })

    await expect(transport.connect()).rejects.toThrow('Connection timeout')
    await transport.close()
  })
})
