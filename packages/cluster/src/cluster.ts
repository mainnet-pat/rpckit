import type {
  AnySchema,
  ClusterTransport,
  ClusterTransportOptions,
  Schema,
  Transport,
  TransportResponse,
  Unsubscribe,
} from '@rpckit/core'

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  )
    return false

  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false

  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  )
}

function checkQuorum(
  results: unknown[],
  quorum: number,
): { reached: boolean; value?: unknown } {
  for (const candidate of results) {
    const count = results.filter((r) => deepEqual(r, candidate)).length
    if (count >= quorum) {
      return { reached: true, value: candidate }
    }
  }
  return { reached: false }
}

// Single transport: returns unwrapped (preserves exact type)
export function cluster<T>(transports: [T], options: ClusterTransportOptions): T

// Multiple transports: returns ClusterTransport
export function cluster<T>(
  transports: [T, T, ...T[]],
  options: ClusterTransportOptions,
): ClusterTransport

// Implementation
export function cluster<S extends Schema = AnySchema>(
  transports: Transport<S>[],
  options: ClusterTransportOptions,
): ClusterTransport<S> | Transport<S> {
  const { quorum, timeout = 10000 } = options

  if (quorum < 1) {
    throw new Error(`Quorum must be at least 1, got ${quorum}`)
  }
  if (quorum > transports.length) {
    throw new Error(
      `Quorum ${quorum} exceeds number of transports (${transports.length})`,
    )
  }

  // Single transport with quorum=1: no need to wrap
  if (transports.length === 1) {
    return transports[0]
  }

  const responseListeners = new Set<(info: TransportResponse<S>) => void>()

  return {
    url: transports.map((t) => t.url).join(','),

    get transports() {
      return transports
    },

    onResponse(listener: (info: TransportResponse<S>) => void): () => void {
      responseListeners.add(listener)
      return () => {
        responseListeners.delete(listener)
      }
    },

    async connect() {
      await Promise.all(transports.map((t) => t.connect()))
    },

    async request(method: string, ...params: unknown[]): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const results: unknown[] = []
        let settled = false
        let completed = 0

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true
            reject(new Error('Cluster quorum not reached within timeout'))
          }
        }, timeout)

        for (const transport of transports) {
          // biome-ignore lint/suspicious/noExplicitAny: meta-transport delegates with erased types
          ;(transport.request as any)(method, ...params).then(
            (result: unknown) => {
              for (const listener of responseListeners) {
                listener({
                  method,
                  params,
                  transport,
                  response: result,
                  status: 'success',
                })
              }

              if (settled) return
              results.push(result)
              completed++

              const { reached, value } = checkQuorum(results, quorum)
              if (reached) {
                settled = true
                clearTimeout(timer)
                resolve(value)
                return
              }

              if (completed === transports.length && !settled) {
                settled = true
                clearTimeout(timer)
                reject(new Error('Cluster quorum not reached'))
              }
            },
            (error: unknown) => {
              for (const listener of responseListeners) {
                listener({
                  method,
                  params,
                  transport,
                  error,
                  status: 'error',
                })
              }

              if (settled) return
              completed++
              const remaining = transports.length - completed
              const maxPossible = results.length + remaining
              if (maxPossible < quorum) {
                settled = true
                clearTimeout(timer)
                reject(new Error('Cluster quorum not reachable'))
              }
            },
          )
        }
      })
    },

    async subscribe(method: string, ...args: unknown[]): Promise<Unsubscribe> {
      const onData = args.pop() as (data: unknown) => void
      const params = args as unknown[]
      const unsubs: Unsubscribe[] = []
      const initialResults: unknown[] = []
      let initialResolved = false
      const notifiedValues = new Set<string>()

      // Collect notifications and check quorum before forwarding
      const pendingNotifications: unknown[] = []

      function handleNotification(data: unknown) {
        pendingNotifications.push(data)

        const { reached, value } = checkQuorum(pendingNotifications, quorum)
        if (reached) {
          const key = JSON.stringify(value)
          if (!notifiedValues.has(key)) {
            notifiedValues.add(key)
            onData(value)
          }
          // Remove matched values from pending
          let removed = 0
          for (
            let i = pendingNotifications.length - 1;
            i >= 0 && removed < quorum;
            i--
          ) {
            if (deepEqual(pendingNotifications[i], value)) {
              pendingNotifications.splice(i, 1)
              removed++
            }
          }
        }
      }

      // Wait for quorum on initial subscription results
      const initialResult = await new Promise<unknown>((resolve, reject) => {
        let completed = 0

        const timer = setTimeout(() => {
          if (!initialResolved) {
            initialResolved = true
            reject(
              new Error(
                'Cluster subscription quorum not reached within timeout',
              ),
            )
          }
        }, timeout)

        for (const transport of transports) {
          let isFirstCallback = true

          // biome-ignore lint/suspicious/noExplicitAny: meta-transport delegates with erased types
          ;(transport.subscribe as any)(method, ...params, (data: unknown) => {
            if (isFirstCallback) {
              // This is the initial result
              isFirstCallback = false
              if (initialResolved) return

              initialResults.push(data)
              completed++

              const { reached, value } = checkQuorum(initialResults, quorum)
              if (reached) {
                initialResolved = true
                clearTimeout(timer)
                resolve(value)
                return
              }

              if (completed === transports.length && !initialResolved) {
                initialResolved = true
                clearTimeout(timer)
                reject(new Error('Cluster subscription quorum not reached'))
              }
            } else {
              // This is a notification
              handleNotification(data)
            }
          }).then(
            (unsub: Unsubscribe) => {
              unsubs.push(unsub)
            },
            (_error: unknown) => {
              if (initialResolved) return
              completed++
              const remaining = transports.length - completed
              const maxPossible = initialResults.length + remaining
              if (maxPossible < quorum) {
                initialResolved = true
                clearTimeout(timer)
                reject(new Error('Cluster subscription quorum not reachable'))
              }
            },
          )
        }
      })

      // Deliver initial result
      onData(initialResult)

      const unsub: Unsubscribe = async (cleanup) => {
        // Unsubscribe from all transports
        for (const u of unsubs) {
          await u(cleanup)
        }
      }

      return unsub
    },

    async close(): Promise<void> {
      responseListeners.clear()
      await Promise.all(transports.map((t) => t.close()))
    },
  }
}
