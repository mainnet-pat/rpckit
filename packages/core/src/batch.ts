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
}

export class BatchScheduler {
  private queue: PendingRequest[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private config: Required<BatchConfig>
  private raw: boolean
  private send: (requests: RpcRequest[]) => Promise<RpcResponse[]>

  constructor(
    config: BatchSchedulerOptions,
    send: (requests: RpcRequest[]) => Promise<RpcResponse[]>,
  ) {
    this.config = { batchSize: config.batchSize ?? 10, wait: config.wait ?? 0 }
    this.raw = config.raw ?? false
    this.send = send
  }

  enqueue(request: RpcRequest): Promise<unknown> {
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
      for (const pending of batch) {
        pending.reject(error)
      }
    }
  }
}
