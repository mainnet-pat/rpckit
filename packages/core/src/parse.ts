import type { AnySchema, Schema } from './schema.js'
import type { Transport } from './types.js'

interface ParsedTransport {
  type: 'websocket' | 'tcp' | 'http' | 'fallback' | 'cluster'
  url?: string
  options: Record<string, string>
  children?: ParsedTransport[]
  quorum?: number
}

function parseOptions(query: string): Record<string, string> {
  const options: Record<string, string> = {}
  if (!query) return options

  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=')
    if (key && value !== undefined) {
      options[key] = decodeURIComponent(value)
    }
  }
  return options
}

function inferType(
  scheme: string,
): 'websocket' | 'tcp' | 'http' | 'fallback' | 'cluster' {
  switch (scheme) {
    case 'ws':
    case 'wss':
      return 'websocket'
    case 'tcp':
    case 'tcp+tls':
      return 'tcp'
    case 'http':
    case 'https':
      return 'http'
    default:
      throw new Error(`Unknown scheme: ${scheme}`)
  }
}

function findMatchingParen(str: string, start: number): number {
  let depth = 1
  for (let i = start; i < str.length; i++) {
    if (str[i] === '(') depth++
    else if (str[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function splitArgs(str: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0

  for (const char of str) {
    if (char === '(') {
      depth++
      current += char
    } else if (char === ')') {
      depth--
      current += char
    } else if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    args.push(current.trim())
  }

  return args
}

function parseTransport(input: string): ParsedTransport {
  input = input.trim()

  // Check for meta-transports: fallback(...) or cluster(...)
  const metaMatch = input.match(/^(fallback|cluster)\(/)
  if (metaMatch) {
    const type = metaMatch[1] as 'fallback' | 'cluster'
    const argsStart = metaMatch[0].length
    const argsEnd = findMatchingParen(input, argsStart)

    if (argsEnd === -1) {
      throw new Error(`Unmatched parenthesis in: ${input}`)
    }

    const argsStr = input.slice(argsStart, argsEnd)
    const afterParen = input.slice(argsEnd + 1)

    // Parse options after closing paren: cluster(...)?timeout=1000
    let options: Record<string, string> = {}
    if (afterParen.startsWith('?')) {
      options = parseOptions(afterParen.slice(1))
    }

    const args = splitArgs(argsStr)

    if (type === 'cluster') {
      // First arg is quorum number
      const quorum = Number.parseInt(args[0], 10)
      if (Number.isNaN(quorum) || quorum < 1) {
        throw new Error(`Invalid quorum value: ${args[0]}`)
      }
      const children = args.slice(1).map(parseTransport)
      return { type, options, children, quorum }
    }

    const children = args.map(parseTransport)
    return { type, options, children }
  }

  // Simple transport URL: wss://host:port?timeout=1000
  const urlMatch = input.match(/^([a-z+]+):\/\/([^?]+)(?:\?(.*))?$/)
  if (!urlMatch) {
    throw new Error(`Invalid transport URL: ${input}`)
  }

  const [, scheme, rest, query] = urlMatch
  const type = inferType(scheme)
  const url = `${scheme}://${rest}`
  const options = parseOptions(query || '')

  return { type, url, options }
}

// biome-ignore lint/suspicious/noExplicitAny: dynamic import returns
type TransportFactory = (urlOrConfig: any, options?: any) => Transport

export type PackageMap = Record<string, string>
export type FactoryMap = Record<string, TransportFactory>

const KEY_ALIASES: Record<string, string> = { webSocket: 'websocket' }

function normalizeKeys<T>(map: Record<string, T>): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    result[KEY_ALIASES[key] ?? key] = value
  }
  return result
}

const DEFAULT_PACKAGE_MAP: PackageMap = {
  websocket: '@rpckit/websocket',
  tcp: '@rpckit/tcp',
  http: '@rpckit/http',
  fallback: '@rpckit/fallback',
  cluster: '@rpckit/cluster',
}

const EXPORT_MAP: Record<string, string> = {
  websocket: 'webSocket',
  tcp: 'tcp',
  http: 'http',
  fallback: 'fallback',
  cluster: 'cluster',
}

async function loadFactory(
  type: 'websocket' | 'tcp' | 'http' | 'fallback' | 'cluster',
  packageMap: PackageMap,
): Promise<TransportFactory> {
  const pkg = packageMap[type]
  const exportName = EXPORT_MAP[type]

  try {
    const module = await import(pkg)
    return module[exportName]
  } catch {
    throw new Error(`Package ${pkg} is not installed. Run: npm install ${pkg}`)
  }
}

function buildOptions(
  options: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(options)) {
    // Parse numeric values
    if (
      key === 'timeout' ||
      key === 'connectTimeout' ||
      key === 'keepAlive' ||
      key === 'quorum' ||
      key === 'retryCount' ||
      key === 'retryDelay'
    ) {
      result[key] = Number.parseInt(value, 10)
    }
    // Parse boolean values
    else if (key === 'rank' || key === 'eagerConnect') {
      result[key] = value === 'true'
    }
    // batch can be boolean or will be built from batchSize/batchWait
    else if (key === 'batch') {
      result[key] = value === 'true'
    }
    // Skip batchSize/batchWait/disabledCooldown - handled below
    else if (key === 'batchSize' || key === 'batchWait' || key === 'disabledCooldown') {
      // handled after loop
    }
    // Keep strings as-is
    else {
      result[key] = value
    }
  }

  // Build batch config from batchSize/batchWait/disabledCooldown
  if (options.batchSize || options.batchWait || options.disabledCooldown) {
    const batchConfig: { batchSize?: number; wait?: number; disabledCooldown?: number } = {}
    if (options.batchSize) {
      batchConfig.batchSize = Number.parseInt(options.batchSize, 10)
    }
    if (options.batchWait) {
      batchConfig.wait = Number.parseInt(options.batchWait, 10)
    }
    if (options.disabledCooldown) {
      batchConfig.disabledCooldown = Number.parseInt(options.disabledCooldown, 10)
    }
    result.batch = batchConfig
  }

  return result
}

function createBuildTransport(packageMap: PackageMap) {
  async function buildTransport(parsed: ParsedTransport): Promise<Transport> {
    const factory = await loadFactory(parsed.type, packageMap)
    const options = buildOptions(parsed.options)

    if (parsed.type === 'fallback' && parsed.children) {
      const transports = await Promise.all(parsed.children.map(buildTransport))
      return factory(transports, options)
    }

    if (parsed.type === 'cluster' && parsed.children) {
      const transports = await Promise.all(parsed.children.map(buildTransport))
      return factory(transports, { quorum: parsed.quorum, ...options })
    }

    // Simple transport
    if (!parsed.url) {
      throw new Error(`Missing URL for ${parsed.type} transport`)
    }

    return factory(parsed.url, options)
  }

  return buildTransport
}

/**
 * Create a `parse` function that uses a custom package map for dynamic imports.
 *
 * Override specific transport types while keeping defaults for the rest.
 * Useful for creating protocol-specific parse variants (e.g. electrum-cash).
 */
export function createParse(
  overrides: PackageMap,
): <S extends Schema = AnySchema>(input: string) => Promise<Transport<S>> {
  const packageMap = { ...DEFAULT_PACKAGE_MAP, ...normalizeKeys(overrides) }
  const buildTransport = createBuildTransport(packageMap)

  return async <S extends Schema = AnySchema>(
    input: string,
  ): Promise<Transport<S>> => {
    const parsed = parseTransport(input)
    const transport = await buildTransport(parsed)
    return transport as unknown as Transport<S>
  }
}

/**
 * Create a synchronous `parse` function using pre-imported factory functions.
 *
 * Unlike `createParse` which uses dynamic imports, this variant accepts
 * already-loaded factory functions, making it fully synchronous.
 *
 * @example
 * ```typescript
 * import { webSocket } from '@rpckit/websocket/electrum-cash'
 * import { fallback } from '@rpckit/fallback'
 * import { createParseSync } from '@rpckit/core'
 *
 * const parseSync = createParseSync({ webSocket, fallback })
 * const transport = parseSync('fallback(wss://a.com,wss://b.com)?eagerConnect=true')
 * ```
 */
export function createParseSync(
  factories: FactoryMap,
): <S extends Schema = AnySchema>(input: string) => Transport<S> {
  const normalized = normalizeKeys(factories)
  function buildTransport(parsed: ParsedTransport): Transport {
    const factory = normalized[parsed.type]
    if (!factory) {
      throw new Error(
        `No factory for transport type "${parsed.type}". Available: ${Object.keys(normalized).join(', ')}`,
      )
    }

    const options = buildOptions(parsed.options)

    if (parsed.type === 'fallback' && parsed.children) {
      const transports = parsed.children.map(buildTransport)
      return factory(transports, options)
    }

    if (parsed.type === 'cluster' && parsed.children) {
      const transports = parsed.children.map(buildTransport)
      return factory(transports, { quorum: parsed.quorum, ...options })
    }

    if (!parsed.url) {
      throw new Error(`Missing URL for ${parsed.type} transport`)
    }

    return factory(parsed.url, options)
  }

  return <S extends Schema = AnySchema>(input: string): Transport<S> => {
    const parsed = parseTransport(input)
    const transport = buildTransport(parsed)
    return transport as unknown as Transport<S>
  }
}

/**
 * Parse a transport one-liner string into a Transport instance.
 *
 * @example
 * ```typescript
 * // Simple transports
 * const ws = await parse('wss://example.com')
 * const tcp = await parse('tcp+tls://host:50002?timeout=10000')
 *
 * // Meta-transports
 * const fb = await parse('fallback(wss://a.com,tcp://b.com)')
 * const cl = await parse('cluster(2,ws://1.com,ws://2.com,ws://3.com)')
 *
 * // Nested
 * const nested = await parse('fallback(wss://a.com,cluster(2,ws://1.com,ws://2.com))')
 *
 * // With options
 * const withOpts = await parse('wss://example.com?timeout=10000&keepAlive=30000')
 * const batched = await parse('wss://example.com?batchSize=10&batchWait=50')
 * const fbRanked = await parse('fallback(wss://a.com,tcp://b.com)?rank=true')
 * ```
 *
 * Supported schemes:
 * - `wss://`, `ws://` → @rpckit/websocket
 * - `tcp://`, `tcp+tls://` → @rpckit/tcp
 * - `http://`, `https://` → @rpckit/http
 * - `fallback(...)` → @rpckit/fallback
 * - `cluster(quorum,...)` → @rpckit/cluster
 *
 * Supported options (via query params):
 * - `timeout` - Request timeout in ms
 * - `keepAlive` - Keep-alive ping interval in ms
 * - `batch` - Enable batching (true/false)
 * - `batchSize` - Max requests per batch
 * - `batchWait` - Max wait time before flushing batch (ms)
 * - `disabledCooldown` - Cooldown in ms before re-enabling batching after server rejection (default: 5000)
 * - `rank` - Enable health ranking for fallback (true/false)
 * - `eagerConnect` - Connect all fallback transports in parallel (true/false)
 * - `clientName` - Client name for electrum-cash handshake (default: 'rpckit')
 * - `protocolVersion` - Protocol version for electrum-cash handshake (default: '1.6')
 *
 * Packages are loaded dynamically at runtime. Missing packages throw an error.
 */
export async function parse<S extends Schema = AnySchema>(
  input: string,
): Promise<Transport<S>> {
  const buildTransport = createBuildTransport(DEFAULT_PACKAGE_MAP)
  const parsed = parseTransport(input)
  const transport = await buildTransport(parsed)
  return transport as unknown as Transport<S>
}
