# @rpckit/cluster

Cluster meta-transport for rpckit. Provides m-of-n quorum consensus across multiple transports.

## Installation

```bash
npm install @rpckit/core @rpckit/cluster
```

## Usage

```typescript
import type { ElectrumCashSchema } from '@rpckit/core/electrum-cash'
import { cluster } from '@rpckit/cluster'
import { webSocket } from '@rpckit/websocket'

const transport = cluster<ElectrumCashSchema>(
  [
    webSocket('wss://server1.example.com:50004'),
    webSocket('wss://server2.example.com:50004'),
    webSocket('wss://server3.example.com:50004'),
  ],
  { quorum: 2, timeout: 10000 }, // Require 2-of-3 agreement
)

await transport.connect()

// Only resolves when 2 servers return identical results
const tip = await transport.request('blockchain.headers.get_tip')

await transport.close()
```

## Options

- `quorum` - Number of identical responses required (must be ≥1 and ≤ number of transports)
- `timeout` - Timeout in ms for quorum to be reached

## How It Works

1. Request is sent to all transports in parallel
2. Responses are compared using deep equality
3. When `quorum` transports return identical results, that result is returned
4. If quorum cannot be reached (too many errors or different results), an error is thrown

Subscriptions also support quorum - notifications are only forwarded when enough transports agree.

## Response Observation

Monitor all requests and responses from individual transports:

```typescript
const unsub = transport.onResponse(({ method, params, transport, response, error, status }) => {
  console.log(`${method} via ${transport.url}: ${status}`)
})
// Later: unsub()

// Access underlying transports
console.log(transport.transports)
```
