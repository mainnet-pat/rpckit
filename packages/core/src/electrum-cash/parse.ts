import { createParse } from '../parse.js'

/**
 * Parse a transport one-liner string into a Transport with Electrum Cash defaults.
 *
 * Leaf transports (websocket, tcp, http) are loaded from their `electrum-cash`
 * subpath variants, which apply protocol-specific defaults:
 * - Handshake: `server.version` with `['rpckit', '1.6']`
 * - KeepAlive: `server.ping` method when interval is specified
 * - Unsubscribe: `method.replace('subscribe', 'unsubscribe')`
 * - HTTP headers: `Server-Version` header
 *
 * Use `clientName` to override the client name in the handshake (default: `'rpckit'`).
 * Use `protocolVersion` to override the protocol version (default: `'1.6'`).
 *
 * Meta-transports (fallback, cluster) are unchanged.
 *
 * @example
 * ```typescript
 * import { parse } from '@rpckit/core/electrum-cash'
 *
 * const ws = await parse('wss://electrum.example.com')
 * const tcp = await parse('tcp+tls://electrum.example.com:50002?timeout=10000')
 * const custom = await parse('wss://electrum.example.com?clientName=myapp')
 * const fb = await parse('fallback(wss://a.com,tcp://b.com:50001)')
 * ```
 */
export const parse = createParse({
  websocket: '@rpckit/websocket/electrum-cash',
  tcp: '@rpckit/tcp/electrum-cash',
  http: '@rpckit/http/electrum-cash',
})
