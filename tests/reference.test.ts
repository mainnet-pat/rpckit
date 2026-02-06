import { binToHex, sha256 } from '@bitauth/libauth'
import { ElectrumClient } from '@electrum-cash/network'
import type { Transport } from '@rpckit/core'
import type { ElectrumCashSchema } from '@rpckit/core/electrum-cash'
import { webSocket } from '@rpckit/websocket/electrum-cash'
// @ts-expect-error mainnet-js exports lack types condition for NodeNext
import { SendRequest, TestNetWallet, type UnitEnum } from 'mainnet-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TIMEOUT = 15_000
const SERVER = 'wss://chipnet.imaginary.cash:50004'

/**
 * Reference compatibility test: rpckit vs @electrum-cash/network
 *
 * Verifies that rpckit's new spread-params API produces the same results
 * as @electrum-cash/network when talking to the same Electrum Cash server.
 *
 * Both libraries now use:
 *   client.request('method', param1, param2)
 *
 * Subscribe differs slightly:
 *   rpckit:              transport.subscribe('method', ...params, onData)
 *   @electrum-cash:      client.subscribe('method', ...params) + event listener
 */
describe('reference: rpckit vs @electrum-cash/network', () => {
  let rpckit: Transport<ElectrumCashSchema>
  let electrum: InstanceType<typeof ElectrumClient>

  beforeAll(async () => {
    // Connect rpckit
    rpckit = webSocket<ElectrumCashSchema>(SERVER, {
      timeout: 10_000,
      protocolVersion: '1.5',
    })
    await rpckit.connect()

    // Connect @electrum-cash/network
    const url = new URL(SERVER)
    electrum = new ElectrumClient('rpckit-test', '1.5', url.hostname)
    await electrum.connect()
  }, TIMEOUT)

  afterAll(async () => {
    if (rpckit) await rpckit.close()
    if (electrum) await electrum.disconnect(true)
  })

  describe('request signatures', () => {
    it(
      'server.ping — both return null',
      async () => {
        const rpcResult = await rpckit.request('server.ping')
        const ecResult = await electrum.request('server.ping')
        expect(rpcResult).toBeNull()
        expect(ecResult).toBeNull()
      },
      TIMEOUT,
    )

    it(
      'blockchain.headers.get_tip — same height/hex',
      async () => {
        const rpcResult = (await rpckit.request(
          'blockchain.headers.get_tip',
        )) as { height: number; hex: string }
        const ecResult = (await electrum.request(
          'blockchain.headers.get_tip',
        )) as { height: number; hex: string }

        // Heights should be very close (within 1 block)
        expect(
          Math.abs(rpcResult.height - ecResult.height),
        ).toBeLessThanOrEqual(1)
        expect(typeof rpcResult.hex).toBe('string')
        expect(typeof ecResult.hex).toBe('string')
      },
      TIMEOUT,
    )

    it(
      'blockchain.block.header(1) — identical raw header',
      async () => {
        // Both use spread params: request('blockchain.block.header', 1)
        const rpcResult = await rpckit.request('blockchain.block.header', 1)
        const ecResult = await electrum.request('blockchain.block.header', 1)
        expect(rpcResult).toBe(ecResult)
      },
      TIMEOUT,
    )

    it(
      'server.banner — both return string',
      async () => {
        const rpcResult = await rpckit.request('server.banner')
        const ecResult = await electrum.request('server.banner')
        expect(typeof rpcResult).toBe('string')
        expect(typeof ecResult).toBe('string')
        // Same server should return the same banner
        expect(rpcResult).toBe(ecResult)
      },
      TIMEOUT,
    )
  })
})

