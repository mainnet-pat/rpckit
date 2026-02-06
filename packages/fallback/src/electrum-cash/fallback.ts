import type {
  AnySchema,
  ExtractRequestMethod,
  FallbackTransport,
  FallbackTransportOptions,
  RankConfig,
  Schema,
  Transport,
} from '@rpckit/core'
import { fallback as baseFallback } from '../fallback.js'

/** Transient server-specific errors worth retrying on another server. */
const TRANSIENT_CODES = new Set([
  -32603, // RPC_INTERNAL_ERROR — server corruption/bug
  -7, // RPC_OUT_OF_MEMORY
  -20, // RPC_DATABASE_ERROR
  -28, // RPC_IN_WARMUP — server still starting
  -9, // RPC_CLIENT_NOT_CONNECTED — server's node disconnected
  -10, // RPC_CLIENT_IN_INITIAL_DOWNLOAD — server still syncing
])

/** Default shouldThrow for Electrum Cash / BCHN: throws for all deterministic
 *  RPC errors (invalid params, bad address, verify rejected, etc.) and falls
 *  through on transient server-health issues (internal error, OOM, warmup). */
export function shouldThrow(error: Error): boolean | undefined {
  if (
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  ) {
    return !TRANSIENT_CODES.has((error as { code: number }).code)
  }
  return false
}

// Single transport: returns unwrapped (preserves exact type)
export function fallback<T>(
  transports: [T],
  options?: FallbackTransportOptions,
): T

// Multiple transports: returns FallbackTransport
export function fallback<T>(
  transports: [T, T, ...T[]],
  options?: FallbackTransportOptions,
): FallbackTransport

// Implementation
export function fallback<S extends Schema = AnySchema>(
  transports: Transport<S>[],
  options: FallbackTransportOptions<S> = {},
): FallbackTransport<S> | Transport<S> {
  // biome-ignore lint/suspicious/noExplicitAny: overload forwarding requires type erasure
  return (baseFallback as any)(transports, resolveOptions(options))
}

function resolveOptions<S extends Schema = AnySchema>(
  options: FallbackTransportOptions<S>,
): FallbackTransportOptions<S> {
  const resolved: FallbackTransportOptions<S> = { ...options }

  if (!resolved.shouldThrow) {
    resolved.shouldThrow = shouldThrow
  }

  if (resolved.rank) {
    const rankOpts: RankConfig<S> =
      typeof resolved.rank === 'object' ? { ...resolved.rank } : {}

    if (!rankOpts.ping) {
      rankOpts.ping = (t: Transport<S>) =>
        t.request('server.ping' as ExtractRequestMethod<S>)
    }

    resolved.rank = rankOpts
  }

  return resolved
}
