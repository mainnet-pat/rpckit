import type { Transport } from '@rpckit/core'
import { createParse, createParseSync, parse } from '@rpckit/core'
import { describe, expect, it, vi } from 'vitest'

interface MockTransport extends Transport {
  type: string
  opts: Record<string, unknown>
  transports?: MockTransport[]
  __variant?: string
}

// Mock all transport packages
vi.mock('@rpckit/websocket', () => ({
  webSocket: vi.fn((url, opts) => ({
    type: 'websocket',
    url,
    opts,
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/tcp', () => ({
  tcp: vi.fn((url, opts) => ({
    type: 'tcp',
    url,
    opts,
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/http', () => ({
  http: vi.fn((url, opts) => ({
    type: 'http',
    url,
    opts,
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/fallback', () => ({
  fallback: vi.fn((transports, opts) => ({
    type: 'fallback',
    transports,
    opts,
    url: 'fallback',
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/cluster', () => ({
  cluster: vi.fn((transports, opts) => ({
    type: 'cluster',
    transports,
    opts,
    url: 'cluster',
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/websocket/electrum-cash', () => ({
  webSocket: vi.fn((url, opts) => ({
    type: 'websocket',
    url,
    opts,
    __variant: 'electrum-cash',
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/tcp/electrum-cash', () => ({
  tcp: vi.fn((url, opts) => ({
    type: 'tcp',
    url,
    opts,
    __variant: 'electrum-cash',
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/websocket/ethereum', () => ({
  webSocket: vi.fn((url, opts) => ({
    type: 'websocket',
    url,
    opts,
    __variant: 'ethereum',
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/http/ethereum', () => ({
  http: vi.fn((url, opts) => ({
    type: 'http',
    url,
    opts,
    __variant: 'ethereum',
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@rpckit/http/electrum-cash', () => ({
  http: vi.fn((url, opts) => ({
    type: 'http',
    url,
    opts,
    __variant: 'electrum-cash',
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  })),
}))

describe('parse', () => {
  describe('simple transports', () => {
    it('parses wss:// URL', async () => {
      const transport = (await parse('wss://example.com')) as MockTransport
      expect(transport.type).toBe('websocket')
      expect(transport.url).toBe('wss://example.com')
    })

    it('parses ws:// URL', async () => {
      const transport = (await parse('ws://example.com:50003')) as MockTransport
      expect(transport.type).toBe('websocket')
      expect(transport.url).toBe('ws://example.com:50003')
    })

    it('parses tcp:// URL', async () => {
      const transport = (await parse('tcp://host:50001')) as MockTransport
      expect(transport.type).toBe('tcp')
      expect(transport.url).toBe('tcp://host:50001')
    })

    it('parses tcp+tls:// URL', async () => {
      const transport = (await parse('tcp+tls://host:50002')) as MockTransport
      expect(transport.type).toBe('tcp')
      expect(transport.url).toBe('tcp+tls://host:50002')
    })

    it('parses https:// URL', async () => {
      const transport = (await parse(
        'https://example.com/rpc',
      )) as MockTransport
      expect(transport.type).toBe('http')
      expect(transport.url).toBe('https://example.com/rpc')
    })

    it('parses http:// URL', async () => {
      const transport = (await parse('http://localhost:8080')) as MockTransport
      expect(transport.type).toBe('http')
      expect(transport.url).toBe('http://localhost:8080')
    })
  })

  describe('options via query params', () => {
    it('parses timeout option', async () => {
      const transport = (await parse(
        'wss://example.com?timeout=10000',
      )) as MockTransport
      expect(transport.opts.timeout).toBe(10000)
    })

    it('parses connectTimeout option', async () => {
      const transport = (await parse(
        'wss://example.com?connectTimeout=5000',
      )) as MockTransport
      expect(transport.opts.connectTimeout).toBe(5000)
    })

    it('parses keepAlive option', async () => {
      const transport = (await parse(
        'wss://example.com?keepAlive=30000',
      )) as MockTransport
      expect(transport.opts.keepAlive).toBe(30000)
    })

    it('parses multiple options', async () => {
      const transport = (await parse(
        'wss://example.com?timeout=5000&keepAlive=15000',
      )) as MockTransport
      expect(transport.opts.timeout).toBe(5000)
      expect(transport.opts.keepAlive).toBe(15000)
    })

    it('parses batch=true', async () => {
      const transport = (await parse(
        'wss://example.com?batch=true',
      )) as MockTransport
      expect(transport.opts.batch).toBe(true)
    })

    it('parses batchSize option', async () => {
      const transport = (await parse(
        'wss://example.com?batchSize=10',
      )) as MockTransport
      expect(transport.opts.batch).toEqual({ batchSize: 10 })
    })

    it('parses batchWait option', async () => {
      const transport = (await parse(
        'wss://example.com?batchWait=50',
      )) as MockTransport
      expect(transport.opts.batch).toEqual({ wait: 50 })
    })

    it('parses batchSize and batchWait together', async () => {
      const transport = (await parse(
        'wss://example.com?batchSize=10&batchWait=50',
      )) as MockTransport
      expect(transport.opts.batch).toEqual({ batchSize: 10, wait: 50 })
    })

    it('parses retryCount option', async () => {
      const transport = (await parse(
        'wss://example.com?retryCount=5',
      )) as MockTransport
      expect(transport.opts.retryCount).toBe(5)
    })

    it('parses retryDelay option', async () => {
      const transport = (await parse(
        'wss://example.com?retryDelay=200',
      )) as MockTransport
      expect(transport.opts.retryDelay).toBe(200)
    })

    it('parses retry options together', async () => {
      const transport = (await parse(
        'wss://example.com?retryCount=3&retryDelay=100',
      )) as MockTransport
      expect(transport.opts.retryCount).toBe(3)
      expect(transport.opts.retryDelay).toBe(100)
    })
  })

  describe('fallback transport', () => {
    it('parses fallback with multiple transports', async () => {
      const transport = (await parse(
        'fallback(wss://a.com,tcp://b.com:50001)',
      )) as MockTransport
      expect(transport.type).toBe('fallback')
      expect(transport.transports).toHaveLength(2)
      expect(transport.transports?.[0].url).toBe('wss://a.com')
      expect(transport.transports?.[1].url).toBe('tcp://b.com:50001')
    })

    it('parses fallback with options', async () => {
      const transport = (await parse(
        'fallback(wss://a.com,tcp://b.com)?rank=true&eagerConnect=true',
      )) as MockTransport
      expect(transport.opts.rank).toBe(true)
      expect(transport.opts.eagerConnect).toBe(true)
    })

    it('parses fallback with transport options', async () => {
      const transport = (await parse(
        'fallback(wss://a.com?timeout=5000,tcp://b.com?timeout=10000)',
      )) as MockTransport
      expect(transport.transports?.[0].opts.timeout).toBe(5000)
      expect(transport.transports?.[1].opts.timeout).toBe(10000)
    })
  })

  describe('cluster transport', () => {
    it('parses cluster with quorum', async () => {
      const transport = (await parse(
        'cluster(2,ws://1.com,ws://2.com,ws://3.com)',
      )) as MockTransport
      expect(transport.type).toBe('cluster')
      expect(transport.opts.quorum).toBe(2)
      expect(transport.transports).toHaveLength(3)
    })

    it('parses cluster with timeout option', async () => {
      const transport = (await parse(
        'cluster(2,ws://1.com,ws://2.com)?timeout=15000',
      )) as MockTransport
      expect(transport.opts.timeout).toBe(15000)
    })
  })

  describe('nested transports', () => {
    it('parses fallback containing cluster', async () => {
      const transport = (await parse(
        'fallback(wss://primary.com,cluster(2,ws://1.com,ws://2.com,ws://3.com))',
      )) as MockTransport
      expect(transport.type).toBe('fallback')
      expect(transport.transports).toHaveLength(2)
      expect(transport.transports?.[0].url).toBe('wss://primary.com')
      expect(transport.transports?.[1].type).toBe('cluster')
      expect(transport.transports?.[1].opts.quorum).toBe(2)
    })

    it('parses deeply nested transports', async () => {
      const transport = (await parse(
        'fallback(wss://a.com,fallback(tcp://b.com,tcp://c.com))',
      )) as MockTransport
      expect(transport.type).toBe('fallback')
      expect(transport.transports?.[1].type).toBe('fallback')
      expect(transport.transports?.[1].transports).toHaveLength(2)
    })
  })

  describe('error handling', () => {
    it('throws on unknown scheme', async () => {
      await expect(parse('ftp://example.com')).rejects.toThrow('Unknown scheme')
    })

    it('throws on invalid URL', async () => {
      await expect(parse('not-a-url')).rejects.toThrow('Invalid transport URL')
    })

    it('throws on invalid cluster quorum', async () => {
      await expect(parse('cluster(abc,ws://1.com)')).rejects.toThrow(
        'Invalid quorum',
      )
    })

    it('throws on unmatched parenthesis', async () => {
      await expect(parse('fallback(wss://a.com')).rejects.toThrow(
        'Unmatched parenthesis',
      )
    })
  })
})

describe('createParse', () => {
  it('uses overridden packages for electrum-cash', async () => {
    const electrumParse = createParse({
      websocket: '@rpckit/websocket/electrum-cash',
      tcp: '@rpckit/tcp/electrum-cash',
      http: '@rpckit/http/electrum-cash',
    })

    const ws = (await electrumParse(
      'wss://electrum.example.com',
    )) as MockTransport
    expect(ws.__variant).toBe('electrum-cash')
    expect(ws.type).toBe('websocket')

    const tcpT = (await electrumParse(
      'tcp://electrum.example.com:50001',
    )) as MockTransport
    expect(tcpT.__variant).toBe('electrum-cash')
    expect(tcpT.type).toBe('tcp')

    const httpT = (await electrumParse(
      'https://electrum.example.com/rpc',
    )) as MockTransport
    expect(httpT.__variant).toBe('electrum-cash')
    expect(httpT.type).toBe('http')
  })

  it('keeps default packages for non-overridden types', async () => {
    const partialParse = createParse({
      websocket: '@rpckit/websocket/electrum-cash',
    })

    const ws = (await partialParse('wss://example.com')) as MockTransport
    expect(ws.__variant).toBe('electrum-cash')

    // TCP uses default (no __variant)

    const tcpT = (await partialParse(
      'tcp://example.com:50001',
    )) as MockTransport
    expect(tcpT.__variant).toBeUndefined()
    expect(tcpT.type).toBe('tcp')
  })

  it('passes options from URL query params through', async () => {
    const electrumParse = createParse({
      websocket: '@rpckit/websocket/electrum-cash',
    })

    const transport = (await electrumParse(
      'wss://example.com?timeout=5000',
    )) as MockTransport
    expect(transport.opts.timeout).toBe(5000)
  })

  it('passes clientName option through to electrum-cash transport', async () => {
    const electrumParse = createParse({
      websocket: '@rpckit/websocket/electrum-cash',
    })

    const transport = (await electrumParse(
      'wss://example.com?clientName=myapp',
    )) as MockTransport
    expect(transport.opts.clientName).toBe('myapp')
  })

  it('passes protocolVersion option through', async () => {
    const electrumParse = createParse({
      websocket: '@rpckit/websocket/electrum-cash',
    })

    const transport = (await electrumParse(
      'wss://example.com?protocolVersion=1.5',
    )) as MockTransport
    expect(transport.opts.protocolVersion).toBe('1.5')
  })

  it('uses overridden packages for ethereum', async () => {
    const ethereumParse = createParse({
      websocket: '@rpckit/websocket/ethereum',
      http: '@rpckit/http/ethereum',
    })

    const ws = (await ethereumParse('wss://eth.llamarpc.com')) as MockTransport
    expect(ws.__variant).toBe('ethereum')
    expect(ws.type).toBe('websocket')

    const httpT = (await ethereumParse(
      'https://eth.llamarpc.com',
    )) as MockTransport
    expect(httpT.__variant).toBe('ethereum')
    expect(httpT.type).toBe('http')
  })

  it('falls back to base tcp for ethereum parse (not overridden)', async () => {
    const ethereumParse = createParse({
      websocket: '@rpckit/websocket/ethereum',
      http: '@rpckit/http/ethereum',
    })

    const tcpT = (await ethereumParse(
      'tcp://eth.llamarpc.com:8545',
    )) as MockTransport
    expect(tcpT.__variant).toBeUndefined()
    expect(tcpT.type).toBe('tcp')
  })

  it('accepts webSocket key (camelCase alias)', async () => {
    const electrumParse = createParse({
      webSocket: '@rpckit/websocket/electrum-cash',
    })

    const ws = (await electrumParse('wss://example.com')) as MockTransport
    expect(ws.__variant).toBe('electrum-cash')
    expect(ws.type).toBe('websocket')
  })
})

describe('createParseSync', () => {
  // Mimics the real usage: import { webSocket } from '@rpckit/websocket'
  const webSocket = vi.fn((url: string, opts?: Record<string, unknown>) => ({
    type: 'websocket',
    url,
    opts,
    connect: vi.fn(),
    request: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(),
  }))

  const fallback = vi.fn(
    (transports: MockTransport[], opts?: Record<string, unknown>) => ({
      type: 'fallback',
      transports,
      opts,
      url: 'fallback',
      connect: vi.fn(),
      request: vi.fn(),
      subscribe: vi.fn(),
      close: vi.fn(),
    }),
  )

  it('parses simple transport with shorthand { webSocket }', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock factory doesn't match real FactoryMap
    const parseSync = createParseSync({ webSocket } as any)
    const transport = parseSync('wss://example.com') as MockTransport
    expect(transport.type).toBe('websocket')
    expect(transport.url).toBe('wss://example.com')
  })

  it('parses fallback with shorthand { webSocket, fallback }', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock factory doesn't match real FactoryMap
    const parseSync = createParseSync({ webSocket, fallback } as any)
    const transport = parseSync(
      'fallback(wss://a.com,wss://b.com)',
    ) as MockTransport
    expect(transport.type).toBe('fallback')
    expect(transport.transports).toHaveLength(2)
    expect(transport.transports?.[0].url).toBe('wss://a.com')
    expect(transport.transports?.[1].url).toBe('wss://b.com')
  })

  it('parses options via query params', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock factory doesn't match real FactoryMap
    const parseSync = createParseSync({ webSocket } as any)
    const transport = parseSync(
      'wss://example.com?timeout=5000',
    ) as MockTransport
    expect(transport.opts.timeout).toBe(5000)
  })

  it('accepts lowercase websocket key too', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock factory doesn't match real FactoryMap
    const parseSync = createParseSync({ websocket: webSocket } as any)
    const transport = parseSync('wss://example.com') as MockTransport
    expect(transport.type).toBe('websocket')
  })

  it('throws for missing factory', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock factory doesn't match real FactoryMap
    const parseSync = createParseSync({ webSocket } as any)
    expect(() => parseSync('tcp://example.com:50001')).toThrow(
      'No factory for transport type "tcp"',
    )
  })
})
