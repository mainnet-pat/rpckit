import type {
  AnySchema,
  HttpTransportConfig,
  Schema,
  Transport,
} from '@rpckit/core'
import { http as baseHttp } from '../http.js'

export interface EthereumHttpConfig extends HttpTransportConfig {}

/**
 * HTTP transport configured for Ethereum JSON-RPC.
 *
 * This is a thin wrapper over the base HTTP transport.
 * Ethereum doesn't require special HTTP handling, but this variant
 * is provided for consistency with the WebSocket variant.
 *
 * Note: HTTP transport does not support subscriptions.
 * Use the WebSocket variant for `eth_subscribe`.
 */
export function http<S extends Schema = AnySchema>(
  url: string,
  options?: Omit<EthereumHttpConfig, 'url'>,
): Transport<S>
export function http<S extends Schema = AnySchema>(
  config: EthereumHttpConfig,
): Transport<S>
export function http<S extends Schema = AnySchema>(
  configOrUrl: string | EthereumHttpConfig,
  options?: Omit<EthereumHttpConfig, 'url'>,
): Transport<S> {
  const config: EthereumHttpConfig =
    typeof configOrUrl === 'string'
      ? { ...options, url: configOrUrl }
      : configOrUrl

  return baseHttp<S>(config)
}
