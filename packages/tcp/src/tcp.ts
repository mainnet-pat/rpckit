import { createConnection as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import {
  type AnySchema,
  BatchScheduler,
  type RpcRequest,
  type RpcResponse,
  type Schema,
  type SubscriptionNotification,
  type TcpTransport,
  type TcpTransportConfig,
  type TcpTransportOptions,
  type Unsubscribe,
  withRetry,
} from '@rpckit/core'

function parseUrl(config: TcpTransportConfig): {
  host: string
  port: number
  tls: boolean | import('tls').ConnectionOptions
} {
  if ('url' in config) {
    const isTls = config.url.startsWith('tcp+tls://')
    const stripped = config.url.replace(/^tcp(\+tls)?:\/\//, '')
    const [host, portStr] = stripped.split(':')
    const port = portStr ? parseInt(portStr, 10) : isTls ? 50002 : 50001
    const tls: boolean | import('tls').ConnectionOptions = isTls
      ? (config.tls ?? true)
      : false
    return { host, port, tls }
  }
  return { host: config.host, port: config.port, tls: config.tls ?? false }
}

type SubscriptionEntry = {
  method: string
  params: unknown[]
  listeners: Set<(data: unknown) => void>
  initialResult: unknown
  lastNotification: unknown
}

type TcpSocketClient = {
  refCount: number
  readonly socket: Socket | null
  nextId: number
  connectPromise: Promise<void> | null
  closed: boolean
  buffer: string
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
    unsubscribe: () => boolean
    fromNotification: boolean
  }>
  close: () => Promise<void>
  url: string
}

const tcpSocketCache = new Map<string, TcpSocketClient>()

function getCacheKey(config: TcpTransportConfig): string {
  const { host, port, tls } = parseUrl(config)
  return JSON.stringify({
    host,
    port,
    tls: typeof tls === 'object' ? tls : !!tls,
    keepAlive: config.keepAlive,
  })
}

function getOrCreateTcpSocketClient(
  config: TcpTransportConfig,
): TcpSocketClient {
  const cacheKey = getCacheKey(config)
  let client = tcpSocketCache.get(cacheKey)

  if (client) {
    client.refCount++
    return client
  }

  const { host, port, tls } = parseUrl(config)
  const url = `tcp${tls ? '+tls' : ''}://${host}:${port}`
  let socket: Socket | null = null
  let nextId = 1
  let closed = false
  let connectPromise: Promise<void> | null = null
  let buffer = ''
  let _reconnectCount = 0

  const pending = new Map<
    number,
    {
      resolve: (v: unknown) => void
      reject: (e: unknown) => void
      timer?: ReturnType<typeof setTimeout>
    }
  >()
  const subscriptions = new Map<string, SubscriptionEntry>()

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
      let connectTimer: ReturnType<typeof setTimeout> | undefined
      if (config.connectTimeout) {
        connectTimer = setTimeout(() => {
          reject(new Error('Connection timeout'))
          socket?.destroy()
          void handleDisconnect()
        }, config.connectTimeout)
      }

      const onConnect = async () => {
        try {
          _reconnectCount = 0
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
            }
          }

          if (connectTimer) clearTimeout(connectTimer)
          resolve()
        } catch (err) {
          reject(err)
        }
      }

      if (tls) {
        const tlsOpts = typeof tls === 'object' ? tls : {}
        socket = tlsConnect({ host, port, ...tlsOpts }, onConnect)
      } else {
        socket = netConnect({ host, port }, onConnect)
      }

      socket.setEncoding('utf8')

      socket.on('data', (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        // biome-ignore lint/style/noNonNullAssertion: split always returns at least one element
        buffer = lines.pop()!

        for (const line of lines) {
          if (!line.trim()) continue

          let msg: RpcResponse | SubscriptionNotification | Array<RpcResponse>
          try {
            msg = JSON.parse(line)
          } catch {
            continue
          }

          const messages = Array.isArray(msg) ? msg : [msg]

          for (const m of messages) {
            if ('id' in m && m.id != null) {
              const p = pending.get(m.id as number)
              if (p) {
                pending.delete(m.id as number)
                if (p.timer) clearTimeout(p.timer)
                const resp = m as RpcResponse
                if (resp.error) p.reject(resp.error)
                else p.resolve(resp.result)
              }
            } else {
              const notif = m as SubscriptionNotification
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
                  for (const handler of entry.listeners) handler(notif.params)
                }
              }
            }
          }
        }
      })

      socket.on('error', (err) => {
        if (connectTimer) clearTimeout(connectTimer)
        reject(err)
        void handleDisconnect(err)
      })

      socket.on('close', () => {
        void handleDisconnect()
      })
    })

    return connectPromise
  }

  async function handleDisconnect(error?: Error) {
    stopKeepAlive()
    connectPromise = null
    socket = null
    buffer = ''

    // Reject all pending requests (but keep subscriptions for restore)
    for (const [, p] of pending) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(error ?? new Error('TCP disconnected'))
    }
    pending.clear()

    if (
      !closed &&
      config.reconnect &&
      _reconnectCount < config.reconnect.attempts
    ) {
      _reconnectCount++
      await new Promise((r) => setTimeout(r, config.reconnect?.delay))
      if (!closed) await connect()
    }
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

  function sendRaw(request: RpcRequest) {
    socket?.write(`${JSON.stringify(request)}\n`)
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

      socket?.write(`${JSON.stringify(requests)}\n`)
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
    unsubscribe: () => boolean
    fromNotification: boolean
  }> {
    await connect()

    const subKey = getSubscriptionKey(method, params)
    let entry = subscriptions.get(subKey)

    if (entry) {
      entry.listeners.add(onData)
      const hasNotification = entry.lastNotification !== undefined
      return {
        initialResult: hasNotification
          ? entry.lastNotification
          : entry.initialResult,
        unsubscribe: () => {
          entry?.listeners.delete(onData)
          if (entry?.listeners.size === 0) {
            subscriptions.delete(subKey)
            return true // was the last listener
          }
          return false // other listeners remain
        },
        fromNotification: hasNotification,
      }
    }

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

    entry = {
      method,
      params,
      listeners: new Set([onData]),
      initialResult,
      lastNotification: undefined,
    }
    subscriptions.set(subKey, entry)

    return {
      initialResult,
      unsubscribe: () => {
        entry?.listeners.delete(onData)
        if (entry?.listeners.size === 0) {
          subscriptions.delete(subKey)
          return true // was the last listener
        }
        return false // other listeners remain
      },
      fromNotification: false,
    }
  }

  async function close(): Promise<void> {
    closed = true
    stopKeepAlive()
    if (batchScheduler) await batchScheduler.flush()
    for (const [, p] of pending) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(new Error('Transport closed'))
    }
    pending.clear()
    subscriptions.clear()
    socket?.destroy()
    socket = null
    connectPromise = null
    tcpSocketCache.delete(cacheKey)
  }

  client = {
    refCount: 1,
    get socket() {
      return socket
    },
    nextId,
    connectPromise,
    closed,
    buffer,
    pending,
    subscriptions,
    keepAliveTimer,
    batchScheduler,
    connect,
    sendRaw,
    request,
    subscribe,
    close,
    url,
  }

  tcpSocketCache.set(cacheKey, client)
  return client
}

