import type {
  AnySchema,
  PingConfig,
  Schema,
  WebSocketTransport,
  WebSocketTransportConfig,
} from '@rpckit/core'
import { webSocket as baseWebSocket } from '../webSocket.js'

export interface ElectrumWebSocketConfig extends WebSocketTransportConfig {
  /** Client name sent in server.version handshake (default: 'rpckit') */
  clientName?: string
  /** Electrum protocol version (default: '1.6') */
  protocolVersion?: string
}

export function webSocket<S extends Schema = AnySchema>(
  url: string,
  options?: Omit<ElectrumWebSocketConfig, 'url'>,
): WebSocketTransport<S>
export function webSocket<S extends Schema = AnySchema>(
  config: ElectrumWebSocketConfig,
): WebSocketTransport<S>
export function webSocket<S extends Schema = AnySchema>(
  configOrUrl: string | ElectrumWebSocketConfig,
  options?: Omit<ElectrumWebSocketConfig, 'url'>,
): WebSocketTransport<S> {
  const base: ElectrumWebSocketConfig =
    typeof configOrUrl === 'string'
      ? { ...options, url: configOrUrl }
      : configOrUrl

  const { clientName = 'rpckit', protocolVersion = '1.6', ...rest } = base
  const keepAlive = normalizeKeepAlive(rest.keepAlive)

  return baseWebSocket<S>({
    handshake: {
      method: 'server.version',
      params: [clientName, protocolVersion],
    },
    onUnsubscribe: ({ request, method, params }) =>
      request(
        method.replace('subscribe', 'unsubscribe'),
        ...params,
      ) as Promise<void>,
    transformInitialResult: (_method, params, result) => [...params, ...result],
    notificationFilter: electrumParamsMatch,
    ...rest,
    ...(keepAlive !== undefined ? { keepAlive } : {}),
  })
}

function normalizeKeepAlive(
  ka: WebSocketTransportConfig['keepAlive'],
): WebSocketTransportConfig['keepAlive'] {
  if (ka === undefined) return undefined
  if (typeof ka === 'number') {
    return { interval: ka, method: 'server.ping' }
  }
  const ping: PingConfig = { ...ka }
  if (!ping.method) ping.method = 'server.ping'
  return ping
}

/**
 * Electrum protocol notification filter.
 * Notifications include subscription params as prefix: subscribe([address]) → notification([address, status])
 */
function electrumParamsMatch(
  subscriptionParams: unknown[],
  notificationParams: unknown[],
): boolean {
  return subscriptionParams.every((p, i) => {
    if (i >= notificationParams.length) return false
    const np = notificationParams[i]
    // Simple types can be compared directly
    if (
      typeof p !== 'object' ||
      p === null ||
      typeof np !== 'object' ||
      np === null
    ) {
      return p === np
    }
    // Complex types need JSON comparison
    return JSON.stringify(p) === JSON.stringify(np)
  })
}
