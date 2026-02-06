# @rpckit/websocket

WebSocket transport for rpckit. Supports subscriptions, keep-alive, reconnection, and request batching.

## Installation

```bash
npm install @rpckit/core @rpckit/websocket
```

## Usage

```typescript
import { webSocket } from '@rpckit/websocket'

const transport = webSocket('wss://example.com', {
  timeout: 10000,
  keepAlive: { interval: 30000, method: 'server.ping' },
  reconnect: { delay: 1000, attempts: 5 }
})

await transport.connect()
const result = await transport.request('my.method', 'param1')

// Subscriptions
const unsub = await transport.subscribe('events.subscribe', (data) => {
  console.log('Event:', data)
})

await transport.close()
```

## Electrum Cash Variant

For Electrum Cash servers, use the `electrum-cash` subpath which pre-configures handshake, keep-alive method, and unsubscribe conventions:

```typescript
import { webSocket } from '@rpckit/websocket/electrum-cash'

const transport = webSocket('wss://electrum.example.com:50004', {
  keepAlive: 30000  // Automatically uses server.ping
})

// Handshake (server.version) sent automatically on connect
const tip = await transport.request('blockchain.headers.get_tip')

// Unsubscribe automatically calls blockchain.headers.unsubscribe
const unsub = await transport.subscribe('blockchain.headers.subscribe', (header) => {
  console.log('New block:', header)
})
await unsub()
```

The electrum-cash variant also accepts:

- `clientName` - Client name sent in server.version handshake (default: `'rpckit'`)
- `protocolVersion` - Protocol version (default: `'1.6'`)

## Ethereum Variant

For Ethereum JSON-RPC nodes, use the `ethereum` subpath which handles subscription routing:

```typescript
import { webSocket } from '@rpckit/websocket/ethereum'

const transport = webSocket('wss://ethereum-rpc.publicnode.com')

// Standard requests
const blockNumber = await transport.request('eth_blockNumber')

// Subscriptions - eth_subscription notifications are routed automatically
const unsub = await transport.subscribe('eth_subscribe', 'newHeads', (header) => {
  console.log('New block:', header.number)
})

// eth_unsubscribe called automatically
await unsub()
```

The ethereum variant automatically:

- Routes `eth_subscription` notifications to the correct callback by subscription ID
- Calls `eth_unsubscribe` on cleanup
- Suppresses subscription IDs from callbacks (handled internally)

## Subscription Sharing

Multiple callers subscribing to the same method+params will share a single server subscription. New subscribers receive the most recent notification data (not stale initial data). The server unsubscribe is only sent when the last listener unsubscribes.

```typescript
// Both callbacks share one server subscription
const unsub1 = await transport.subscribe('events', callback1)
const unsub2 = await transport.subscribe('events', callback2)

await unsub1() // callback1 removed, server subscription stays active
await unsub2() // callback2 removed, NOW server unsubscribe is sent
```

## Options

- `timeout` - Request timeout in ms
- `connectTimeout` - Connection timeout in ms
- `retryCount` - Max retry attempts (default: 3)
- `retryDelay` - Base delay between retries in ms (default: 150, exponential backoff applied)
- `keepAlive` - Keep-alive ping interval in ms, or `{ interval, method, params }`
- `reconnect` - `{ delay: number, attempts: number }` for auto-reconnect after disconnect
- `headers` - Custom headers for the WebSocket connection
- `handshake` - `{ method, params }` to send on connect
- `batch` - `true` (default), `false`, or `{ wait, batchSize }`
- `onUnsubscribe` - Cleanup callback when the last listener unsubscribes (receives `{ request, method, params, initialResult }`)
- `notificationFilter` - Filter notifications before delivery; receives `(subscriptionParams, notificationParams)` and returns `boolean`
- `transformInitialResult` - Transform the initial subscription result before delivery; return `undefined` to suppress

## Socket Access

Access the underlying WebSocket for advanced use cases:

```typescript
// Synchronous - returns null if not yet connected
const socket = transport.getSocket()

// Async - connects first if needed, then returns socket
const socket = await transport.getSocketAsync()
```

## Lazy Initialization

Connections are established lazily on first use. Creating a transport is cheap - no resources are allocated until the first `request()`, `subscribe()`, or `connect()` call.
