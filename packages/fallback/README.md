# @rpckit/fallback

Fallback meta-transport for rpckit. Provides automatic failover across multiple transports with optional health-based ranking.

## Installation

```bash
npm install @rpckit/core @rpckit/fallback
```

## Usage

```typescript
import { fallback } from '@rpckit/fallback'
import { webSocket } from '@rpckit/websocket'
import { http } from '@rpckit/http'

const transport = fallback([
  webSocket('wss://primary.example.com'),
  http('https://backup.example.com'),
])

await transport.connect()

// Automatically tries next transport on failure
const result = await transport.request('my.method', 'param')

await transport.close()
```

## Options

- `shouldThrow` - `(error: Error) => boolean | undefined` to control fallback behavior per error. Return `true` to throw immediately, `false` to continue to next transport, or `undefined` to use default logic. By default, deterministic JSON-RPC errors (parse error, invalid request, invalid params) stop the fallback chain.
- `rank` - `true` or `{ interval, sampleCount, timeout, weights, ping }` for health ranking
- `eagerConnect` - Connect to all transports in parallel (fastest transport is prioritized)

## Health Ranking

When `rank` is enabled, transports are periodically pinged and ranked by latency and stability. Requests are routed to the best-performing transport first.

**Note:** Without a `ping` function, ranking has no way to probe transport health and will not collect samples — effectively making it a no-op. Provide a `ping` function appropriate for your protocol.

```typescript
const transport = fallback(transports, {
  rank: {
    interval: 4000,      // ms between health checks (default: 4000)
    timeout: 1000,       // ping timeout in ms (default: 1000)
    sampleCount: 10,     // number of samples to average (default: 10)
    weights: {
      latency: 0.3,      // weight for latency score (default: 0.3)
      stability: 0.7,    // weight for stability score (default: 0.7)
    },
    ping: (t) => t.request('health.check'),  // provide a ping function for your protocol
  },
})
```

### Accessing Scores

```typescript
// Get current scores
console.log(transport.scores)
// [{ transport, score, latency, stability }, ...]

// Get ranked transport list
console.log(transport.transports)

// Subscribe to score updates
const unsub = transport.onScores((scores) => {
  console.log('Scores updated:', scores)
})
// Later: unsub()
```

## Electrum Cash Variant

The `@rpckit/fallback/electrum-cash` subpath provides a variant with `server.ping` as the default ping function for health ranking and a protocol-aware `shouldThrow` that retries on transient server errors (internal error, OOM, warmup, syncing) while stopping on deterministic errors (invalid params, bad address, etc.):

```typescript
import { fallback } from '@rpckit/fallback/electrum-cash'
import { webSocket } from '@rpckit/websocket/electrum-cash'

const transport = fallback([
  webSocket('wss://server1.example.com:50004'),
  webSocket('wss://server2.example.com:50004'),
], { rank: true })  // Uses server.ping for health checks
```

The `shouldThrow` function is also exported for use in custom configurations:

```typescript
import { shouldThrow } from '@rpckit/fallback/electrum-cash'
```

## Response Observation

Monitor all requests and responses across transports:

```typescript
const unsub = transport.onResponse(({ method, params, transport, response, error, status }) => {
  console.log(`${method} via ${transport.url}: ${status}`)
  if (status === 'error') {
    console.error('Failed:', error)
  }
})
// Later: unsub()
```
