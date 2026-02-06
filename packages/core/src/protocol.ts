export interface RpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: unknown[]
  id: number
}

export interface RpcResponse {
  jsonrpc: '2.0'
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
  id: number
}

export interface SubscriptionNotification {
  jsonrpc: '2.0'
  method: string
  params: unknown[]
}
