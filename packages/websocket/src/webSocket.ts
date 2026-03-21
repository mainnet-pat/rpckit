import {
  type AnySchema,
  BatchScheduler,
  type RpcRequest,
  type RpcResponse,
  type Schema,
  type SubscriptionNotification,
  type Unsubscribe,
  type WebSocketTransport,
  type WebSocketTransportConfig,
  withRetry,
} from '@rpckit/core'
import { WebSocket } from 'isows'

type SubscriptionEntry = {
  method: string
  params: unknown[]
  listeners: Set<(data: unknown) => void>
  initialResult: unknown
  lastNotification: unknown
  dispatchChain: Promise<void>
}

type SocketClient = {
  refCount: number
  readonly ws: WebSocket | null
  nextId: number
  connectPromise: Promise<void> | null
  reconnectCount: number
  closed: boolean
  pending: Map<
    number,
    {
      resolve: (v: unknown) => void
      reject: (e: unknown) => void
      timer?: ReturnType<typeof setTimeout>
    }
  >
  subscriptions: Map<string, SubscriptionEntry>
  keepAliveTimer: ReturnType<typeof setTimeout> | null
  batchScheduler: BatchScheduler | null
  connect: () => Promise<void>
  sendRaw: (request: RpcRequest) => void
  request: (method: string, params?: unknown[]) => Promise<unknown>
  subscribe: (
    method: string,
    params: unknown[],
    onData: (data: unknown) => void,
  ) => Promise<{
    initialResult: unknown
    unsubscribe: () => Promise<boolean>
    fromNotification: boolean
  }>
  close: () => Promise<void>
}

const socketCache = new Map<string, SocketClient>()

function getCacheKey(config: WebSocketTransportConfig): string {
  return JSON.stringify({
    url: config.url,
    headers: config.headers,
    keepAlive: config.keepAlive,
    reconnect: config.reconnect,
  })
}

