<p align="center">
  <img src="site/public/logo.svg" alt="rpckit" width="190" />
</p>

# rpckit

A modular TypeScript library for communication with JSON-RPC servers.

> Heavily inspired by [viem](https://github.com/wevm/viem)'s transport architecture, but with a simpler object-based API instead of curried functions. Designed for direct use without requiring a client wrapper.
>
> The library is protocol-agnostic at its core. Base transports handle raw JSON-RPC communication, while protocol-specific variants (like `electrum-cash`) layer on handshake, keep-alive, and unsubscribe conventions. You can define your own schema for any JSON-RPC service.

## Features

- **Type-safe** - Full TypeScript support with schema-based type inference
- **Multiple transports** - WebSocket, TCP (with TLS), HTTP
- **Meta-transports** - Fallback (failover) and Cluster (quorum consensus)
- **Protocol variants** - Pre-configured transports for specific protocols (e.g. Electrum Cash)
- **Subscriptions** - Built-in support with auto-restore on reconnect
- **Batching** - Automatic request batching across all transports
- **Retry** - Configurable retry with exponential backoff
- **Lazy connections** - Resources allocated only on first use
- **Connection pooling** - Shared connections with ref counting

## Packages

| Package | Description |
|---------|-------------|
| [@rpckit/core](./packages/core) | Core types, schema utilities, and batch scheduler |
| [@rpckit/websocket](./packages/websocket) | WebSocket transport with subscriptions |
| [@rpckit/tcp](./packages/tcp) | TCP transport (Node.js) with TLS support |
| [@rpckit/http](./packages/http) | HTTP transport for stateless requests |
| [@rpckit/fallback](./packages/fallback) | Failover across multiple transports with health ranking |
| [@rpckit/cluster](./packages/cluster) | M-of-N quorum consensus |

Each transport package also exports protocol-specific variants:
- Electrum Cash: `@rpckit/websocket/electrum-cash`, `@rpckit/http/electrum-cash`, etc.
- Ethereum: `@rpckit/websocket/ethereum`, `@rpckit/http/ethereum`, etc.

## Quick Start

### Generic JSON-RPC

```typescript
import { http } from '@rpckit/http'

const transport = http('https://my-jsonrpc-server.com')

const result = await transport.request('getblockcount')
console.log(result) // 875000

await transport.close()
```

### Electrum Cash

```typescript
import type { ElectrumCashSchema } from '@rpckit/core/electrum-cash'
import { webSocket } from '@rpckit/websocket/electrum-cash'

const transport = webSocket<ElectrumCashSchema>('wss://electrum.example.com:50004')

// Typed requests (connection established lazily, handshake sent automatically)
const tip = await transport.request('blockchain.headers.get_tip')
console.log(tip.height) // number

// Subscriptions with auto-restore on reconnect
const unsub = await transport.subscribe('blockchain.headers.subscribe', (header) => {
  console.log('New block:', header)
})

await transport.close()
```

### Ethereum

```typescript
import type { EthereumSchema } from '@rpckit/core/ethereum'
import { webSocket } from '@rpckit/websocket/ethereum'

const transport = webSocket<EthereumSchema>('wss://ethereum-rpc.publicnode.com')

// Typed requests
const blockNumber = await transport.request('eth_blockNumber')
console.log(blockNumber) // '0x...'

const balance = await transport.request('eth_getBalance', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'latest')
console.log(balance) // '0x...'

// Subscriptions (Ethereum transport handles eth_subscription routing automatically)
const unsub = await transport.subscribe('eth_subscribe', 'newHeads', (header) => {
  console.log('New block:', header.number, header.hash)
})

await transport.close()
```

## Protocol Variants

Base transports (`@rpckit/websocket`, `@rpckit/tcp`, `@rpckit/http`) are protocol-agnostic. For protocol-specific defaults, use the subpath variants:

```typescript
// Electrum Cash variant - includes handshake, keepAlive method, unsubscribe convention
import { webSocket } from '@rpckit/websocket/electrum-cash'
import { tcp } from '@rpckit/tcp/electrum-cash'
import { http } from '@rpckit/http/electrum-cash'

// Ethereum variant - handles eth_subscription notification routing
import { webSocket } from '@rpckit/websocket/ethereum'
import { http } from '@rpckit/http/ethereum'
```

The Electrum Cash variants automatically:
- Send `server.version` handshake on connect
- Use `server.ping` as the keep-alive method
- Derive unsubscribe method from subscribe method (e.g. `blockchain.headers.subscribe` -> `blockchain.headers.unsubscribe`)
- Include `server.version` header for HTTP requests

The Ethereum variants automatically:
- Route `eth_subscription` notifications to the correct subscription callback by subscription ID
- Call `eth_unsubscribe` on cleanup
- Suppress subscription IDs from callbacks (handled internally)

## Advanced: Fallback with Ranking

```typescript
import { fallback } from '@rpckit/fallback'
import { webSocket } from '@rpckit/websocket/electrum-cash'

const transport = fallback([
  webSocket('wss://server1.example.com:50004'),
  webSocket('wss://server2.example.com:50004'),
], { rank: true })

// Requests route to the best-performing server
const tip = await transport.request('blockchain.headers.get_tip')

// Monitor scores
transport.onScores((scores) => {
  console.log('Server rankings:', scores)
})
```

## Advanced: Cluster Consensus

```typescript
import { cluster } from '@rpckit/cluster'
import { webSocket } from '@rpckit/websocket/electrum-cash'

const transport = cluster([
  webSocket('wss://server1.example.com:50004'),
  webSocket('wss://server2.example.com:50004'),
  webSocket('wss://server3.example.com:50004'),
], { quorum: 2 })

// Only resolves when 2 servers agree
const tip = await transport.request('blockchain.headers.get_tip')
```

## Advanced: URL Parsing

Create transports from one-liner URL strings:

```typescript
import { parse } from '@rpckit/core'

// Uses base transports
const ws = await parse('wss://example.com?timeout=5000')

// Use protocol-specific parse functions
import { parse as electrumParse } from '@rpckit/core/electrum-cash'
import { parse as ethereumParse } from '@rpckit/core/ethereum'

const electrum = await electrumParse('wss://electrum.example.com')
const ethereum = await ethereumParse('wss://ethereum-rpc.publicnode.com')
```

### Synchronous Parsing

For bundled applications where dynamic imports aren't ideal, use `createParseSync` with pre-imported factories:

```typescript
import { createParseSync } from '@rpckit/core'
import { webSocket } from '@rpckit/websocket/electrum-cash'
import { fallback } from '@rpckit/fallback'

const parse = createParseSync({ webSocket, fallback })
const transport = parse('fallback(wss://a.com,wss://b.com)?eagerConnect=true')
```

## Development

```bash
yarn install
yarn test
yarn build
```

## Support

If you find rpckit useful, consider supporting its development:

| Currency | Address |
|----------|---------|
| Bitcoin Cash | `bitcoincash:qrcjhgw2v0u8e6nf668qwky2rpq79szr2uxtpu60z8` |
| Bitcoin | `bc1qmwmhfr6atyz4r5vzsycs34fd4sxrxwrlmevfp6` |
| Ethereum (and other EVMs) | `0xf2E0DEbda73A7E6901D18d4C3aBCa7419a137940` |

## License

MIT
