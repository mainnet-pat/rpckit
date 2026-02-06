import { cluster } from '@rpckit/cluster'
import type {
  ClusterTransport,
  ExtractMethod,
  ExtractParams,
  ExtractRequestMethod,
  ExtractReturn,
  ExtractSubscriptionMethod,
  FallbackTransport,
  Transport,
} from '@rpckit/core'
import type {
  ElectrumCashSchema,
  ElectrumCashSchema_1_5_3,
  ElectrumCashSchema_1_6_0,
} from '@rpckit/core/electrum-cash'
import { fallback } from '@rpckit/fallback'
import { describe, expectTypeOf, it } from 'vitest'

describe('Type-level tests', () => {
  it('extracts return types correctly', () => {
    expectTypeOf<
      ExtractReturn<ElectrumCashSchema, 'server.ping'>
    >().toEqualTypeOf<null>()
    expectTypeOf<
      ExtractReturn<ElectrumCashSchema, 'blockchain.headers.get_tip'>
    >().toEqualTypeOf<{ height: number; hex: string }>()
    expectTypeOf<
      ExtractReturn<ElectrumCashSchema, 'server.version'>
    >().toEqualTypeOf<[string, string]>()
    expectTypeOf<
      ExtractReturn<ElectrumCashSchema, 'blockchain.address.get_balance'>
    >().toEqualTypeOf<{ confirmed: number; unconfirmed: number }>()
  })

  it('extracts params correctly', () => {
    expectTypeOf<
      ExtractParams<ElectrumCashSchema, 'server.ping'>
    >().toEqualTypeOf<[]>()
    expectTypeOf<
      ExtractParams<ElectrumCashSchema, 'blockchain.transaction.get'>
    >().toEqualTypeOf<[tx_hash: string, verbose?: boolean]>()
    expectTypeOf<
      ExtractParams<ElectrumCashSchema, 'server.version'>
    >().toEqualTypeOf<[client_name?: string, protocol_version?: string]>()
  })

  it('extracts all method names', () => {
    type Methods = ExtractMethod<ElectrumCashSchema>
    expectTypeOf<'server.ping'>().toMatchTypeOf<Methods>()
    expectTypeOf<'blockchain.headers.get_tip'>().toMatchTypeOf<Methods>()
    expectTypeOf<'blockchain.address.subscribe'>().toMatchTypeOf<Methods>()
    expectTypeOf<'not.a.method'>().not.toMatchTypeOf<Methods>()
  })

  it('separates requests and subscriptions', () => {
    type RequestMethods = ExtractRequestMethod<ElectrumCashSchema>
    type SubscriptionMethods = ExtractSubscriptionMethod<ElectrumCashSchema>
    expectTypeOf<'server.ping'>().toMatchTypeOf<RequestMethods>()
    expectTypeOf<'blockchain.address.subscribe'>().toMatchTypeOf<SubscriptionMethods>()
    expectTypeOf<'blockchain.address.subscribe'>().not.toMatchTypeOf<RequestMethods>()
    expectTypeOf<'server.ping'>().not.toMatchTypeOf<SubscriptionMethods>()
  })

  it('transport has correct typed methods', () => {
    expectTypeOf<Transport<ElectrumCashSchema>>().toHaveProperty('request')
    expectTypeOf<Transport<ElectrumCashSchema>>().toHaveProperty('close')
    expectTypeOf<Transport<ElectrumCashSchema>>().toHaveProperty('subscribe')
    expectTypeOf<Transport<ElectrumCashSchema>>().toHaveProperty('connect')
  })

  it('fallback infers return type from array length', () => {
    const t1 = {} as Transport<ElectrumCashSchema>
    const t2 = {} as Transport<ElectrumCashSchema>
    const t3 = {} as Transport<ElectrumCashSchema>

    // Single transport returns the same type (unwrapped)
    const single = fallback([t1])
    expectTypeOf(single).toEqualTypeOf<Transport<ElectrumCashSchema>>()

    // Multiple transports returns FallbackTransport
    const multi = fallback([t1, t2])
    expectTypeOf(multi).toMatchTypeOf<FallbackTransport>()
    expectTypeOf(multi).toHaveProperty('scores')
    expectTypeOf(multi).toHaveProperty('onScores')
    expectTypeOf(multi).toHaveProperty('onResponse')

    // Three transports also returns FallbackTransport
    const triple = fallback([t1, t2, t3])
    expectTypeOf(triple).toMatchTypeOf<FallbackTransport>()
  })

  it('cluster infers return type from array length', () => {
    const t1 = {} as Transport<ElectrumCashSchema>
    const t2 = {} as Transport<ElectrumCashSchema>
    const t3 = {} as Transport<ElectrumCashSchema>

    // Single transport returns the same type (unwrapped)
    const single = cluster([t1], { quorum: 1 })
    expectTypeOf(single).toEqualTypeOf<Transport<ElectrumCashSchema>>()

    // Multiple transports returns ClusterTransport
    const multi = cluster([t1, t2], { quorum: 2 })
    expectTypeOf(multi).toMatchTypeOf<ClusterTransport>()
    expectTypeOf(multi).toHaveProperty('transports')
    expectTypeOf(multi).toHaveProperty('onResponse')

    // Three transports returns ClusterTransport
    const triple = cluster([t1, t2, t3], { quorum: 2 })
    expectTypeOf(triple).toMatchTypeOf<ClusterTransport>()
  })

  it('ElectrumCashSchema_1_6_0 has mempool.get_info', () => {
    // 1.5.0 does not have mempool.get_info
    type Methods_1_5_0 = ExtractMethod<ElectrumCashSchema_1_5_3>
    expectTypeOf<'mempool.get_info'>().not.toMatchTypeOf<Methods_1_5_0>()

    // 1.6.0 has mempool.get_info
    type Methods_1_6_0 = ExtractMethod<ElectrumCashSchema_1_6_0>
    expectTypeOf<'mempool.get_info'>().toMatchTypeOf<Methods_1_6_0>()

    // 1.6.0 has the correct return type
    expectTypeOf<
      ExtractReturn<ElectrumCashSchema_1_6_0, 'mempool.get_info'>
    >().toEqualTypeOf<
      | { mempoolminfee: number; minrelaytxfee: number }
      | {
          mempoolminfee: number
          minrelaytxfee: number
          incrementalrelayfee: number
          unbroadcastcount: number
          fullrbf: boolean
        }
    >()
  })

  it('blockchain.block.headers version differences', () => {
    // 1.5.3 returns hex (concatenated hex string)
    type BlockHeaders_1_5 =
      | { count: number; hex: string; max: number }
      | {
          count: number
          hex: string
          max: number
          root: string
          branch: string[]
        }

    expectTypeOf<
      ExtractReturn<ElectrumCashSchema_1_5_3, 'blockchain.block.headers'>
    >().toEqualTypeOf<BlockHeaders_1_5>()

    // 1.6.0 returns headers (array of hex strings)
    type BlockHeaders_1_6 =
      | { count: number; headers: string[]; max: number }
      | {
          count: number
          headers: string[]
          max: number
          root: string
          branch: string[]
        }

    expectTypeOf<
      ExtractReturn<ElectrumCashSchema_1_6_0, 'blockchain.block.headers'>
    >().toEqualTypeOf<BlockHeaders_1_6>()
  })
})
