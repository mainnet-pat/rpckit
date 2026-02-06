'use client'

import { useState, useCallback, useMemo } from 'react'
import type { DemoConfig, Protocol, RequestResult } from './types.js'
import {
  DEFAULT_SERVERS,
  BCHN_SERVERS,
  ETHEREUM_SERVERS,
  ELECTRUM_METHODS,
  BCHN_METHODS,
  ETHEREUM_METHODS,
  generateId,
} from './constants.js'
import { useTransport } from './hooks/useTransport.js'
import { useSubscription } from './hooks/useSubscription.js'
import { ConnectionStatus } from './ConnectionStatus.js'
import { TransportBuilder } from './TransportBuilder.js'
import { MethodSelector } from './MethodSelector.js'
import { ResultDisplay } from './ResultDisplay.js'
import { SubscriptionPanel } from './SubscriptionPanel.js'
import { EventLog } from './EventLog.js'

function createInitialConfig(protocol: Protocol): DemoConfig {
  const servers =
    protocol === 'bchn'
      ? BCHN_SERVERS
      : protocol === 'ethereum'
        ? ETHEREUM_SERVERS
        : DEFAULT_SERVERS
  return {
    mode: 'single',
    protocol,
    transports: [
      {
        id: generateId(),
        type: servers[0].config.type,
        url: servers[0].config.url,
      },
    ],
    fallbackRank: false,
    clusterQuorum: 2,
  }
}

const initialConfig = createInitialConfig('electrum')

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  if (typeof err === 'object' && err !== null) {
    // Handle RPC error objects: { code: number, message: string }
    const obj = err as Record<string, unknown>
    if ('message' in obj && typeof obj.message === 'string') {
      const code = 'code' in obj ? ` (code: ${obj.code})` : ''
      return obj.message + code
    }
    // Try to stringify other objects
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

export function InteractiveDemo() {
  const [config, setConfig] = useState<DemoConfig>(initialConfig)
  const [results, setResults] = useState<RequestResult[]>([])
  const [executing, setExecuting] = useState(false)

  const transport = useTransport(config)
  const {
    subscriptions,
    events,
    subscribe,
    unsubscribe,
    unsubscribeAll,
    clearEvents,
  } = useSubscription()

  const isConnected = transport.status === 'connected'
  const isConnecting = transport.status === 'connecting'

  const methods = useMemo(
    () =>
      config.protocol === 'bchn'
        ? BCHN_METHODS
        : config.protocol === 'ethereum'
          ? ETHEREUM_METHODS
          : ELECTRUM_METHODS,
    [config.protocol]
  )

  // Check if any transport uses WebSocket and protocol supports subscriptions
  const hasWebSocket = useMemo(
    () =>
      (config.protocol === 'electrum' || config.protocol === 'ethereum') &&
      config.transports.some((t) => t.type === 'websocket'),
    [config.transports, config.protocol]
  )

  const handleProtocolChange = useCallback(
    async (protocol: Protocol) => {
      if (protocol === config.protocol) return
      // Disconnect if connected
      if (isConnected) {
        await unsubscribeAll()
        await transport.disconnect()
      }
      setResults([])
      setConfig(createInitialConfig(protocol))
    },
    [config.protocol, isConnected, transport, unsubscribeAll]
  )

  const handleConnect = useCallback(async () => {
    await transport.connect()
  }, [transport])

  const handleDisconnect = useCallback(async () => {
    await unsubscribeAll()
    await transport.disconnect()
  }, [transport, unsubscribeAll])

  const handleExecute = useCallback(
    async (method: string, params: unknown[]) => {
      setExecuting(true)
      const startTime = performance.now()
      try {
        const result = await transport.request(method, ...params)
        const duration = performance.now() - startTime
        setResults((prev) => [
          {
            id: generateId(),
            method,
            params,
            result,
            timestamp: new Date(),
            duration,
          },
          ...prev,
        ])
      } catch (err) {
        const duration = performance.now() - startTime
        setResults((prev) => [
          {
            id: generateId(),
            method,
            params,
            error: formatErrorMessage(err),
            timestamp: new Date(),
            duration,
          },
          ...prev,
        ])
      } finally {
        setExecuting(false)
      }
    },
    [transport]
  )

  const handleDismissResult = useCallback((id: string) => {
    setResults((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const handleSubscribe = useCallback(
    async (method: string, params: unknown[]) => {
      await subscribe(method, params, transport.subscribe)
    },
    [subscribe, transport.subscribe]
  )

  const handleUnsubscribe = useCallback(
    async (subscriptionId: string) => {
      await unsubscribe(subscriptionId)
    },
    [unsubscribe]
  )

  return (
    <div className="space-y-6">
      {/* Protocol Selector */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <button
          type="button"
          onClick={() => handleProtocolChange('electrum')}
          disabled={isConnecting}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            config.protocol === 'electrum'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Electrum Cash
        </button>
        <button
          type="button"
          onClick={() => handleProtocolChange('ethereum')}
          disabled={isConnecting}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            config.protocol === 'ethereum'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Ethereum
        </button>
        <button
          type="button"
          onClick={() => handleProtocolChange('bchn')}
          disabled={isConnecting}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            config.protocol === 'bchn'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          BCHN
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <ConnectionStatus status={transport.status} error={transport.error} />
        <div className="flex gap-2">
          {isConnected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting || config.transports.every((t) => !t.url)}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Configuration & Methods */}
        <div className="space-y-6">
          {/* Transport Configuration */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Transport Configuration
            </h3>
            <TransportBuilder
              config={config}
              onChange={setConfig}
              disabled={isConnected || isConnecting}
            />
          </div>

          {/* Method Selector */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Execute RPC Method
            </h3>
            <MethodSelector
              methods={methods}
              onExecute={handleExecute}
              disabled={!isConnected}
              loading={executing}
            />
          </div>

          {/* Subscriptions (Electrum and Ethereum) */}
          {(config.protocol === 'electrum' || config.protocol === 'ethereum') && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Subscriptions
              </h3>
              <SubscriptionPanel
                subscriptions={subscriptions}
                onSubscribe={handleSubscribe}
                onUnsubscribe={handleUnsubscribe}
                disabled={!isConnected}
                isWebSocket={hasWebSocket}
                protocol={config.protocol}
              />
            </div>
          )}
        </div>

        {/* Right Column - Results & Events */}
        <div className="space-y-6">
          {/* Request Results */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Request Results
            </h3>
            <ResultDisplay
              results={results}
              onDismiss={handleDismissResult}
              maxResults={10}
            />
          </div>

          {/* Subscription Events */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 min-h-[300px]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Live Events
            </h3>
            <EventLog events={events} onClear={clearEvents} maxEvents={50} />
          </div>
        </div>
      </div>
    </div>
  )
}
