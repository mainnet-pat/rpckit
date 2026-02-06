import type {
  AnySchema,
  PingConfig,
  Schema,
  TcpTransport,
  TcpTransportOptions,
} from '@rpckit/core'
import { tcp as baseTcp } from '../tcp.js'

export interface ElectrumTcpOptions extends TcpTransportOptions {
  /** Client name sent in server.version handshake (default: 'rpckit') */
  clientName?: string
  /** Electrum protocol version (default: '1.6') */
  protocolVersion?: string
}

export type ElectrumTcpConfig =
  | ({
      url: string
      tls?: import('tls').ConnectionOptions
    } & ElectrumTcpOptions)
  | ({
      host: string
      port: number
      tls?: boolean | import('tls').ConnectionOptions
    } & ElectrumTcpOptions)

export function tcp<S extends Schema = AnySchema>(
  url: string,
  options?: ElectrumTcpOptions & { tls?: import('tls').ConnectionOptions },
): TcpTransport<S>
export function tcp<S extends Schema = AnySchema>(
  config: ElectrumTcpConfig,
): TcpTransport<S>
export function tcp<S extends Schema = AnySchema>(
  configOrUrl: string | ElectrumTcpConfig,
  options?: ElectrumTcpOptions & { tls?: import('tls').ConnectionOptions },
): TcpTransport<S> {
  if (typeof configOrUrl === 'string') {
    const {
      clientName = 'rpckit',
      protocolVersion = '1.6',
      ...rest
    } = options ?? {}
    const keepAlive = normalizeKeepAlive(rest.keepAlive)
    return baseTcp<S>(configOrUrl, {
      handshake: {
        method: 'server.version',
        params: [clientName, protocolVersion],
      },
      onUnsubscribe: ({ request, method, params }) =>
        request(
          method.replace('subscribe', 'unsubscribe'),
          ...params,
        ) as Promise<void>,
      transformInitialResult: (_method, params, result) => [
        ...params,
        ...result,
      ],
      notificationFilter: electrumParamsMatch,
      ...rest,
      ...(keepAlive !== undefined ? { keepAlive } : {}),
    })
  }

  const {
    clientName = 'rpckit',
    protocolVersion = '1.6',
    ...rest
  } = configOrUrl
  const keepAlive = normalizeKeepAlive(rest.keepAlive)

  return baseTcp<S>({
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
  ka: TcpTransportOptions['keepAlive'],
): TcpTransportOptions['keepAlive'] {
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
