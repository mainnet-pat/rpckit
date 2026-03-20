import type { RpcRequest, RpcResponse } from './protocol.js'
import type { BatchConfig } from './types.js'

interface PendingRequest {
  request: RpcRequest
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export interface BatchSchedulerOptions extends BatchConfig {
  /** Return RPC errors as results instead of throwing (default: false) */
  raw?: boolean
  /** Send a single request individually (fallback when batching is disabled) */
  sendSingle?: (request: RpcRequest) => Promise<unknown>
  /** Custom predicate to detect batch rejection errors (default: checks for parse error / invalid request codes) */
  isBatchRejection?: (error: unknown) => boolean
}

function defaultIsBatchRejection(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (typeof e.code === 'number') {
      // -32700: Parse error, -32600: Invalid Request
      if (e.code === -32700 || e.code === -32600) return true
    }
    if (typeof e.message === 'string') {
      const msg = e.message.toLowerCase()
      if (
        msg.includes('parse error') ||
        msg.includes('invalid request') ||
        msg.includes('batch timeout')
      )
        return true
    }
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (
      msg.includes('parse error') ||
      msg.includes('invalid request') ||
      msg.includes('batch timeout')
    )
      return true
  }
  return false
}

export class BatchScheduler {
  private queue: PendingRequest[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private config: Required<Pick<BatchConfig, 'batchSize' | 'wait'>> & {
    disabledCooldown: number
  }
  private raw: boolean
  private send: (requests: RpcRequest[]) => Promise<RpcResponse[]>
  private sendSingle?: (request: RpcRequest) => Promise<unknown>
  private checkBatchRejection: (error: unknown) => boolean
  private _disabled = false
  private disableTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    config: BatchSchedulerOptions,
    send: (requests: RpcRequest[]) => Promise<RpcResponse[]>,
  ) {
    this.config = {
      batchSize: config.batchSize ?? 10,
      wait: config.wait ?? 0,
      disabledCooldown: config.disabledCooldown ?? 5_000,
    }
    this.raw = config.raw ?? false
    this.send = send
    this.sendSingle = config.sendSingle
    this.checkBatchRejection =
      config.isBatchRejection ?? defaultIsBatchRejection
  }

  get disabled(): boolean {
    return this._disabled
  }

  enqueue(request: RpcRequest): Promise<unknown> {
    if (this._disabled && this.sendSingle) {
      return this.sendSingle(request)
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject })

      if (this.queue.length >= this.config.batchSize) {
        this.flush()
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.config.wait)
      }
    })
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.queue.length === 0) return

    const batch = this.queue.splice(0)

    try {
      const responses = await this.send(batch.map((p) => p.request))
      const byId = new Map(responses.map((r) => [r.id, r]))

      for (const pending of batch) {
        const response = byId.get(pending.request.id)
        if (!response) {
          pending.reject(
            new Error(
              `No response for request id ${pending.request.id}, try reducing batch size`,
            ),
          )
        } else if (response.error) {
          if (this.raw) {
            pending.resolve(response)
          } else {
            pending.reject(response.error)
          }
        } else {
          pending.resolve(this.raw ? response : response.result)
        }
      }
    } catch (error) {
      if (this.sendSingle && this.checkBatchRejection(error)) {
        this.disableBatching()

        // Retry failed batch items individually
        for (const pending of batch) {
          this.sendSingle(pending.request).then(
            (result) => pending.resolve(result),
            (err) => pending.reject(err),
          )
        }

        // Drain any remaining queued items individually
        const remaining = this.queue.splice(0)
        if (this.timer) {
          clearTimeout(this.timer)
          this.timer = null
        }
        for (const pending of remaining) {
          this.sendSingle(pending.request).then(
            (result) => pending.resolve(result),
            (err) => pending.reject(err),
          )
        }
      } else {
        for (const pending of batch) {
          pending.reject(error)
        }
      }
    }
  }

  private disableBatching(): void {
    this._disabled = true
    if (this.disableTimer) clearTimeout(this.disableTimer)
    if (this.config.disabledCooldown > 0) {
      this.disableTimer = setTimeout(() => {
        this._disabled = false
        this.disableTimer = null
      }, this.config.disabledCooldown)
    }
  }
}
