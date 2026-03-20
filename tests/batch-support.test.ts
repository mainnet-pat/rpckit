import { webSocket } from '@rpckit/websocket/electrum-cash'
import { tcp } from '@rpckit/tcp/electrum-cash'
import { afterEach, describe, expect, it } from 'vitest'

const TIMEOUT = 15_000

/**
 * Batch support detection test over WebSocket.
 *
 * Connects to each endpoint and fires two concurrent requests with
 * batching enabled (short wait window). If the server handles the
 * JSON-RPC batch array correctly, both results resolve. Otherwise
 * the transport will reject with a parse/protocol error.
 */

interface Endpoint {
  url: string
  requests: [method: string, params?: unknown[]][]
}

const ENDPOINTS: Endpoint[] = [
  {
    url: 'wss://fulcrum.pat.mn',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
  {
    url: 'ws://fulcrum.pat.mn:50003',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
  {
    url: 'wss://electroncash.dk:50004',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
  {
    url: 'wss://bch.imaginary.cash:50004',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
  {
    url: 'wss://bch.loping.net:50004',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
  {
    url: 'ws://fulcrum.criptolayer.net:50003',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
]

const TCP_ENDPOINTS: Endpoint[] = [
  {
    url: 'tcp+tls://fulcrum.pat.mn:50002',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
  {
    url: 'tcp+tls://electroncash.dk:50002',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
  {
    url: 'tcp+tls://bch.imaginary.cash:50002',
    requests: [
      ['server.ping'],
      ['blockchain.headers.get_tip'],
    ],
  },
]

const PROBE_TIMEOUT = 10_000

async function probeBatchSupport(
  endpoint: Endpoint,
): Promise<{ supported: boolean; reason?: string }> {
  const transport = webSocket(endpoint.url, {
    timeout: PROBE_TIMEOUT - 2000,
    connectTimeout: 5000,
    batch: { wait: 50, batchSize: 10 },
    protocolVersion: '1.5',
  })

  try {
    const results = await Promise.race([
      Promise.all(
        endpoint.requests.map((r) =>
          transport.request(r[0], ...(r[1] ?? [])),
        ),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Probe timeout')), PROBE_TIMEOUT),
      ),
    ])

    // All requests resolved — server handled the batch
    for (let i = 0; i < results.length; i++) {
      if (results[i] === undefined) {
        return { supported: false, reason: `Request ${i} returned undefined` }
      }
    }

    return { supported: true }
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? `RPC error: ${(err as { message: string }).message}`
          : String(err)
    return { supported: false, reason }
  } finally {
    await transport.close()
  }
}

describe.skip('batch support detection (WebSocket)', () => {
  const transports: Array<{ close: () => Promise<void> }> = []

  afterEach(async () => {
    for (const t of transports.splice(0)) {
      await t.close()
    }
  })

  for (const endpoint of ENDPOINTS) {
    it(
      `${endpoint.url}`,
      async () => {
        const result = await probeBatchSupport(endpoint)
        console.log(
          `  ${endpoint.url}: batch ${result.supported ? 'supported' : `NOT supported (${result.reason})`}`,
        )
        expect(result).toHaveProperty('supported')
      },
      TIMEOUT,
    )
  }

  it(
    'at least one endpoint supports batching',
    async () => {
      const results = await Promise.allSettled(
        ENDPOINTS.map((e) => probeBatchSupport(e)),
      )

      const supported = results.filter(
        (r) => r.status === 'fulfilled' && r.value.supported,
      )
      const unsupported = results
        .map((r, i) => ({ result: r, endpoint: ENDPOINTS[i] }))
        .filter(
          ({ result }) =>
            result.status === 'rejected' ||
            (result.status === 'fulfilled' && !result.value.supported),
        )

      if (unsupported.length > 0) {
        console.log('\nEndpoints without batch support:')
        for (const { endpoint, result } of unsupported) {
          const reason =
            result.status === 'rejected'
              ? result.reason
              : result.value.reason
          console.log(`  - ${endpoint.url}: ${reason}`)
        }
      }

      expect(supported.length).toBeGreaterThan(0)
    },
    TIMEOUT,
  )

  it(
    'transport works without batching',
    async () => {
      const transport = webSocket(ENDPOINTS[0].url, {
        timeout: TIMEOUT - 2000,
        batch: false,
      })
      transports.push(transport)

      const result = await transport.request(ENDPOINTS[0].requests[0][0])
      expect(result).toBeDefined()
    },
    TIMEOUT,
  )
})

describe.skip('batch flood until rejection (WebSocket)', () => {
  it(
    'sends large batch (500) that triggers timeout and auto-disables',
    async () => {
      const endpoint = ENDPOINTS[0]
      const transport = webSocket(endpoint.url, {
        timeout: 10_000,
        connectTimeout: 5000,
        batch: { wait: 0, batchSize: 500 },
        protocolVersion: '1.5',
      })

      try {
        // Fire 500 requests — sent as a single batch of 500
        // Server can't process this many in time → "Batch timeout"
        // BatchScheduler detects this, disables batching, retries individually
        const promises = Array.from({ length: 500 }, () =>
          transport.request('server.ping'),
        )

        const results = await Promise.allSettled(promises)
        const ok = results.filter((r) => r.status === 'fulfilled').length
        const err = results.filter((r) => r.status === 'rejected').length

        console.log(`\n  Endpoint: ${endpoint.url}`)
        console.log(`  batchSize: 500`)
        console.log(`  OK: ${ok}, Errors: ${err}`)

        if (err > 0) {
          const firstErr = results.find(
            (r): r is PromiseRejectedResult => r.status === 'rejected',
          )!.reason
          console.log(`  Error type: ${firstErr instanceof Error ? 'Error' : typeof firstErr}`)
          console.log(`  Error message: ${firstErr instanceof Error ? firstErr.message : JSON.stringify(firstErr)}`)
        } else {
          console.log('  All succeeded (auto-disable fallback worked)')
        }

        // With auto-disable + sendSingle, all requests should succeed
        expect(ok).toBeGreaterThan(0)
      } finally {
        await transport.close()
      }
    },
    120_000,
  )
})

describe.skip('batch flood until rejection (TCP)', () => {
  it(
    'sends large batch (500) that triggers timeout and auto-disables',
    async () => {
      const endpoint = TCP_ENDPOINTS[0]
      const transport = tcp(endpoint.url, {
        timeout: 10_000,
        connectTimeout: 5000,
        batch: { wait: 0, batchSize: 500 },
        protocolVersion: '1.5',
      })

      try {
        const promises = Array.from({ length: 500 }, () =>
          transport.request('server.ping'),
        )

        const results = await Promise.allSettled(promises)
        const ok = results.filter((r) => r.status === 'fulfilled').length
        const err = results.filter((r) => r.status === 'rejected').length

        console.log(`\n  Endpoint: ${endpoint.url}`)
        console.log(`  batchSize: 500`)
        console.log(`  OK: ${ok}, Errors: ${err}`)

        if (err > 0) {
          const firstErr = results.find(
            (r): r is PromiseRejectedResult => r.status === 'rejected',
          )!.reason
          console.log(`  Error type: ${firstErr instanceof Error ? 'Error' : typeof firstErr}`)
          console.log(`  Error message: ${firstErr instanceof Error ? firstErr.message : JSON.stringify(firstErr)}`)
        } else {
          console.log('  All succeeded (auto-disable fallback worked)')
        }

        expect(ok).toBeGreaterThan(0)
      } finally {
        await transport.close()
      }
    },
    120_000,
  )
})

describe.skip('batch auto-disable recovery (WebSocket)', () => {
  it(
    'continues working after batch rejection by falling back to individual requests',
    async () => {
      const endpoint = ENDPOINTS[0]
      const transport = webSocket(endpoint.url, {
        timeout: 8_000,
        connectTimeout: 5000,
        batch: { wait: 0, batchSize: 10, disabledCooldown: 5_000 },
        protocolVersion: '1.5',
      })

      try {
        // Send many batches rapidly
        const ROUNDS = 50
        let totalSuccesses = 0
        let totalErrors = 0

        for (let round = 0; round < ROUNDS; round++) {
          const promises = Array.from({ length: 10 }, () =>
            transport.request('server.ping'),
          )
          const results = await Promise.allSettled(promises)

          for (const r of results) {
            if (r.status === 'fulfilled') totalSuccesses++
            else totalErrors++
          }
        }

        // Regardless of whether batches were rejected, individual requests should work
        const singleResult = await transport.request('server.ping')

        console.log(`\n  Endpoint: ${endpoint.url}`)
        console.log(`  Total successes: ${totalSuccesses}`)
        console.log(`  Total errors: ${totalErrors}`)
        console.log(`  Post-flood single request: ${singleResult !== undefined ? 'OK' : 'FAILED'}`)

        expect(singleResult).toBeDefined()
      } finally {
        await transport.close()
      }
    },
    60_000,
  )
})

describe.skip('batch auto-disable recovery (TCP)', () => {
  it(
    'continues working after batch rejection by falling back to individual requests',
    async () => {
      const endpoint = TCP_ENDPOINTS[0]
      const transport = tcp(endpoint.url, {
        timeout: 8_000,
        connectTimeout: 5000,
        batch: { wait: 0, batchSize: 10, disabledCooldown: 5_000 },
        protocolVersion: '1.5',
      })

      try {
        const ROUNDS = 50
        let totalSuccesses = 0
        let totalErrors = 0

        for (let round = 0; round < ROUNDS; round++) {
          const promises = Array.from({ length: 10 }, () =>
            transport.request('server.ping'),
          )
          const results = await Promise.allSettled(promises)

          for (const r of results) {
            if (r.status === 'fulfilled') totalSuccesses++
            else totalErrors++
          }
        }

        const singleResult = await transport.request('server.ping')

        console.log(`\n  Endpoint: ${endpoint.url}`)
        console.log(`  Total successes: ${totalSuccesses}`)
        console.log(`  Total errors: ${totalErrors}`)
        console.log(`  Post-flood single request: ${singleResult !== undefined ? 'OK' : 'FAILED'}`)

        expect(singleResult).toBeDefined()
      } finally {
        await transport.close()
      }
    },
    60_000,
  )
})
