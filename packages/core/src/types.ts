import type {
  AnySchema,
  ExtractParams,
  ExtractRequestMethod,
  ExtractReturn,
  ExtractSubscriptionMethod,
  Schema,
} from './schema.js'

export type UnsubscribeCleanup = (context: {
  request: (method: string, ...params: unknown[]) => Promise<unknown>
  method: string
  params: unknown[]
  initialResult: unknown
}) => Promise<void>

export type Unsubscribe = (cleanup?: UnsubscribeCleanup) => Promise<void>

export interface Transport<S extends Schema = AnySchema> {
  url: string
  connect(): Promise<void>
  request<M extends ExtractRequestMethod<S>>(
    method: M,
    ...params: ExtractParams<S, M>
  ): Promise<ExtractReturn<S, M>>
  subscribe<M extends ExtractSubscriptionMethod<S>>(
    method: M,
    ...args: [
      ...ExtractParams<S, M>,
      callback: (data: ExtractReturn<S, M>) => void,
    ]
  ): Promise<Unsubscribe>
  close(): Promise<void>
}

export interface BatchConfig {
  wait?: number
  batchSize?: number
  /** Cooldown in ms before re-enabling batching after server rejection (default: 5_000) */
  disabledCooldown?: number
}

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  retryCount?: number
  /** Base delay between retries in ms (default: 150). Exponential backoff is applied. */
  retryDelay?: number
}

export interface PingConfig {
  interval: number
  method?: string
  params?: unknown[]
}

export interface HandshakeConfig {
  method: string
  params?: unknown[]
}

export interface WebSocketTransportConfig extends RetryConfig {
  url: string
  /** Request timeout in milliseconds */
  timeout?: number
  /** Connection timeout in milliseconds */
  connectTimeout?: number
  handshake?: HandshakeConfig
  keepAlive?: number | PingConfig
  reconnect?: { delay: number; attempts: number }
  headers?: Record<string, string>
  batch?: boolean | BatchConfig
  onUnsubscribe?: UnsubscribeCleanup
  /**
   * Transform the initial subscription result before delivering to the callback.
   * Useful for normalizing initial results to match the notification format.
   * `result` is the raw value wrapped in a single-element array.
   * For example, Electrum Cash notifications arrive as [...params, ...result]
   * while the initial result is just the raw value `[value]`.
   *
   * Return `undefined` to suppress delivery of the initial result to the callback.
   * This is useful for protocols like Ethereum where the initial result is a
   * subscription ID (metadata) rather than actual data.
   */
  transformInitialResult?: (
    method: string,
    params: unknown[],
    result: unknown[],
  ) => unknown
  /**
   * Filter notifications before delivery to subscribers. Return true to deliver.
   * Used by protocols like Electrum Cash where multiple subscriptions share the
   * same method name but use different params for routing.
   */
  notificationFilter?: (
    subscriptionParams: unknown[],
    notificationParams: unknown[],
  ) => boolean
}

/** Extended WebSocket transport with socket access methods */
export interface WebSocketTransport<S extends Schema = AnySchema>
  extends Transport<S> {
  /** Get the underlying WebSocket instance (null if not connected) */
  getSocket(): WebSocket | null
  /** Get the underlying WebSocket instance, connecting first if needed */
  getSocketAsync(): Promise<WebSocket>
}

/** Extended TCP transport with socket access methods */
export interface TcpTransport<S extends Schema = AnySchema>
  extends Transport<S> {
  /** Get the underlying TCP socket (null if not connected) */
  getSocket(): import('node:net').Socket | null
  /** Get the underlying TCP socket, connecting first if needed */
  getSocketAsync(): Promise<import('node:net').Socket>
}

export type TcpTransportConfig =
  | ({
      url: string
      tls?: import('tls').ConnectionOptions
    } & TcpTransportOptions)
  | ({
      host: string
      port: number
      tls?: boolean | import('tls').ConnectionOptions
    } & TcpTransportOptions)

export interface TcpTransportOptions extends RetryConfig {
  /** Request timeout in milliseconds */
  timeout?: number
  /** Connection timeout in milliseconds */
  connectTimeout?: number
  handshake?: HandshakeConfig
  keepAlive?: number | PingConfig
  reconnect?: { delay: number; attempts: number }
  batch?: boolean | BatchConfig
  onUnsubscribe?: UnsubscribeCleanup
  /**
   * Transform the initial subscription result before delivering to the callback.
   * `result` is the raw value wrapped in a single-element array.
   *
   * Return `undefined` to suppress delivery of the initial result to the callback.
   */
  transformInitialResult?: (
    method: string,
    params: unknown[],
    result: unknown[],
  ) => unknown
  /**
   * Filter notifications before delivery to subscribers. Return true to deliver.
   * Used by protocols like Electrum Cash where multiple subscriptions share the
   * same method name but use different params for routing.
   */
  notificationFilter?: (
    subscriptionParams: unknown[],
    notificationParams: unknown[],
  ) => boolean
}

export interface HttpTransportConfig extends RetryConfig {
  url: string
  /** Request timeout in milliseconds */
  timeout?: number
  headers?: Record<string, string>
  batch?: boolean | BatchConfig
  /** Custom fetch implementation (e.g., node-fetch, undici) */
  fetchFn?: typeof fetch
  /** Extra options passed to fetch (excluding method, headers, body, signal) */
  fetchOptions?: Omit<RequestInit, 'method' | 'headers' | 'body' | 'signal'>
  /** Callback before each fetch request */
  onRequest?: (info: { url: string; body: unknown }) => void
  /** Callback after each fetch response */
  onResponse?: (info: { status: number; body: unknown }) => void
  /** Return RPC errors as results instead of throwing (default: false) */
  raw?: boolean
}

export interface RankConfig<S extends Schema = AnySchema> {
  interval?: number
  ping?: (transport: Transport<S>) => Promise<unknown>
  sampleCount?: number
  timeout?: number
  weights?: {
    latency?: number
    stability?: number
  }
}

export interface TransportScore<S extends Schema = AnySchema> {
  transport: Transport<S>
  score: number
  latency: number
  stability: number
}

export interface TransportResponse<S extends Schema = AnySchema> {
  method: string
  params: unknown[]
  transport: Transport<S>
  response?: unknown
  error?: unknown
  status: 'success' | 'error'
}

export interface FallbackTransport<S extends Schema = AnySchema>
  extends Transport<S> {
  transports: Transport<S>[]
  scores: TransportScore<S>[]
  onScores(listener: (scores: TransportScore<S>[]) => void): () => void
  onResponse(listener: (info: TransportResponse<S>) => void): () => void
}

export interface ClusterTransport<S extends Schema = AnySchema>
  extends Transport<S> {
  transports: Transport<S>[]
  onResponse(listener: (info: TransportResponse<S>) => void): () => void
}

export interface FallbackTransportOptions<S extends Schema = AnySchema> {
  shouldThrow?: (error: Error) => boolean | undefined
  rank?: boolean | RankConfig<S>
  eagerConnect?: boolean
}

export interface ClusterTransportOptions {
  quorum: number
  timeout?: number
}
