import type { Transport } from '@rpckit/core'
import { http as baseHttp } from '@rpckit/http'
import { http } from '@rpckit/http/electrum-cash'
import { tcp } from '@rpckit/tcp/electrum-cash'
import { webSocket } from '@rpckit/websocket/electrum-cash'
import { afterEach, describe, expect, it } from 'vitest'

const TIMEOUT = 15_000

describe('mainnet fulcrum: HTTP', () => {
  let transport: Transport

  afterEach(async () => {
    await transport.close()
  })

  it(
    'blockchain.headers.get_tip',
    async () => {
      transport = http({ url: 'https://fulcrum.pat.mn' })
      const tip = (await transport.request('blockchain.headers.get_tip')) as {
        height: number
        hex: string
      }
      expect(tip.height).toBeTypeOf('number')
      expect(tip.height).toBeGreaterThan(800000)
      expect(tip.hex).toBeTypeOf('string')
      expect(tip.hex.length).toBeGreaterThan(0)
    },
    TIMEOUT,
  )

  it(
    'server.ping',
    async () => {
      transport = http({ url: 'https://fulcrum.pat.mn' })
      const result = await transport.request('server.ping')
      expect(result).toBeNull()
    },
    TIMEOUT,
  )

  it(
    'blockchain.transaction.get',
    async () => {
      transport = http({ url: 'https://fulcrum.pat.mn' })
      // First non-coinbase BCH transaction (block 170)
      const tx = await transport.request(
        'blockchain.transaction.get',
        'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
        false,
      )
      expect(tx).toBeTypeOf('string')
      expect((tx as string).length).toBeGreaterThan(0)
    },
    TIMEOUT,
  )

  it(
    'batch requests',
    async () => {
      transport = http({
        url: 'https://fulcrum.pat.mn',
        batch: { wait: 50, batchSize: 3 },
      })

      const [ping, tip] = await Promise.all([
        transport.request('server.ping'),
        transport.request('blockchain.headers.get_tip'),
      ])

      expect(ping).toBeNull()
      // biome-ignore lint/suspicious/noExplicitAny: test assertion
      expect((tip as any).height).toBeGreaterThan(800000)
    },
    TIMEOUT,
  )
})

describe('mainnet fulcrum: WebSocket (wss)', () => {
  let transport: Transport

  afterEach(async () => {
    await transport.close()
  })

  it(
    'blockchain.headers.get_tip',
    async () => {
      transport = webSocket({
        url: 'wss://fulcrum.pat.mn',
        timeout: 10000,
      })
      const tip = (await transport.request('blockchain.headers.get_tip')) as {
        height: number
        hex: string
      }
      expect(tip.height).toBeGreaterThan(800000)
      expect(tip.hex).toBeTypeOf('string')
    },
    TIMEOUT,
  )

  it(
    'server.ping',
    async () => {
      transport = webSocket({
        url: 'wss://fulcrum.pat.mn',
        timeout: 10000,
      })
      const result = await transport.request('server.ping')
      expect(result).toBeNull()
    },
    TIMEOUT,
  )

  it(
    'blockchain.headers.subscribe',
    async () => {
      transport = webSocket({
        url: 'wss://fulcrum.pat.mn',
        timeout: 10000,
      })

      const received: unknown[] = []
      const unsub = await transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => {
          received.push(data)
        },
      )

      // Should have received initial header
      expect(received.length).toBeGreaterThanOrEqual(1)
      // transformInitialResult wraps as [...params, result]; headers has no params
      const header = (received[0] as [{ height: number; hex: string }])[0]
      expect(header.height).toBeGreaterThan(800000)
      expect(header.hex).toBeTypeOf('string')

      await unsub()
    },
    TIMEOUT,
  )
})

