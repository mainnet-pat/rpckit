import type { Transport, WebSocketTransport } from '@rpckit/core'
import type { EthereumSchema } from '@rpckit/core/ethereum'
import { http } from '@rpckit/http/ethereum'
import { webSocket } from '@rpckit/websocket/ethereum'
import { afterEach, describe, expect, it } from 'vitest'

// Public Ethereum RPC endpoints
// Using publicnode which has good WebSocket subscription support
const ETH_HTTP_URL = 'https://ethereum-rpc.publicnode.com'
const ETH_WS_URL = 'wss://ethereum-rpc.publicnode.com'

// Alternative endpoints:
// HTTP: https://eth.llamarpc.com, https://rpc.ankr.com/eth, https://cloudflare-eth.com
// WS: wss://eth.llamarpc.com

const TIMEOUT = 30_000

describe('Ethereum: HTTP', () => {
  let transport: Transport<EthereumSchema>

  afterEach(async () => {
    await transport.close()
  })

  it(
    'eth_chainId',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      const chainId = await transport.request('eth_chainId')
      expect(chainId).toBe('0x1') // Ethereum mainnet
    },
    TIMEOUT,
  )

  it(
    'eth_blockNumber',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      const blockNumber = await transport.request('eth_blockNumber')
      expect(blockNumber).toMatch(/^0x[0-9a-f]+$/i)
      // Block number should be > 20 million (as of 2024)
      expect(Number.parseInt(blockNumber, 16)).toBeGreaterThan(20_000_000)
    },
    TIMEOUT,
  )

  it(
    'eth_getBalance',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      // Query Vitalik's address
      const balance = await transport.request(
        'eth_getBalance',
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        'latest',
      )
      expect(balance).toMatch(/^0x[0-9a-f]+$/i)
      // Should have some ETH
      expect(BigInt(balance)).toBeGreaterThan(0n)
    },
    TIMEOUT,
  )

  it(
    'eth_getBlockByNumber',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      const block = await transport.request(
        'eth_getBlockByNumber',
        'latest',
        false, // Don't include full transactions
      )
      expect(block?.number).toMatch(/^0x[0-9a-f]+$/i)
      expect(block?.hash).toMatch(/^0x[0-9a-f]{64}$/i)
      expect(block?.parentHash).toMatch(/^0x[0-9a-f]{64}$/i)
      expect(block?.timestamp).toMatch(/^0x[0-9a-f]+$/i)
      expect(Array.isArray(block?.transactions)).toBe(true)
    },
    TIMEOUT,
  )

  it(
    'eth_gasPrice',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      const gasPrice = await transport.request('eth_gasPrice')
      expect(gasPrice).toMatch(/^0x[0-9a-f]+$/i)
      // Gas price should be > 0
      expect(BigInt(gasPrice)).toBeGreaterThan(0n)
    },
    TIMEOUT,
  )

  it(
    'eth_getTransactionCount (nonce)',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      // Query Vitalik's nonce
      const nonce = await transport.request(
        'eth_getTransactionCount',
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        'latest',
      )
      expect(nonce).toMatch(/^0x[0-9a-f]+$/i)
      // Should have sent many transactions
      expect(Number.parseInt(nonce, 16)).toBeGreaterThan(1000)
    },
    TIMEOUT,
  )

  it(
    'eth_getCode (contract)',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      // USDC contract
      const code = await transport.request(
        'eth_getCode',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'latest',
      )
      expect(code).toMatch(/^0x[0-9a-f]+$/i)
      // Should have bytecode (USDC is a contract)
      expect(code.length).toBeGreaterThan(100)
    },
    TIMEOUT,
  )

  it(
    'eth_call (read contract)',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      // Call USDC's decimals() function
      // decimals() selector: 0x313ce567
      const result = await transport.request(
        'eth_call',
        {
          to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          data: '0x313ce567',
        },
        'latest',
      )
      // USDC has 6 decimals
      expect(Number.parseInt(result, 16)).toBe(6)
    },
    TIMEOUT,
  )

  it(
    'eth_getLogs',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      // Get recent USDC Transfer events
      // Transfer(address,address,uint256) topic: 0xddf252ad...
      const blockNumber = await transport.request('eth_blockNumber')
      const currentBlock = Number.parseInt(blockNumber, 16)
      const fromBlock = `0x${(currentBlock - 5).toString(16)}`
      const toBlock = `0x${currentBlock.toString(16)}`

      const logs = await transport.request('eth_getLogs', {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        ],
        fromBlock,
        toBlock,
      })

      expect(Array.isArray(logs)).toBe(true)
      // USDC is heavily used, should have transfers
      if (logs.length > 0) {
        expect(logs[0].address.toLowerCase()).toBe(
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        )
        expect(logs[0].topics[0]).toBe(
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        )
      }
    },
    TIMEOUT,
  )

  it(
    'batch requests',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, {
        timeout: 10000,
        batch: { wait: 50, batchSize: 5 },
      })

      const [chainId, blockNumber, gasPrice] = await Promise.all([
        transport.request('eth_chainId'),
        transport.request('eth_blockNumber'),
        transport.request('eth_gasPrice'),
      ])

      expect(chainId).toBe('0x1')
      expect(blockNumber).toMatch(/^0x[0-9a-f]+$/i)
      expect(gasPrice).toMatch(/^0x[0-9a-f]+$/i)
    },
    TIMEOUT,
  )
})

