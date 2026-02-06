import type {
  AnySchema,
  HttpTransportConfig,
  Schema,
  Transport,
} from '@rpckit/core'
import { http as baseHttp } from '../http.js'

export interface ElectrumHttpConfig extends HttpTransportConfig {
  /** Client name sent in server.version header (default: 'rpckit') */
  clientName?: string
  /** Electrum protocol version (default: '1.6') */
  protocolVersion?: string
}

export function http<S extends Schema = AnySchema>(
  url: string,
  options?: Omit<ElectrumHttpConfig, 'url'>,
): Transport<S>
export function http<S extends Schema = AnySchema>(
  config: ElectrumHttpConfig,
): Transport<S>
export function http<S extends Schema = AnySchema>(
  configOrUrl: string | ElectrumHttpConfig,
  options?: Omit<ElectrumHttpConfig, 'url'>,
): Transport<S> {
  const base: ElectrumHttpConfig =
    typeof configOrUrl === 'string'
      ? { ...options, url: configOrUrl }
      : configOrUrl

  const { clientName = 'rpckit', protocolVersion = '1.6', ...rest } = base

  return baseHttp<S>({
    ...rest,
    headers: {
      'server.version': `["${clientName}", "${protocolVersion}"]`,
      ...rest.headers,
    },
  })
}
