import { http } from '@rpckit/http/electrum-cash'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Electrum Cash HTTP transport', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('includes Server-Version header with default protocol version', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', result: 42, id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const transport = http({ url: 'https://electrum-http-test/rpc' })
    await transport.request('server.ping')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://electrum-http-test/rpc',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Server-Version': '["rpckit", "1.6"]',
        }),
      }),
    )

    await transport.close()
  })

  it('uses custom protocolVersion in Server-Version header', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', result: 42, id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const transport = http({
      url: 'https://electrum-http-test-v16/rpc',
      protocolVersion: '1.5',
    })
    await transport.request('server.ping')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://electrum-http-test-v16/rpc',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Server-Version': '["rpckit", "1.5"]',
        }),
      }),
    )

    await transport.close()
  })

  it('allows user headers to override Server-Version', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', result: 42, id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const transport = http({
      url: 'https://electrum-http-test-override/rpc',
      headers: { 'Server-Version': '["custom", "2.0"]' },
    })
    await transport.request('server.ping')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://electrum-http-test-override/rpc',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Server-Version': '["custom", "2.0"]',
        }),
      }),
    )

    await transport.close()
  })

  it('accepts url string overload', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', result: 42, id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const transport = http('https://electrum-http-test-string/rpc')
    await transport.request('server.ping')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://electrum-http-test-string/rpc',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Server-Version': '["rpckit", "1.6"]',
        }),
      }),
    )

    await transport.close()
  })
})
