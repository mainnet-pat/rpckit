import {
  type AnySchema,
  BatchScheduler,
  type HttpTransportConfig,
  type RpcRequest,
  type RpcResponse,
  type Schema,
  type Transport,
  withRetry,
} from '@rpckit/core'

export function http<S extends Schema = AnySchema>(
  url: string,
  options?: Omit<HttpTransportConfig, 'url'>,
): Transport<S>
export function http<S extends Schema = AnySchema>(
  config: HttpTransportConfig,
): Transport<S>
export function http<S extends Schema = AnySchema>(
  configOrUrl: string | HttpTransportConfig,
  options?: Omit<HttpTransportConfig, 'url'>,
): Transport<S> {
  const config: HttpTransportConfig =
    typeof configOrUrl === 'string'
      ? { ...options, url: configOrUrl }
      : configOrUrl
  let nextId = 1

  const batchScheduler = new BatchScheduler(
    {
      ...(typeof config.batch === 'object' ? config.batch : {}),
      raw: config.raw,
    },
    sendBatch,
  )

  const fetchFn = config.fetchFn ?? fetch

  async function sendBatch(requests: RpcRequest[]): Promise<RpcResponse[]> {
    const body = requests.length === 1 ? requests[0] : requests

    return withRetry(
      async () => {
        config.onRequest?.({ url: config.url, body })

        const res = await fetchFn(config.url, {
          ...config.fetchOptions,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...config.headers },
          body: JSON.stringify(body),
          signal: config.timeout
            ? AbortSignal.timeout(config.timeout)
            : undefined,
        })

        if (!res.ok) {
          // Try to get error details from response body
          let errorBody = ''
          try {
            errorBody = await res.text()
          } catch {
            // Ignore if we can't read the body
          }
          throw new Error(
            `HTTP ${res.status}: ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
          )
        }

        const json = await res.json()
        const responses: RpcResponse[] = Array.isArray(json) ? json : [json]

        config.onResponse?.({ status: res.status, body: json })

        return responses
      },
      { retryCount: config.retryCount, retryDelay: config.retryDelay },
    )
  }

  return {
    url: config.url,

    async connect() {},

    async request(method: string, ...params: unknown[]): Promise<unknown> {
      const id = nextId++
      const request: RpcRequest = { jsonrpc: '2.0', method, params, id }
      return batchScheduler.enqueue(request)
    },

    async subscribe(): Promise<never> {
      throw new Error('HTTP transport does not support subscriptions')
    },

    async close(): Promise<void> {
      await batchScheduler.flush()
    },
  }
}