function getOrCreateSocketClient(
  config: WebSocketTransportConfig,
): SocketClient {
  const cacheKey = getCacheKey(config)
  let client = socketCache.get(cacheKey)

  if (client) {
    client.refCount++
    return client
  }

  let ws: WebSocket | null = null
  let nextId = 1
  let closed = false
  let connectPromise: Promise<void> | null = null
  let reconnectCount = 0

  const pending = new Map<
    number,
    {
      resolve: (v: unknown) => void
      reject: (e: unknown) => void
      timer?: ReturnType<typeof setTimeout>
    }
  >()
  const subscriptions = new Map<string, SubscriptionEntry>()
  // Track pending subscribe requests to prevent race conditions
  const pendingSubscriptions = new Map<string, Promise<SubscriptionEntry>>()

  let keepAliveTimer: ReturnType<typeof setTimeout> | null = null
  let batchScheduler: BatchScheduler | null = null

  async function sendSingle(req: RpcRequest): Promise<unknown> {
    await connect()
    return new Promise((resolve, reject) => {
      const timer = config.timeout
        ? setTimeout(() => {
            pending.delete(req.id)
            reject(new Error('Request timeout'))
          }, config.timeout)
        : undefined
      pending.set(req.id, { resolve, reject, timer })
      sendRaw(req)
    })
  }

  if (config.batch !== false) {
    batchScheduler = new BatchScheduler(
      {
        ...(typeof config.batch === 'object' ? config.batch : {}),
        sendSingle,
      },
      sendBatch,
    )
  }

  function getSubscriptionKey(method: string, params: unknown[]): string {
    return `${method}:${JSON.stringify(params)}`
  }

  function connect(): Promise<void> {
    if (connectPromise) return connectPromise

    connectPromise = new Promise<void>((resolve, reject) => {
      ws = config.headers
        ? // biome-ignore lint/suspicious/noExplicitAny: isows headers typing
          new WebSocket(config.url, { headers: config.headers } as any)
        : new WebSocket(config.url)

      let connectTimer: ReturnType<typeof setTimeout> | undefined
      if (config.connectTimeout) {
        connectTimer = setTimeout(() => {
          reject(new Error('Connection timeout'))
          ws?.close()
          void handleDisconnect()
        }, config.connectTimeout)
      }

      ws.onopen = async () => {
        try {
          reconnectCount = 0
          if (config.handshake) {
            const id = nextId++
            const req: RpcRequest = {
              jsonrpc: '2.0',
              method: config.handshake.method,
              params: config.handshake.params ?? [],
              id,
            }
            await new Promise<void>((res, rej) => {
              pending.set(id, { resolve: () => res(), reject: rej })
              sendRaw(req)
            })
          }
          startKeepAlive()

          // Restore subscriptions after reconnect
          if (subscriptions.size > 0) {
            for (const [_key, entry] of subscriptions) {
              const id = nextId++
              const req: RpcRequest = {
                jsonrpc: '2.0',
                method: entry.method,
                params: entry.params,
                id,
              }
              sendRaw(req)
              // We don't await the response - just re-establish
            }
          }

          if (connectTimer) clearTimeout(connectTimer)
          resolve()
        } catch (err) {
          reject(err)
        }
      }

      ws.onerror = (event) => {
        if (connectTimer) clearTimeout(connectTimer)
        const message =
          event && typeof event === 'object' && 'message' in event
            ? `WebSocket error: ${(event as { message: string }).message}`
            : 'WebSocket error'
        reject(new Error(message))
        void handleDisconnect()
      }

      ws.onclose = () => {
        void handleDisconnect()
      }

      ws.onmessage = (event) => {
        const raw = String(event.data)
        if (!raw.trim()) return

        const messages: Array<RpcResponse | SubscriptionNotification> =
          raw.startsWith('[') ? JSON.parse(raw) : [JSON.parse(raw)]

        for (const msg of messages) {
          if ('id' in msg && msg.id != null) {
            const p = pending.get(msg.id as number)
            if (p) {
              pending.delete(msg.id as number)
              if (p.timer) clearTimeout(p.timer)
              const resp = msg as RpcResponse
              if (resp.error) p.reject(resp.error)
              else p.resolve(resp.result)
            }
          } else {
            // Subscription notification
            const notif = msg as SubscriptionNotification
            for (const [, entry] of subscriptions) {
              if (entry.method === notif.method) {
                // Apply notification filter if configured
                if (config.notificationFilter) {
                  const notifParams = notif.params as unknown[]
                  if (!config.notificationFilter(entry.params, notifParams)) {
                    continue
                  }
                }
                entry.lastNotification = notif.params
                entry.dispatchChain = entry.dispatchChain.then(() =>
                  Promise.all(
                    Array.from(entry.listeners, (handler) =>
                      Promise.resolve(handler(notif.params)).catch(() => {}),
                    ),
                  ).then(() => {}),
                )
              }
            }
          }
        }
      }
    })

    return connectPromise
  }

  function startKeepAlive() {
    stopKeepAlive()
    const ka = config.keepAlive
    if (!ka) return
    const interval = typeof ka === 'number' ? ka : ka.interval
    const method = typeof ka === 'number' ? undefined : ka.method
    const params = typeof ka === 'number' ? [] : (ka.params ?? [])
    if (interval > 0 && method) {
      keepAliveTimer = setInterval(() => {
        sendRaw({ jsonrpc: '2.0', method, params, id: nextId++ })
      }, interval)
    }
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer)
      keepAliveTimer = null
    }
  }

  async function handleDisconnect() {
    stopKeepAlive()
    connectPromise = null
    ws = null

    // Reject all pending requests (but keep subscriptions for restore)
    for (const [, p] of pending) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(new Error('WebSocket disconnected'))
    }
    pending.clear()

    if (
      !closed &&
      config.reconnect &&
      reconnectCount < config.reconnect.attempts
    ) {
      reconnectCount++
      await new Promise((r) => setTimeout(r, config.reconnect?.delay))
      if (!closed) await connect()
    }
  }

  function sendRaw(request: RpcRequest) {
    ws?.send(JSON.stringify(request))
  }

  async function sendBatch(requests: RpcRequest[]): Promise<RpcResponse[]> {
    await connect()
    return new Promise((resolve, reject) => {
      const ids = new Set(requests.map((r) => r.id))
      const results: RpcResponse[] = []

      const timer = config.timeout
        ? setTimeout(() => {
            for (const id of ids) pending.delete(id)
            reject(new Error('Batch timeout'))
          }, config.timeout)
        : undefined

      for (const req of requests) {
        pending.set(req.id, {
          resolve: (result) => {
            results.push({ jsonrpc: '2.0', result, id: req.id })
            ids.delete(req.id)
            if (ids.size === 0) {
              if (timer) clearTimeout(timer)
              resolve(results)
            }
          },
          reject: (error) => {
            for (const id of ids) pending.delete(id)
            if (timer) clearTimeout(timer)
            reject(error)
          },
        })
      }

      ws?.send(JSON.stringify(requests))
    })
  }

  async function request(
    method: string,
    params: unknown[] = [],
  ): Promise<unknown> {
    await connect()

    const id = nextId++
    const req: RpcRequest = { jsonrpc: '2.0', method, params, id }

    if (batchScheduler) {
      return batchScheduler.enqueue(req)
    }

    return sendSingle(req)
  }

  async function subscribe(
    method: string,
    params: unknown[],
    onData: (data: unknown) => void,
  ): Promise<{
    initialResult: unknown
    unsubscribe: () => Promise<boolean>
    fromNotification: boolean
  }> {
    await connect()

    const subKey = getSubscriptionKey(method, params)

    // Helper to create unsubscribe function for an entry
    const createUnsubscribe = (e: SubscriptionEntry) => async () => {
      e.listeners.delete(onData)
      if (e.listeners.size === 0) {
        subscriptions.delete(subKey)
        await e.dispatchChain
        return true // was the last listener
      }
      return false // other listeners remain
    }

    // Check for existing subscription
    let entry = subscriptions.get(subKey)
    if (entry) {
      entry.listeners.add(onData)
      const hasNotification = entry.lastNotification !== undefined
      return {
        initialResult: hasNotification
          ? entry.lastNotification
          : entry.initialResult,
        unsubscribe: createUnsubscribe(entry),
        fromNotification: hasNotification,
      }
    }

    // Check for pending subscription request (race condition prevention)
    const pendingPromise = pendingSubscriptions.get(subKey)
    if (pendingPromise) {
      // Wait for the in-flight subscription to complete, then tap in
      entry = await pendingPromise
      entry.listeners.add(onData)
      const hasNotification = entry.lastNotification !== undefined
      return {
        initialResult: hasNotification
          ? entry.lastNotification
          : entry.initialResult,
        unsubscribe: createUnsubscribe(entry),
        fromNotification: hasNotification,
      }
    }

    // Create new subscription - store promise to prevent race conditions
    const subscriptionPromise = (async () => {
      const id = nextId++
      const req: RpcRequest = { jsonrpc: '2.0', method, params, id }

      const initialResult = await new Promise<unknown>((resolve, reject) => {
        const timer = config.timeout
          ? setTimeout(() => {
              pending.delete(id)
              reject(new Error('Request timeout'))
            }, config.timeout)
          : undefined

        pending.set(id, { resolve, reject, timer })
        sendRaw(req)
      })

      const newEntry: SubscriptionEntry = {
        method,
        params,
        listeners: new Set([onData]),
        initialResult,
        lastNotification: undefined,
        dispatchChain: Promise.resolve(),
      }
      subscriptions.set(subKey, newEntry)
      return newEntry
    })()

    pendingSubscriptions.set(subKey, subscriptionPromise)

    try {
      entry = await subscriptionPromise
      return {
        initialResult: entry.initialResult,
        unsubscribe: createUnsubscribe(entry),
        fromNotification: false,
      }
    } finally {
      pendingSubscriptions.delete(subKey)
    }
  }

  async function close(): Promise<void> {
    closed = true
    stopKeepAlive()
    if (batchScheduler) await batchScheduler.flush()
    // Drain all in-flight dispatch chains before tearing down
    await Promise.all(
      Array.from(subscriptions.values(), (e) => e.dispatchChain),
    )
    for (const [, p] of pending) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(new Error('Transport closed'))
    }
    pending.clear()
    subscriptions.clear()
    ws?.close()
    ws = null
    connectPromise = null
    socketCache.delete(cacheKey)
  }

  client = {
    refCount: 1,
    get ws() {
      return ws
    },
    nextId,
    connectPromise,
    reconnectCount,
    closed,
    pending,
    subscriptions,
    keepAliveTimer,
    batchScheduler,
    connect,
    sendRaw,
    request,
    subscribe,
    close,
  }

  socketCache.set(cacheKey, client)
  return client
}

