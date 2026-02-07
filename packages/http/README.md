# @rpckit/http

HTTP transport for rpckit. Stateless JSON-RPC over HTTP POST with request batching.

## Installation

```bash
npm install @rpckit/core @rpckit/http
```

## Usage

```typescript
import { http } from '@rpckit/http'

const transport = http('https://example.com/rpc', {
  headers: { 'Authorization': 'Bearer token' }
})

const result = await transport.request('my.method', 'param1')
await transport.close()
```

## Electrum Cash Variant

For Electrum Cash servers, use the `electrum-cash` subpath which pre-configures the `Server-Version` header:

```typescript
import { http } from '@rpckit/http/electrum-cash'

const transport = http('https://electrum.example.com')
const tip = await transport.request('blockchain.headers.get_tip')
```

The electrum-cash variant also accepts:

- `clientName` - Client name sent in Server-Version header (default: `'rpckit'`)
- `protocolVersion` - Protocol version (default: `'1.6'`)

## Ethereum Variant

For Ethereum JSON-RPC nodes, use the `ethereum` subpath:

```typescript
import { http } from '@rpckit/http/ethereum'

const transport = http('https://ethereum-rpc.publicnode.com')

const blockNumber = await transport.request('eth_blockNumber')
const balance = await transport.request('eth_getBalance', '0x...', 'latest')
```

## Options

- `timeout` - Request timeout in ms
- `headers` - Custom HTTP headers
- `retryCount` - Max retry attempts (default: 3)
- `retryDelay` - Base delay between retries in ms (default: 150, exponential backoff applied)
- `batch` - `true` (default), `false`, or `{ wait, batchSize }`
- `fetchFn` - Custom fetch implementation (e.g., `node-fetch`, `undici`)
- `fetchOptions` - Extra options passed to fetch (excluding `method`, `headers`, `body`, `signal`)
- `onRequest` - Callback before each request: `({ url, body }) => void`
- `onResponse` - Callback after each response: `({ status, body }) => void`
- `raw` - Return full RPC response objects instead of unwrapping results (default: `false`)

## Raw Mode

When `raw: true`, responses include the full JSON-RPC envelope:

```typescript
const transport = http('https://example.com', { raw: true })

const response = await transport.request('server.version')
// { jsonrpc: '2.0', result: ['Server', '1.4'], id: 1 }

// Errors are returned as results instead of thrown:
// { jsonrpc: '2.0', error: { code: -1, message: '...' }, id: 2 }
```

## Note

HTTP transport does not support subscriptions. Use WebSocket or TCP for subscription methods.
