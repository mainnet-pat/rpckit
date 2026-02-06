import type {
  AnySchema,
  FallbackTransport,
  FallbackTransportOptions,
  RankConfig,
  Schema,
  Transport,
  TransportResponse,
  TransportScore,
} from '@rpckit/core'

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
  // Single transport: no need to wrap
  if (transports.length === 1) {
    return transports[0]
  }

  let ranked: Transport<S>[] = [...transports]
  const { shouldThrow: shouldThrow_ = shouldThrow } = options
  let rankingTimer: ReturnType<typeof setTimeout> | null = null
  let rankingStopped = false

  let currentScores: TransportScore<S>[] = transports.map((t) => ({
    transport: t,
    score: 0,
    latency: 0,
    stability: 0,
  }))
  const scoreListeners = new Set<(scores: TransportScore<S>[]) => void>()
  const responseListeners = new Set<(info: TransportResponse<S>) => void>()

  if (options.rank) {
    const rankOpts: RankConfig<S> =
      typeof options.rank === 'object' ? options.rank : {}
    startRanking(transports, rankOpts)
  }

  function startRanking(transports: Transport<S>[], opts: RankConfig<S>) {
    if (!opts.ping) return
    const ping = opts.ping

    const interval = opts.interval ?? 4000
    const sampleCount = opts.sampleCount ?? 10
    const timeout = opts.timeout ?? 1000
    const latencyWeight = opts.weights?.latency ?? 0.3
    const stabilityWeight = opts.weights?.stability ?? 0.7

    const samples: Array<Array<{ latency: number; success: number }>> = []

    async function sample() {
      if (rankingStopped) return

      const results = await Promise.all(
        transports.map(async (transport) => {
          const start = performance.now()
          try {
            await Promise.race([
              ping(transport),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('ping timeout')), timeout),
              ),
            ])
            return { latency: performance.now() - start, success: 1 }
          } catch {
            return { latency: timeout, success: 0 }
          }
        }),
      )

      samples.push(results)
      if (samples.length > sampleCount) samples.shift()

      const maxLatency = Math.max(
        ...samples.flatMap((s) => s.map((r) => r.latency)),
      )

      const scores = transports.map((transport, i) => {
        const latencies = samples.map((s) => s[i].latency)
        const meanLatency =
          latencies.reduce((a, b) => a + b, 0) / latencies.length
        const latencyScore = maxLatency > 0 ? 1 - meanLatency / maxLatency : 0

        const successes = samples.map((s) => s[i].success)
        const stabilityScore =
          successes.reduce((a, b) => a + b, 0) / successes.length

        const score =
          stabilityScore === 0
            ? 0
            : latencyWeight * latencyScore + stabilityWeight * stabilityScore

        return {
          transport,
          score,
          latency: meanLatency,
          stability: stabilityScore,
        }
      })

      scores.sort((a, b) => b.score - a.score)
      ranked = scores.map((s) => s.transport)
      currentScores = scores

      for (const listener of scoreListeners) {
        listener(scores)
      }

      if (!rankingStopped) {
        rankingTimer = setTimeout(sample, interval)
      }
    }

    sample()
  }

  return {
    url: transports.map((t) => t.url).join(','),

    async connect() {
      if (options.eagerConnect) {
        const connectResults = ranked.map((t, i) => t.connect().then(() => i))
        const fastestIndex = await Promise.any(connectResults)

        // Move the fastest-connecting transport to front priority
        if (fastestIndex > 0) {
          const [fastest] = ranked.splice(fastestIndex, 1)
          ranked.unshift(fastest)
        }

        // Let remaining connections settle in background
        Promise.allSettled(connectResults)
      } else {
        await Promise.all(ranked.map((t) => t.connect()))
      }
    },

    get transports() {
      return ranked
    },

    get scores() {
      return currentScores
    },

    onScores(listener: (scores: TransportScore<S>[]) => void): () => void {
      scoreListeners.add(listener)
      return () => {
        scoreListeners.delete(listener)
      }
    },

    onResponse(listener: (info: TransportResponse<S>) => void): () => void {
      responseListeners.add(listener)
      return () => {
        responseListeners.delete(listener)
      }
    },

    async request(method: string, ...params: unknown[]): Promise<unknown> {
      let lastError: unknown

      for (const transport of ranked) {
        try {
          // biome-ignore lint/suspicious/noExplicitAny: meta-transport delegates with erased types
          const response = await (transport.request as any)(method, ...params)
          for (const listener of responseListeners) {
            listener({
              method,
              params,
              transport,
              response,
              status: 'success',
            })
          }
          return response
        } catch (error) {
          lastError = error
          for (const listener of responseListeners) {
            listener({
              method,
              params,
              transport,
              error,
              status: 'error',
            })
          }
          if (shouldThrow_(error as Error)) throw error
        }
      }

      throw lastError
    },

    async subscribe(method: string, ...args: unknown[]) {
      const onData = args.pop() as (data: unknown) => void
      const params = args as unknown[]
      let lastError: unknown
      for (const transport of ranked) {
        try {
          // biome-ignore lint/suspicious/noExplicitAny: meta-transport delegates with erased types
          const result = await (transport.subscribe as any)(
            method,
            ...params,
            onData,
          )
          for (const listener of responseListeners) {
            listener({
              method,
              params,
              transport,
              response: result,
              status: 'success',
            })
          }
          return result
        } catch (error) {
          lastError = error
          for (const listener of responseListeners) {
            listener({
              method,
              params,
              transport,
              error,
              status: 'error',
            })
          }
        }
      }
      throw lastError
    },

    async close(): Promise<void> {
      rankingStopped = true
      if (rankingTimer) clearTimeout(rankingTimer)
      scoreListeners.clear()
      responseListeners.clear()
      await Promise.all(transports.map((t) => t.close()))
    },
  }
}

/** Default shouldThrow: stops fallback for deterministic JSON-RPC errors. */
export function shouldThrow(error: Error): boolean | undefined {
  if (
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  ) {
    const code = (error as { code: number }).code
    if (
      code === -32700 || // Parse error
      code === -32600 || // Invalid Request
      code === -32602 // Invalid params
    )
      return true
  }
  return false
}