describe('Ethereum: WebSocket', () => {
  let transport: WebSocketTransport<EthereumSchema>

  afterEach(async () => {
    await transport.close()
  })

  it(
    'eth_chainId',
    async () => {
      transport = webSocket<EthereumSchema>(ETH_WS_URL, { timeout: 10000 })
      const chainId = await transport.request('eth_chainId')
      expect(chainId).toBe('0x1')
    },
    TIMEOUT,
  )

  it(
    'eth_blockNumber',
    async () => {
      transport = webSocket<EthereumSchema>(ETH_WS_URL, { timeout: 10000 })
      const blockNumber = await transport.request('eth_blockNumber')
      expect(blockNumber).toMatch(/^0x[0-9a-f]+$/i)
      expect(Number.parseInt(blockNumber, 16)).toBeGreaterThan(20_000_000)
    },
    TIMEOUT,
  )

  it(
    'eth_getBlockByNumber',
    async () => {
      transport = webSocket<EthereumSchema>(ETH_WS_URL, { timeout: 10000 })
      const block = await transport.request(
        'eth_getBlockByNumber',
        'latest',
        false,
      )
      expect(block?.number).toMatch(/^0x[0-9a-f]+$/i)
      expect(block?.hash).toMatch(/^0x[0-9a-f]{64}$/i)
    },
    TIMEOUT,
  )

  it(
    'eth_subscribe newHeads',
    async () => {
      transport = webSocket<EthereumSchema>(ETH_WS_URL, { timeout: 15000 })

      const notifications: Array<{
        number: string
        hash: string
        parentHash: string
      }> = []

      // Subscribe to newHeads - the Ethereum transport handles notification routing
      const unsub = await transport.subscribe(
        'eth_subscribe',
        'newHeads',
        (data: unknown) => {
          // Callback receives block headers directly (not the subscription ID)
          notifications.push(
            data as { number: string; hash: string; parentHash: string },
          )
        },
      )

      // Wait for at least one block (Ethereum ~12s block time)
      const startTime = Date.now()
      while (notifications.length === 0 && Date.now() - startTime < 15000) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      // Verify we received at least one block header
      expect(notifications.length).toBeGreaterThan(0)
      const head = notifications[0]
      expect(head.number).toMatch(/^0x[0-9a-f]+$/i)
      expect(head.hash).toMatch(/^0x[0-9a-f]{64}$/i)
      expect(head.parentHash).toMatch(/^0x[0-9a-f]{64}$/i)

      await unsub()
    },
    TIMEOUT + 20000,
  )

  it(
    'eth_subscribe logs (USDC transfers)',
    async () => {
      transport = webSocket<EthereumSchema>(ETH_WS_URL, { timeout: 15000 })

      const notifications: Array<{
        address: string
        topics: string[]
        data: string
        blockNumber: string | null
        transactionHash: string | null
      }> = []

      // Subscribe to USDC Transfer events - the Ethereum transport handles notification routing
      const unsub = await transport.subscribe(
        'eth_subscribe',
        'logs',
        {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        },
        (data: unknown) => {
          // Callback receives log data directly (not the subscription ID)
          notifications.push(
            data as {
              address: string
              topics: string[]
              data: string
              blockNumber: string | null
              transactionHash: string | null
            },
          )
        },
      )

      // USDC is heavily traded, should see transfers within a few blocks
      // Wait up to 30 seconds for at least one transfer
      const startTime = Date.now()
      while (notifications.length === 0 && Date.now() - startTime < 30000) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      // Verify we received at least one USDC transfer log
      expect(notifications.length).toBeGreaterThan(0)
      const log = notifications[0]
      expect(log.address.toLowerCase()).toBe(
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      )
      expect(log.topics[0]).toBe(
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      )
      expect(log.data).toMatch(/^0x[0-9a-f]*$/i)
      expect(log.blockNumber).toMatch(/^0x[0-9a-f]+$/i)
      expect(log.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i)

      await unsub()
    },
    TIMEOUT + 35000,
  )

  it(
    'eth_unsubscribe stops notifications',
    async () => {
      transport = webSocket<EthereumSchema>(ETH_WS_URL, { timeout: 15000 })

      const notifications: unknown[] = []

      // Subscribe to USDC Transfer events (very frequent)
      const unsub = await transport.subscribe(
        'eth_subscribe',
        'logs',
        {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        },
        (data: unknown) => {
          notifications.push(data)
        },
      )

      // Wait for at least one notification to confirm subscription is active
      const startTime = Date.now()
      while (notifications.length === 0 && Date.now() - startTime < 30000) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      expect(notifications.length).toBeGreaterThan(0)

      // Unsubscribe
      await unsub()

      // Record count after unsubscribe
      const countAfterUnsub = notifications.length

      // Wait for a time window where we would expect more notifications if still subscribed
      // USDC has many transfers per block, so 15 seconds should see activity if still subscribed
      await new Promise((resolve) => setTimeout(resolve, 15000))

      // Verify no new notifications arrived after unsubscribe
      expect(notifications.length).toBe(countAfterUnsub)
    },
    TIMEOUT + 50000,
  )
})

describe('Ethereum: net methods', () => {
  let transport: Transport<EthereumSchema>

  afterEach(async () => {
    await transport.close()
  })

  it(
    'net_version',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      const netVersion = await transport.request('net_version')
      // Some nodes return '1', others return '0x1'
      expect(['1', '0x1']).toContain(netVersion)
    },
    TIMEOUT,
  )

  it(
    'web3_clientVersion',
    async () => {
      transport = http<EthereumSchema>(ETH_HTTP_URL, { timeout: 10000 })
      const clientVersion = await transport.request('web3_clientVersion')
      expect(clientVersion).toBeTypeOf('string')
      expect(clientVersion.length).toBeGreaterThan(0)
    },
    TIMEOUT,
  )
})
