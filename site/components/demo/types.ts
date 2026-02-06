import type { Transport } from '@rpckit/core'

export type TransportType = 'websocket' | 'http'
export type TransportMode = 'single' | 'fallback' | 'cluster'
export type Protocol = 'electrum' | 'bchn' | 'ethereum'

export interface TransportConfig {
  id: string
  type: TransportType
  url: string
}

export interface DemoConfig {
  mode: TransportMode
  protocol: Protocol
  transports: TransportConfig[]
  fallbackRank: boolean
  clusterQuorum: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface TransportState {
  status: ConnectionStatus
  error: string | null
  transport: Transport | null
}

export interface RpcMethod {
  name: string
  label: string
  params: RpcParam[]
  isSubscription?: boolean
}

export interface RpcParam {
  name: string
  label: string
  placeholder: string
  defaultValue?: string
}

export interface RequestResult {
  id: string
  method: string
  params: unknown[]
  result?: unknown
  error?: string
  timestamp: Date
  duration?: number
}

export interface SubscriptionEvent {
  id: string
  subscriptionId: string
  subscriptionType: string
  data: unknown
  timestamp: Date
}

export interface ActiveSubscription {
  id: string
  method: string
  params: unknown[]
  unsubscribe: () => Promise<void>
}