describe('reference: rpckit vs @electrum-cash/network subscriptions', () => {
  let rpckit: Transport<ElectrumCashSchema>
  let electrum: InstanceType<typeof ElectrumClient>

  beforeAll(async () => {
    // Connect rpckit
    rpckit = webSocket<ElectrumCashSchema>(SERVER, {
      timeout: 10_000,
      protocolVersion: '1.5',
    })
    await rpckit.connect()

    // Connect @electrum-cash/network
    const url = new URL(SERVER)
    electrum = new ElectrumClient('rpckit-test', '1.5', url.hostname)
    await electrum.connect()
  }, TIMEOUT)

  afterAll(async () => {
    if (rpckit) await rpckit.close()
    if (electrum) await electrum.disconnect(true)
  })

  it('should update address status identically', async () => {
    // create wallets
    const fundingWallet = await TestNetWallet.fromWIF(
      'cVfueuxckYk9DjiniHC4mnMsgctwqC268ZPotEVcEWJfneknpMi1',
    )
    const receivingWallet = await TestNetWallet.newRandom()
    const address = receivingWallet.cashaddr

    // establish subscriptions
    const rpcUpdates: unknown[] = []
    const ecUpdates: unknown[][] = []

    // rpckit: subscribe('method', ...params, callback)
    const unsub = await rpckit.subscribe(
      'blockchain.address.subscribe',
      address,
      (data) => {
        rpcUpdates.push(data)
      },
    )

    // @electrum-cash/network: subscribe + notification listener
    const ecHandler = (notification: {
      method: string
      params?: unknown[]
    }) => {
      if (notification.method === 'blockchain.address.subscribe') {
        ecUpdates.push(notification.params ?? [])
      }
    }
    electrum.on('notification', ecHandler)
    await electrum.subscribe('blockchain.address.subscribe', address)

    // Both should have received initial result: [address, null] (fresh address)
    expect(rpcUpdates.length).toBe(1)
    expect(ecUpdates.length).toBe(1)
    expect(rpcUpdates[0]).toEqual(ecUpdates[0])

    // Initial status is null for a fresh address with no history
    const rpcInitial = rpcUpdates[0] as [string, string | null]
    const ecInitial = ecUpdates[0] as [string, string | null]
    expect(rpcInitial[1]).toBeNull()
    expect(ecInitial[1]).toBeNull()

    // send a transaction
    await fundingWallet.send([
      new SendRequest({
        cashaddr: receivingWallet.cashaddr,
        value: 1000,
        unit: 'sat' as UnitEnum,
      }),
    ])

    // wait for both to receive the tx notification
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out waiting for notifications')),
        20_000,
      )
      const check = () => {
        if (rpcUpdates.length >= 2 && ecUpdates.length >= 2) {
          clearTimeout(timeout)
          resolve()
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })

    // verify both received the same status update
    expect(rpcUpdates[1]).toEqual(ecUpdates[1])

    // Status after funds received is a 64-char hex string (SHA256 of address history)
    const rpcUpdate = rpcUpdates[1] as [string, string | null]
    const ecUpdate = ecUpdates[1] as [string, string | null]
    expect(rpcUpdate[1]).toMatch(/^[0-9a-f]{64}$/)
    expect(ecUpdate[1]).toMatch(/^[0-9a-f]{64}$/)

    // cleanup
    await unsub()
    electrum.off('notification', ecHandler)
    await electrum.unsubscribe('blockchain.address.subscribe', address)
  }, 30_000)

  it('should track transaction confirmations identically', async () => {
    // create wallets and send a transaction to get a txid
    const fundingWallet = await TestNetWallet.fromWIF(
      'cVfueuxckYk9DjiniHC4mnMsgctwqC268ZPotEVcEWJfneknpMi1',
    )
    const receivingWallet = await TestNetWallet.newRandom()

    const { encodedTransaction } = await fundingWallet.encodeTransaction(
      new SendRequest({
        cashaddr: receivingWallet.cashaddr,
        value: 1000,
        unit: 'sat' as UnitEnum,
      }),
      undefined,
      {
        awaitTransactionPropagation: false,
        queryBalance: false,
      },
    )

    const txHash = binToHex(
      sha256.hash(sha256.hash(encodedTransaction)).reverse(),
    )
    expect(txHash).toMatch(/^[0-9a-f]{64}$/)

    // subscribe to the transaction via both libraries
    const rpcUpdates: unknown[] = []
    const ecUpdates: unknown[][] = []

    const unsub = await rpckit.subscribe(
      'blockchain.transaction.subscribe',
      txHash,
      (data) => {
        rpcUpdates.push(data)
      },
    )

    const ecHandler = (notification: {
      method: string
      params?: unknown[]
    }) => {
      if (notification.method === 'blockchain.transaction.subscribe') {
        ecUpdates.push(notification.params ?? [])
      }
    }
    electrum.on('notification', ecHandler)
    await electrum.subscribe('blockchain.transaction.subscribe', txHash)

    await fundingWallet.provider.sendRawTransaction(
      binToHex(encodedTransaction),
      false,
    )

    // Both should have received initial result: [tx_hash, confirmations]
    expect(rpcUpdates.length).toBe(1)
    expect(ecUpdates.length).toBe(1)
    expect(rpcUpdates[0]).toEqual(ecUpdates[0])

    // Initial result is [tx_hash, height] where height is null for
    // unconfirmed mempool tx, or a block height number if already mined
    const rpcInitial = rpcUpdates[0] as [string, number | null]
    const ecInitial = ecUpdates[0] as [string, number | null]
    expect(rpcInitial[0]).toBe(txHash)
    expect(ecInitial[0]).toBe(txHash)
    expect(rpcInitial[1]).toBeNull()
    expect(ecInitial[1]).toBeNull()

    // wait for mempool notification (height becomes non-null)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out waiting for mempool notification')),
        20_000,
      )
      const check = () => {
        if (rpcUpdates.length >= 2 && ecUpdates.length >= 2) {
          clearTimeout(timeout)
          resolve()
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })

    // Both should have received a mempool notification with matching height
    const rpcMempool = rpcUpdates[1] as [string, number]
    const ecMempool = ecUpdates[1] as [string, number]
    expect(rpcMempool).toEqual(ecMempool)
    expect(rpcMempool[0]).toBe(txHash)
    expect(typeof rpcMempool[1]).toBe('number')
    expect(rpcMempool[1]).toBeLessThanOrEqual(0)

    // cleanup
    await unsub()
    electrum.off('notification', ecHandler)
    await electrum.unsubscribe('blockchain.transaction.subscribe', txHash)
  }, 30_000)

  it('should receive initial header identically', async () => {
    type HeaderNotification = [{ height: number; hex: string }]

    const rpcUpdates: HeaderNotification[] = []
    const ecUpdates: HeaderNotification[] = []

    const unsub = await rpckit.subscribe(
      'blockchain.headers.subscribe',
      (data) => {
        rpcUpdates.push(data as HeaderNotification)
      },
    )

    const ecHandler = (notification: {
      method: string
      params?: unknown[]
    }) => {
      if (notification.method === 'blockchain.headers.subscribe') {
        ecUpdates.push((notification.params ?? []) as HeaderNotification)
      }
    }
    electrum.on('notification', ecHandler)
    await electrum.subscribe('blockchain.headers.subscribe')

    // Both should have received initial result
    expect(rpcUpdates.length).toBe(1)
    expect(ecUpdates.length).toBe(1)

    // Both produce [{height, hex}] — rpckit via transformInitialResult,
    // electrum-cash via notification.params
    const rpcHeader = rpcUpdates[0][0]
    const ecHeader = ecUpdates[0][0]

    // Both should report the same tip (within 1 block tolerance)
    expect(Math.abs(rpcHeader.height - ecHeader.height)).toBeLessThanOrEqual(1)
    expect(typeof rpcHeader.hex).toBe('string')
    expect(typeof ecHeader.hex).toBe('string')
    expect(rpcHeader.hex.length).toBeGreaterThan(0)

    // Wait 5 seconds — if a new block arrives, celebrate
    const rpcBefore = rpcUpdates.length
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    if (rpcUpdates.length > rpcBefore) {
      const newHeader = rpcUpdates[rpcUpdates.length - 1][0]
      console.log(
        `\n🎉 New block found during test! Height: ${newHeader.height}\n`,
      )
    }

    // cleanup
    await unsub()
    electrum.off('notification', ecHandler)
    await electrum.unsubscribe('blockchain.headers.subscribe')
  }, 15_000)
})