export function tcp<S extends Schema = AnySchema>(
  url: string,
  options?: TcpTransportOptions & { tls?: import('tls').ConnectionOptions },
): TcpTransport<S>
export function tcp<S extends Schema = AnySchema>(
  config: TcpTransportConfig,
): TcpTransport<S>
export function tcp<S extends Schema = AnySchema>(
  configOrUrl: string | TcpTransportConfig,
  options?: TcpTransportOptions & { tls?: import('tls').ConnectionOptions },
): TcpTransport<S> {
  const config: TcpTransportConfig =
    typeof configOrUrl === 'string'
      ? ({ ...options, url: configOrUrl } as TcpTransportConfig)
      : configOrUrl

  // Compute URL without creating client
  const { host, port, tls } = parseUrl(config)
  const url = `tcp${tls ? '+tls' : ''}://${host}:${port}`

  // Lazy client initialization - only created on first use
  let client: TcpSocketClient | null = null
  const getClient = () => {
    if (!client) client = getOrCreateTcpSocketClient(config)
    return client
  }

  const retryOpts = {
    retryCount: config.retryCount,
    retryDelay: config.retryDelay,
  }

  const self: TcpTransport<S> = {
    url,

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
        const wasLastListener = unsubscribe()
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
      return client?.socket ?? null
    },

    async getSocketAsync() {
      await getClient().connect()
      const c = getClient()
      if (!c.socket) throw new Error('TCP socket not connected')
      return c.socket
    },
  }

  return self
}
