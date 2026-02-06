import { http } from '@rpckit/http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('HTTP transport', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends a single request via POST', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', result: 42, id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const transport = http({ url: 'https://test/rpc' })
    const result = await transport.request('server.ping')

    expect(result).toBe(42)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test/rpc',
      expect.objectContaining({ method: 'POST' }),
    )

    await transport.close()
  })

  it('batches multiple requests', async () => {
    vi.useFakeTimers()
    const mockFetch = vi.mocked(globalThis.fetch)

    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { jsonrpc: '2.0', result: 'a', id: 1 },
          { jsonrpc: '2.0', result: 'b', id: 2 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const transport = http({
      url: 'https://test/rpc',
      batch: { wait: 10, batchSize: 5 },
    })

    const p1 = transport.request('method1')
    const p2 = transport.request('method2')

    await vi.advanceTimersByTimeAsync(10)

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe('a')
    expect(r2).toBe('b')
    expect(mockFetch).toHaveBeenCalledOnce()

    // Verify batch was sent as array
    // biome-ignore lint/suspicious/noExplicitAny: mock type access
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)

    await transport.close()
    vi.useRealTimers()
  })

  it('throws on HTTP error', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockResolvedValue(
      new Response('', { status: 500, statusText: 'Internal Server Error' }),
    )

    const transport = http({ url: 'https://test/rpc' })

    await expect(transport.request('test')).rejects.toThrow('HTTP 500')
    await transport.close()
  })

  it('times out when server is slow', async () => {
    const mockFetch = vi.mocked(globalThis.fetch)
    mockFetch.mockImplementation(async (_url, init) => {
      // Check if signal is passed and simulate slow response
      const signal = init?.signal as AbortSignal | undefined
      if (signal) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 5000)
          signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(signal.reason)
          })
        })
      }
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', result: 'ok', id: 1 }),
      )
    })

    const transport = http({ url: 'https://test/rpc', timeout: 50 })

    await expect(transport.request('test')).rejects.toThrow()
    await transport.close()
  })
})
