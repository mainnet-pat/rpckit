import type {
  AnySchema,
  Schema,
  WebSocketTransport,
  WebSocketTransportConfig,
} from '@rpckit/core'
import { webSocket as baseWebSocket } from '../webSocket.js'

export interface EthereumWebSocketConfig extends WebSocketTransportConfig {}

interface EthSubscriptionNotification {
  jsonrpc: '2.0'
  method: 'eth_subscription'
  params: {
    subscription: string
    result: unknown
  }
}

/**
 * WebSocket transport configured for Ethereum JSON-RPC.
 *
 * Handles Ethereum's subscription model where:
 * - `eth_subscribe` returns a subscription ID
 * - Notifications arrive via `eth_subscription` method with the subscription ID in params
 * - `eth_unsubscribe` is called with the subscription ID to clean up
 *
 * The subscription ID is captured internally and not delivered to the user callback.
 * Notifications are routed by matching the subscription ID.
 */
export function webSocket<S extends Schema = AnySchema>(
  url: string,
  options?: Omit<EthereumWebSocketConfig, 'url'>,
): WebSocketTransport<S>
export function webSocket<S extends Schema = AnySchema>(
  config: EthereumWebSocketConfig,
): WebSocketTransport<S>
export function webSocket<S extends Schema = AnySchema>(
  configOrUrl: string | EthereumWebSocketConfig,
  options?: Omit<EthereumWebSocketConfig, 'url'>,
): WebSocketTransport<S> {
  const config: EthereumWebSocketConfig =
    typeof configOrUrl === 'string'
      ? { ...options, url: configOrUrl }
      : configOrUrl

  // Track subscription IDs to callback mappings
  const subscriptionCallbacks = new Map<string, (data: unknown) => void>()
  // Track notification handlers for cleanup
  const notificationHandlers = new Map<string, (event: MessageEvent) => void>()

  const transport = baseWebSocket<S>({
    ...config,
    // Suppress the subscription ID from being delivered to the callback for eth_subscribe
    transformInitialResult: (method, _params, result) => {
      if (method === 'eth_subscribe') {
        return undefined // Suppress - we handle it in the wrapper
      }
      return result[0]
    },
    // Unsubscribe by calling eth_unsubscribe with the subscription ID
    onUnsubscribe: async ({ request, method, initialResult }) => {
      if (method === 'eth_subscribe' && typeof initialResult === 'string') {
        const handler = notificationHandlers.get(initialResult)
        if (handler) {
          const ws = transport.getSocket()
          if (ws) {
            ws.removeEventListener('message', handler)
          }
          notificationHandlers.delete(initialResult)
        }
        subscriptionCallbacks.delete(initialResult)
        await request('eth_unsubscribe', initialResult)
      }
    },
  })

  // Wrap subscribe to set up Ethereum notification routing
  const originalSubscribe = transport.subscribe.bind(transport) as (
    method: string,
    ...args: unknown[]
  ) => Promise<() => Promise<void>>

  transport.subscribe = async (
    method: string,
    ...args: unknown[]
  ): Promise<() => Promise<void>> => {
    // For non-eth_subscribe methods, use the original behavior
    if (method !== 'eth_subscribe') {
      return originalSubscribe(method, ...args)
    }

    const callback = args.pop() as (data: unknown) => void
    const params = args

    // Call the original subscribe - it will make the RPC call and get the subscription ID
    // We pass a dummy callback since transformInitialResult will suppress the initial result
    let subscriptionId: string | null = null

    const unsub = await new Promise<() => Promise<void>>((resolve, reject) => {
      // We need to intercept the initial result to get the subscription ID
      // Since transformInitialResult suppresses it, we use a request to get it
      transport
        .request('eth_subscribe', ...params)
        .then((id) => {
          subscriptionId = id as string
          subscriptionCallbacks.set(subscriptionId, callback)

          // Set up notification handler
          const ws = transport.getSocket()
          if (ws) {
            const notificationHandler = (event: MessageEvent) => {
              try {
                const msg = JSON.parse(
                  typeof event.data === 'string' ? event.data : '',
                ) as EthSubscriptionNotification
                if (
                  msg.method === 'eth_subscription' &&
                  msg.params?.subscription === subscriptionId
                ) {
                  callback(msg.params.result)
                }
              } catch {
                // Ignore parse errors
              }
            }
            ws.addEventListener('message', notificationHandler)
            notificationHandlers.set(subscriptionId, notificationHandler)
          }

          // Return unsubscribe function
          resolve(async () => {
            if (subscriptionId) {
              const handler = notificationHandlers.get(subscriptionId)
              if (handler) {
                const socket = transport.getSocket()
                if (socket) {
                  socket.removeEventListener('message', handler)
                }
                notificationHandlers.delete(subscriptionId)
              }
              subscriptionCallbacks.delete(subscriptionId)
              await transport.request('eth_unsubscribe', subscriptionId)
            }
          })
        })
        .catch(reject)
    })

    return unsub
  }

  return transport
}
