import type { RpcRequest, RpcResponse } from '@rpckit/core'
import { BatchScheduler } from '@rpckit/core'
import { describe, expect, it, vi } from 'vitest'

describe('BatchScheduler', () => {
  it('flushes when batchSize is reached', async () => {
    const send = vi
      .fn<(reqs: RpcRequest[]) => Promise<RpcResponse[]>>()
      .mockImplementation(async (reqs) =>
        reqs.map((r) => ({
          jsonrpc: '2.0' as const,
          result: `result-${r.id}`,
          id: r.id,
        })),
      )

    const scheduler = new BatchScheduler({ wait: 1000, batchSize: 2 }, send)

    const p1 = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 1,
    })
    const p2 = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 2,
    })

    const [r1, r2] = await Promise.all([p1, p2])

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
    )
    expect(r1).toBe('result-1')
    expect(r2).toBe('result-2')
  })

  it('flushes on timer when batchSize not reached', async () => {
    vi.useFakeTimers()

    const send = vi
      .fn<(reqs: RpcRequest[]) => Promise<RpcResponse[]>>()
      .mockImplementation(async (reqs) =>
        reqs.map((r) => ({ jsonrpc: '2.0' as const, result: 'ok', id: r.id })),
      )

    const scheduler = new BatchScheduler({ wait: 50, batchSize: 10 }, send)

    const p = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 1,
    })

    await vi.advanceTimersByTimeAsync(50)

    expect(await p).toBe('ok')
    expect(send).toHaveBeenCalledOnce()

    vi.useRealTimers()
  })

  it('rejects all on send error', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network'))

    const scheduler = new BatchScheduler({ wait: 1000, batchSize: 2 }, send)

    const p1 = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 1,
    })
    const p2 = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 2,
    })

    await expect(p1).rejects.toThrow('network')
    await expect(p2).rejects.toThrow('network')
  })

  it('rejects individual request on RPC error', async () => {
    const send = vi
      .fn<(reqs: RpcRequest[]) => Promise<RpcResponse[]>>()
      .mockImplementation(async (reqs) =>
        reqs.map((r) => ({
          jsonrpc: '2.0' as const,
          error: { code: -1, message: 'bad' },
          id: r.id,
        })),
      )

    const scheduler = new BatchScheduler({ wait: 1000, batchSize: 1 }, send)

    const p = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 1,
    })
    await expect(p).rejects.toEqual({ code: -1, message: 'bad' })
  })

  it('returns full response when raw: true', async () => {
    const send = vi
      .fn<(reqs: RpcRequest[]) => Promise<RpcResponse[]>>()
      .mockImplementation(async (reqs) =>
        reqs.map((r) => ({
          jsonrpc: '2.0' as const,
          result: `result-${r.id}`,
          id: r.id,
        })),
      )

    const scheduler = new BatchScheduler(
      { wait: 1000, batchSize: 1, raw: true },
      send,
    )

    const p = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 1,
    })
    const result = await p
    expect(result).toEqual({
      jsonrpc: '2.0',
      result: 'result-1',
      id: 1,
    })
  })

  it('returns RPC error as result when raw: true', async () => {
    const send = vi
      .fn<(reqs: RpcRequest[]) => Promise<RpcResponse[]>>()
      .mockImplementation(async (reqs) =>
        reqs.map((r) => ({
          jsonrpc: '2.0' as const,
          error: { code: -1, message: 'bad' },
          id: r.id,
        })),
      )

    const scheduler = new BatchScheduler(
      { wait: 1000, batchSize: 1, raw: true },
      send,
    )

    const p = scheduler.enqueue({
      jsonrpc: '2.0',
      method: 'test',
      params: [],
      id: 1,
    })
    const result = await p
    expect(result).toEqual({
      jsonrpc: '2.0',
      error: { code: -1, message: 'bad' },
      id: 1,
    })
  })
})
