# @rpckit/core

Core types, schema utilities, and batch scheduler for communication with JSON-RPC servers.

## Installation

```bash
npm install @rpckit/core
```

## Usage

```typescript
import type { Schema, Transport } from '@rpckit/core'
import { webSocket } from '@rpckit/websocket'

type MySchema = {
  requests: [
    { method: 'getblockcount'; params: []; return: number }
  ]
  subscriptions: []
}

const transport = webSocket<MySchema>('wss://example.com')
const blockCount = await transport.request('getblockcount')
await transport.close()
```

## Electrum Cash Subpackage

Electrum Cash schema types and a pre-configured `parse()` variant are available under the `electrum-cash` subpath:

```typescript
import type { ElectrumCashSchema } from '@rpckit/core/electrum-cash'
import { parse } from '@rpckit/core/electrum-cash'

const transport = await parse('wss://electrum.example.com')
```

## Ethereum Subpackage

Ethereum schema types and a pre-configured `parse()` variant are available under the `ethereum` subpath:

```typescript
import type { EthereumSchema } from '@rpckit/core/ethereum'
import { parse } from '@rpckit/core/ethereum'

const transport = await parse('wss://ethereum-rpc.publicnode.com')
```

## Parse Utility

Create transports from one-liner configuration strings:

```typescript
import { parse } from '@rpckit/core'

// Simple transports (uses base, protocol-agnostic packages)
const ws = await parse('wss://example.com:50004')
const tcp = await parse('tcp+tls://example.com:50002?timeout=10000')

// With options
const batched = await parse('wss://example.com?batchSize=10&batchWait=50')

// Fallback with ranking
const fb = await parse('fallback(wss://a.com,tcp://b.com)?rank=true')

// Cluster with quorum
const cl = await parse('cluster(2,ws://1.com,ws://2.com,ws://3.com)')

// Nested
const nested = await parse('fallback(wss://primary.com,cluster(2,ws://1.com,ws://2.com,ws://3.com))')
```

### createParse

Create a custom `parse` function that uses different packages for transport creation:

```typescript
import { createParse } from '@rpckit/core'

// Use electrum-cash variants for all transports
const electrumParse = createParse({
  websocket: '@rpckit/websocket/electrum-cash',
  tcp: '@rpckit/tcp/electrum-cash',
  http: '@rpckit/http/electrum-cash',
})

const transport = await electrumParse('wss://electrum.example.com')
```

A pre-built Electrum Cash parse is available at `@rpckit/core/electrum-cash`.

### createParseSync

Create a synchronous `parse` function using pre-imported factory functions. Unlike `createParse` which uses dynamic imports, this variant accepts already-loaded factories:

```typescript
import { createParseSync } from '@rpckit/core'
import { webSocket } from '@rpckit/websocket/electrum-cash'
import { fallback } from '@rpckit/fallback'

const parseSync = createParseSync({ webSocket, fallback })
const transport = parseSync('fallback(wss://a.com,wss://b.com)?eagerConnect=true')
```

Supported schemes: `wss://`, `ws://`, `tcp://`, `tcp+tls://`, `http://`, `https://`

Supported options: `timeout`, `retryCount`, `retryDelay`, `keepAlive`, `batch`, `batchSize`, `batchWait`, `rank`, `eagerConnect`

## Exports

### Main (`@rpckit/core`)

- `BatchScheduler` - Request batching utility
- `parse` - One-liner transport configuration parser
- `createParse` - Factory for custom parse functions with overridden package maps
- `createParseSync` - Synchronous factory using pre-imported transport functions
- `withRetry` - Async retry utility with exponential backoff
- `Transport` - Transport interface for implementing custom transports
- Type utilities: `ExtractReturn`, `ExtractParams`, `ExtractMethod`, `FilterMethods`, `OverrideRequests`, `PackageMap`, `FactoryMap`, etc.

### Electrum Cash (`@rpckit/core/electrum-cash`)

- `parse` - Pre-configured parse using Electrum Cash transport variants
- `ElectrumCashSchema` - Type definitions for Electrum Cash protocol (v1.5 and v1.6)

### Ethereum (`@rpckit/core/ethereum`)

- `parse` - Pre-configured parse using Ethereum transport variants
- `EthereumSchema` - Type definitions for Ethereum JSON-RPC (EIP-1474 standard methods)
