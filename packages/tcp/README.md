# @rpckit/tcp

TCP transport for rpckit (Node.js only). Supports TLS, subscriptions, keep-alive, and request batching.

## Installation

```bash
npm install @rpckit/core @rpckit/tcp
```

## Usage

```typescript
import { tcp } from '@rpckit/tcp'

// Plain TCP
const transport = tcp('tcp://example.com:50001')

// TCP with TLS
const tlsTransport = tcp('tcp+tls://example.com:50002')

await transport.connect()
const result = await transport.request('my.method', 'param1')
await transport.close()
```

## Electrum Cash Variant

For Electrum Cash servers, use the `electrum-cash` subpath which pre-configures handshake, keep-alive method, and unsubscribe conventions:

```typescript
import { tcp } from '@rpckit/tcp/electrum-cash'

const transport = tcp('tcp+tls://electrum.example.com:50002', {
  keepAlive: 60000  // Automatically uses server.ping
})

// Handshake (server.version) sent automatically on connect
const tip = await transport.request('blockchain.headers.get_tip')
```

The electrum-cash variant also accepts:

- `clientName` - Client name sent in server.version handshake (default: `'rpckit'`)
- `protocolVersion` - Protocol version (default: `'1.6'`)

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
- `tls` - TLS options (or `true` for defaults when using `tcp+tls://`)
- `reconnect` - `{ delay: number, attempts: number }` for auto-reconnect after disconnect
- `handshake` - `{ method, params }` to send on connect
- `batch` - `true` (default), `false`, or `{ wait, batchSize }`
- `onUnsubscribe` - Cleanup callback when the last listener unsubscribes (receives `{ request, method, params, initialResult }`)
- `notificationFilter` - Filter notifications before delivery; receives `(subscriptionParams, notificationParams)` and returns `boolean`
- `transformInitialResult` - Transform the initial subscription result before delivery; return `undefined` to suppress

## Socket Access

Access the underlying TCP socket for advanced use cases:

```typescript
// Synchronous - returns null if not yet connected
const socket = transport.getSocket()

// Async - connects first if needed, then returns socket
const socket = await transport.getSocketAsync()
```

## Lazy Initialization

Connections are established lazily on first use. Creating a transport is cheap - no resources are allocated until the first `request()`, `subscribe()`, or `connect()` call.