describe('mainnet fulcrum: WebSocket (ws)', () => {
  let transport: Transport

  afterEach(async () => {
    await transport.close()
  })

  it(
    'blockchain.headers.get_tip',
    async () => {
      transport = webSocket('ws://fulcrum.pat.mn:50003', {
        timeout: 10000,
      })
      const tip = (await transport.request('blockchain.headers.get_tip')) as {
        height: number
        hex: string
      }
      expect(tip.height).toBeGreaterThan(800000)
      expect(tip.hex).toBeTypeOf('string')
    },
    TIMEOUT,
  )

  it(
    'server.ping',
    async () => {
      transport = webSocket('ws://fulcrum.pat.mn:50003', {
        timeout: 10000,
      })
      const result = await transport.request('server.ping')
      expect(result).toBeNull()
    },
    TIMEOUT,
  )

  it(
    'blockchain.headers.subscribe',
    async () => {
      transport = webSocket('ws://fulcrum.pat.mn:50003', {
        timeout: 10000,
      })

      const received: unknown[] = []
      const unsub = await transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => {
          received.push(data)
        },
      )

      expect(received.length).toBeGreaterThanOrEqual(1)
      // transformInitialResult wraps as [...params, result]; headers has no params
      const header = (received[0] as [{ height: number; hex: string }])[0]
      expect(header.height).toBeGreaterThan(800000)
      expect(header.hex).toBeTypeOf('string')

      await unsub()
    },
    TIMEOUT,
  )
})

describe('mainnet fulcrum: TCP+TLS', () => {
  let transport: Transport

  afterEach(async () => {
    await transport.close()
  })

  it(
    'blockchain.headers.get_tip',
    async () => {
      transport = tcp({
        url: 'tcp+tls://fulcrum.pat.mn:50002',
        tls: { rejectUnauthorized: false },
        timeout: 10000,
      })
      const tip = (await transport.request('blockchain.headers.get_tip')) as {
        height: number
        hex: string
      }
      expect(tip.height).toBeGreaterThan(800000)
      expect(tip.hex).toBeTypeOf('string')
    },
    TIMEOUT,
  )

  it(
    'server.ping',
    async () => {
      transport = tcp({
        url: 'tcp+tls://fulcrum.pat.mn:50002',
        tls: { rejectUnauthorized: false },
        timeout: 10000,
      })
      const result = await transport.request('server.ping')
      expect(result).toBeNull()
    },
    TIMEOUT,
  )

  it(
    'blockchain.headers.subscribe',
    async () => {
      transport = tcp({
        url: 'tcp+tls://fulcrum.pat.mn:50002',
        tls: { rejectUnauthorized: false },
        timeout: 10000,
      })

      const received: unknown[] = []
      const unsub = await transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => {
          received.push(data)
        },
      )

      expect(received.length).toBeGreaterThanOrEqual(1)
      // transformInitialResult wraps as [...params, result]; headers has no params
      const header = (received[0] as [{ height: number; hex: string }])[0]
      expect(header.height).toBeGreaterThan(800000)
      expect(header.hex).toBeTypeOf('string')

      await unsub()
    },
    TIMEOUT,
  )
})

describe('mainnet BCHN: HTTP', () => {
  let transport: Transport

  afterEach(async () => {
    await transport.close()
  })

  it(
    'getblockcount',
    async () => {
      transport = baseHttp('https://bchn.pat.mn')
      const result = await transport.request('getblockcount')
      expect(result).toBeTypeOf('number')
      expect(result as number).toBeGreaterThan(800000)
    },
    TIMEOUT,
  )
})

describe('mainnet fulcrum: TCP', () => {
  let transport: Transport

  afterEach(async () => {
    await transport.close()
  })

  it(
    'blockchain.headers.get_tip',
    async () => {
      transport = tcp('tcp://fulcrum.pat.mn:50001', {
        timeout: 10000,
      })
      const tip = (await transport.request('blockchain.headers.get_tip')) as {
        height: number
        hex: string
      }
      expect(tip.height).toBeGreaterThan(800000)
      expect(tip.hex).toBeTypeOf('string')
    },
    TIMEOUT,
  )

  it(
    'server.ping',
    async () => {
      transport = tcp('tcp://fulcrum.pat.mn:50001', {
        timeout: 10000,
      })
      const result = await transport.request('server.ping')
      expect(result).toBeNull()
    },
    TIMEOUT,
  )

  it(
    'blockchain.headers.subscribe',
    async () => {
      transport = tcp('tcp://fulcrum.pat.mn:50001', {
        timeout: 10000,
      })

      const received: unknown[] = []
      const unsub = await transport.subscribe(
        'blockchain.headers.subscribe',
        (data) => {
          received.push(data)
        },
      )

      expect(received.length).toBeGreaterThanOrEqual(1)
      // transformInitialResult wraps as [...params, result]; headers has no params
      const header = (received[0] as [{ height: number; hex: string }])[0]
      expect(header.height).toBeGreaterThan(800000)
      expect(header.hex).toBeTypeOf('string')

      await unsub()
    },
    TIMEOUT,
  )
})
