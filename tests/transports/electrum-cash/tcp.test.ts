import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSockets: MockSocket[] = []

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
    setTimeout(cb, 0)
    return socket
  },
}))

import { tcp } from '@rpckit/tcp/electrum-cash'

function lastSocket(): MockSocket {
  return mockSockets[mockSockets.length - 1]
}

describe('Electrum Cash TCP transport', () => {
  beforeEach(() => {
    mockSockets.length = 0
  })

  it('sends server.version handshake on connect', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50101,
      batch: false,
    })

    const promise = transport.request('blockchain.headers.subscribe')

    // Wait for handshake
    await vi.waitFor(() =>
      expect(lastSocket().written.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastSocket().written[0].trim())
    expect(handshake.method).toBe('server.version')
    expect(handshake.params).toEqual(['rpckit', '1.6'])

    // Respond to handshake
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['Fulcrum', '1.6'], id: handshake.id })}\n`,
    )

    // Wait for actual request
    await vi.waitFor(() => expect(lastSocket().written.length).toBe(2))
    const req = JSON.parse(lastSocket().written[1].trim())
    expect(req.method).toBe('blockchain.headers.subscribe')

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: { height: 100 }, id: req.id })}\n`,
    )

    expect(await promise).toEqual({ height: 100 })
    await transport.close()
  })

  it('uses custom protocolVersion in handshake', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50102,
      batch: false,
      protocolVersion: '1.5',
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastSocket().written.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastSocket().written[0].trim())
    expect(handshake.method).toBe('server.version')
    expect(handshake.params).toEqual(['rpckit', '1.5'])

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['Fulcrum', '1.5'], id: handshake.id })}\n`,
    )

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(2))
    const req = JSON.parse(lastSocket().written[1].trim())

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id })}\n`,
    )

    expect(await promise).toBeNull()
    await transport.close()
  })

  it('normalizes keepAlive number to PingConfig with server.ping', async () => {
    vi.useFakeTimers()

    const transport = tcp({
      host: '127.0.0.1',
      port: 50103,
      batch: false,
      keepAlive: 30000,
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastSocket().written.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastSocket().written[0].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['Fulcrum', '1.6'], id: handshake.id })}\n`,
    )

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(2))
    const req = JSON.parse(lastSocket().written[1].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id })}\n`,
    )
    await promise

    const writtenBefore = lastSocket().written.length
    await vi.advanceTimersByTimeAsync(30000)

    expect(lastSocket().written.length).toBe(writtenBefore + 1)
    const ping = JSON.parse(
      lastSocket().written[lastSocket().written.length - 1].trim(),
    )
    expect(ping.method).toBe('server.ping')

    await transport.close()
    vi.useRealTimers()
  })

  it('sends unsubscribe request using method.replace convention', async () => {
    const transport = tcp({
      host: '127.0.0.1',
      port: 50104,
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
      expect(lastSocket().written.length).toBeGreaterThanOrEqual(1),
    )
    const handshake = JSON.parse(lastSocket().written[0].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['Fulcrum', '1.6'], id: handshake.id })}\n`,
    )

    // Wait for subscribe request
    await vi.waitFor(() => expect(lastSocket().written.length).toBe(2))
    const subReq = JSON.parse(lastSocket().written[1].trim())
    expect(subReq.method).toBe('blockchain.headers.subscribe')

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: { height: 1 }, id: subReq.id })}\n`,
    )

    const unsub = await subPromise
    // transformInitialResult wraps as [...params, result]; params=[] so result is [{ height: 1 }]
    expect(received).toEqual([[{ height: 1 }]])

    // Unsubscribe — should send blockchain.headers.unsubscribe
    const unsubPromise = unsub()

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(3))
    const unsubReq = JSON.parse(lastSocket().written[2].trim())
    expect(unsubReq.method).toBe('blockchain.headers.unsubscribe')

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: true, id: unsubReq.id })}\n`,
    )

    await unsubPromise
    await transport.close()
  })

  it('accepts url string overload', async () => {
    const transport = tcp('tcp://127.0.0.1:50105', { batch: false })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastSocket().written.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastSocket().written[0].trim())
    expect(handshake.method).toBe('server.version')
    expect(handshake.params).toEqual(['rpckit', '1.6'])

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['Fulcrum', '1.6'], id: handshake.id })}\n`,
    )

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(2))
    const req = JSON.parse(lastSocket().written[1].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id })}\n`,
    )

    expect(await promise).toBeNull()
    await transport.close()
  })

  it('accepts url string overload with custom protocolVersion', async () => {
    const transport = tcp('tcp://127.0.0.1:50106', {
      batch: false,
      protocolVersion: '1.5',
    })

    const promise = transport.request('server.ping')

    await vi.waitFor(() =>
      expect(lastSocket().written.length).toBeGreaterThanOrEqual(1),
    )

    const handshake = JSON.parse(lastSocket().written[0].trim())
    expect(handshake.method).toBe('server.version')
    expect(handshake.params).toEqual(['rpckit', '1.5'])

    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: ['Fulcrum', '1.5'], id: handshake.id })}\n`,
    )

    await vi.waitFor(() => expect(lastSocket().written.length).toBe(2))
    const req = JSON.parse(lastSocket().written[1].trim())
    lastSocket().emit(
      'data',
      `${JSON.stringify({ jsonrpc: '2.0', result: null, id: req.id })}\n`,
    )

    expect(await promise).toBeNull()
    await transport.close()
  })
})
