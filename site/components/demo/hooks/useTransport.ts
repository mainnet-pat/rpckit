'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transport } from '@rpckit/core'
import { webSocket as electrumWebSocket } from '@rpckit/websocket/electrum-cash'
import { http as electrumHttp } from '@rpckit/http/electrum-cash'
import { fallback as electrumFallback } from '@rpckit/fallback/electrum-cash'
import { webSocket as ethereumWebSocket } from '@rpckit/websocket/ethereum'
import { http as ethereumHttp } from '@rpckit/http/ethereum'
import { webSocket as baseWebSocket } from '@rpckit/websocket'
import { http as baseHttp } from '@rpckit/http'
import { fallback as baseFallback } from '@rpckit/fallback'
import { cluster } from '@rpckit/cluster'
import type {
  ConnectionStatus,
  DemoConfig,
  TransportConfig,
} from '../types.js'

function createSingleTransport(
  config: TransportConfig,
  protocol: DemoConfig['protocol'],
): Transport {
  if (protocol === 'bchn') {
    if (config.type === 'websocket') {
      return baseWebSocket(config.url, { timeout: 30000 })
    }
    return baseHttp(config.url)
  }

  if (protocol === 'ethereum') {
    if (config.type === 'websocket') {
      return ethereumWebSocket(config.url, { timeout: 30000 })
    }
    return ethereumHttp(config.url, { timeout: 30000 })
  }

  // Electrum protocol
  if (config.type === 'websocket') {
    return electrumWebSocket(config.url, { timeout: 30000 })
  }
  return electrumHttp(config.url)
}

function createTransport(config: DemoConfig): Transport {
  const transports = config.transports.map((t) =>
    createSingleTransport(t, config.protocol),
  )

  if (config.mode === 'single' || transports.length === 1) {
    return transports[0]
  }

  if (config.mode === 'fallback') {
    const fb = config.protocol === 'electrum' ? electrumFallback : baseFallback
    return fb(transports as [Transport, Transport, ...Transport[]], {
      rank: config.fallbackRank,
    })
  }

  if (config.mode === 'cluster') {
    return cluster(transports as [Transport, Transport, ...Transport[]], {
      quorum: config.clusterQuorum,
      timeout: 30000,
    })
  }

  return transports[0]
}

export interface UseTransportResult {
  status: ConnectionStatus
  error: string | null
  transport: Transport | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  request: (method: string, ...params: unknown[]) => Promise<unknown>
  subscribe: (
    method: string,
    ...args: [...unknown[], (data: unknown) => void]
  ) => Promise<() => Promise<void>>
}

export function useTransport(config: DemoConfig | null): UseTransportResult {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const transportRef = useRef<Transport | null>(null)
  const configRef = useRef<DemoConfig | null>(null)

  const disconnect = useCallback(async () => {
    if (transportRef.current) {
      try {
        await transportRef.current.close()
      } catch {
        // Ignore close errors
      }
      transportRef.current = null
    }
    setStatus('disconnected')
    setError(null)
  }, [])

  const connect = useCallback(async () => {
    if (!configRef.current || configRef.current.transports.length === 0) {
      setError('No transports configured')
      return
    }

    await disconnect()

    setStatus('connecting')
    setError(null)

    try {
      const transport = createTransport(configRef.current)
      transportRef.current = transport
      await transport.connect()
      setStatus('connected')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Connection failed')
      transportRef.current = null
    }
  }, [disconnect])

  const request = useCallback(
    async (method: string, ...params: unknown[]): Promise<unknown> => {
      if (!transportRef.current) {
        throw new Error('Not connected')
      }
      return transportRef.current.request(method, ...params)
    },
    []
  )

  const subscribe = useCallback(
    async (
      method: string,
      ...args: unknown[]
    ): Promise<() => Promise<void>> => {
      const onData = args.pop() as (data: unknown) => void
      const params = args as unknown[]
      if (!transportRef.current) {
        throw new Error('Not connected')
      }
      const unsubscribe = await transportRef.current.subscribe(
        method,
        ...params,
        onData
      )
      return unsubscribe
    },
    []
  )

  // Update config ref when config changes
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transportRef.current) {
        transportRef.current.close().catch(() => {})
      }
    }
  }, [])

  return {
    status,
    error,
    transport: transportRef.current,
    connect,
    disconnect,
    request,
    subscribe,
  }
}