export function webSocket<S extends Schema = AnySchema>(
  url: string,
  options?: Omit<WebSocketTransportConfig, 'url'>,
): WebSocketTransport<S>
export function webSocket<S extends Schema = AnySchema>(
  config: WebSocketTransportConfig,
): WebSocketTransport<S>
export function webSocket<S extends Schema = AnySchema>(
  configOrUrl: string | WebSocketTransportConfig,
  options?: Omit<WebSocketTransportConfig, 'url'>,
): WebSocketTransport<S> {
  const config: WebSocketTransportConfig =
    typeof configOrUrl === 'string'
      ? { ...options, url: configOrUrl }
      : configOrUrl

  // Lazy client initialization - only created on first use
  let client: SocketClient | null = null
  const getClient = () => {
    if (!client) client = getOrCreateSocketClient(config)
    return client
  }

  const retryOpts = {
    retryCount: config.retryCount,
    retryDelay: config.retryDelay,
  }

  const self: WebSocketTransport<S> = {
    url: config.url,

    connect: () => withRetry(() => getClient().connect(), retryOpts),

    request: (method: string, ...params: unknown[]) =>
      withRetry(() => getClient().request(method, params), retryOpts),

    async subscribe(method: string, ...args: unknown[]): Promise<Unsubscribe> {
      const onData = args.pop() as (data: unknown) => void
      const params = args as unknown[]
      const { initialResult, unsubscribe, fromNotification } = await withRetry(
        () => getClient().subscribe(method, params, onData),
        retryOpts,
      )

      // Deliver initial result if we got one
      if (initialResult !== undefined) {
        if (fromNotification) {
          // Reused subscription: lastNotification is already in notification format
          onData(initialResult)
        } else {
          const transformed = config.transformInitialResult
            ? config.transformInitialResult(method, params, [initialResult])
            : initialResult
          // Allow transformInitialResult to return undefined to suppress delivery
          if (transformed !== undefined) {
            onData(transformed)
          }
        }
      }

      const unsub: Unsubscribe = async (cleanup) => {
        const wasLastListener = await unsubscribe()
        // Only call onUnsubscribe when the last listener is removed
        if (wasLastListener) {
          const fn = cleanup ?? config.onUnsubscribe
          if (fn) {
            await fn({ request: self.request, method, params, initialResult })
          }
        }
      }
      return unsub
    },

    async close(): Promise<void> {
      if (!client) return
      client.refCount--
      if (client.refCount <= 0) {
        await client.close()
      }
    },

    getSocket() {
      return client?.ws ?? null
    },

    async getSocketAsync() {
      await getClient().connect()
      const c = getClient()
      if (!c.ws) throw new Error('WebSocket not connected')
      return c.ws
    },
  }

  return self
}
