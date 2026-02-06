import { createParse } from '../parse.js'

/**
 * Parse a transport one-liner string into a Transport with Ethereum defaults.
 *
 * Leaf transports (websocket, http) are loaded from their `ethereum`
 * subpath variants, which apply Ethereum-specific handling:
 * - WebSocket: Routes `eth_subscription` notifications to the correct callback
 * - WebSocket: Calls `eth_unsubscribe` on cleanup
 * - WebSocket: Suppresses subscription ID from callback (handled internally)
 *
 * Meta-transports (fallback, cluster) are unchanged.
 *
 * @example
 * ```typescript
 * import { parse } from '@rpckit/core/ethereum'
 *
 * const ws = await parse('wss://eth.llamarpc.com')
 * const http = await parse('https://eth.llamarpc.com?timeout=10000')
 * const fb = await parse('fallback(wss://a.com,wss://b.com)')
 * ```
 */
export const parse = createParse({
  websocket: '@rpckit/websocket/ethereum',
  http: '@rpckit/http/ethereum',
})
