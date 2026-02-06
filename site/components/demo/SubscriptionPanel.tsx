'use client'

import { useState, useCallback } from 'react'
import type { ActiveSubscription, Protocol } from './types.js'
import {
  SUBSCRIPTION_METHODS,
  ETHEREUM_SUBSCRIPTION_METHODS,
} from './constants.js'

interface SubscriptionPanelProps {
  subscriptions: ActiveSubscription[]
  onSubscribe: (method: string, params: unknown[]) => Promise<void>
  onUnsubscribe: (subscriptionId: string) => Promise<void>
  disabled?: boolean
  isWebSocket?: boolean
  protocol: Protocol
}

// USDC contract address on Ethereum mainnet
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
// Transfer event topic
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export function SubscriptionPanel({
  subscriptions,
  onSubscribe,
  onUnsubscribe,
  disabled,
  isWebSocket = true,
  protocol,
}: SubscriptionPanelProps) {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Electrum methods
  const headersMethod = SUBSCRIPTION_METHODS.find(
    (m) => m.name === 'blockchain.headers.subscribe'
  )
  const addressMethod = SUBSCRIPTION_METHODS.find(
    (m) => m.name === 'blockchain.address.subscribe'
  )

  // Ethereum methods
  const newHeadsMethod = ETHEREUM_SUBSCRIPTION_METHODS.find(
    (m) => m.name === 'eth_subscribe:newHeads'
  )
  const logsMethod = ETHEREUM_SUBSCRIPTION_METHODS.find(
    (m) => m.name === 'eth_subscribe:logs'
  )

  // Electrum subscription states
  const isSubscribedToHeaders = subscriptions.some(
    (s) => s.method === 'blockchain.headers.subscribe'
  )

  // Ethereum subscription states
  const isSubscribedToNewHeads = subscriptions.some(
    (s) => s.method === 'eth_subscribe' && s.params[0] === 'newHeads'
  )
  const isSubscribedToLogs = subscriptions.some(
    (s) => s.method === 'eth_subscribe' && s.params[0] === 'logs'
  )

  // Electrum: toggle headers subscription
  const handleHeadersToggle = useCallback(async () => {
    setLoading('headers')
    setError(null)
    try {
      if (isSubscribedToHeaders) {
        const sub = subscriptions.find(
          (s) => s.method === 'blockchain.headers.subscribe'
        )
        if (sub) {
          await onUnsubscribe(sub.id)
        }
      } else {
        await onSubscribe('blockchain.headers.subscribe', [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed')
    } finally {
      setLoading(null)
    }
  }, [isSubscribedToHeaders, subscriptions, onSubscribe, onUnsubscribe])

  // Ethereum: toggle newHeads subscription
  const handleNewHeadsToggle = useCallback(async () => {
    setLoading('newHeads')
    setError(null)
    try {
      if (isSubscribedToNewHeads) {
        const sub = subscriptions.find(
          (s) => s.method === 'eth_subscribe' && s.params[0] === 'newHeads'
        )
        if (sub) {
          await onUnsubscribe(sub.id)
        }
      } else {
        await onSubscribe('eth_subscribe', ['newHeads'])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed')
    } finally {
      setLoading(null)
    }
  }, [isSubscribedToNewHeads, subscriptions, onSubscribe, onUnsubscribe])

  // Ethereum: toggle logs subscription (USDC transfers)
  const handleLogsToggle = useCallback(async () => {
    setLoading('logs')
    setError(null)
    try {
      if (isSubscribedToLogs) {
        const sub = subscriptions.find(
          (s) => s.method === 'eth_subscribe' && s.params[0] === 'logs'
        )
        if (sub) {
          await onUnsubscribe(sub.id)
        }
      } else {
        await onSubscribe('eth_subscribe', [
          'logs',
          { address: USDC_ADDRESS, topics: [TRANSFER_TOPIC] },
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed')
    } finally {
      setLoading(null)
    }
  }, [isSubscribedToLogs, subscriptions, onSubscribe, onUnsubscribe])

  const handleAddressSubscribe = useCallback(async () => {
    if (!address.trim()) return
    setLoading('address')
    setError(null)
    try {
      await onSubscribe('blockchain.address.subscribe', [address.trim()])
      setAddress('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid address')
    } finally {
      setLoading(null)
    }
  }, [address, onSubscribe])

  const addressSubscriptions = subscriptions.filter(
    (s) => s.method === 'blockchain.address.subscribe'
  )

  if (!isWebSocket) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm border border-gray-200 dark:border-gray-700 rounded-lg">
        Subscriptions require WebSocket transport
      </div>
    )
  }

  // Ethereum subscriptions UI
  if (protocol === 'ethereum') {
    return (
      <div className="space-y-4">
        {/* New Blocks Monitor */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {newHeadsMethod?.label || 'New Blocks'}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Monitor new blocks in real-time
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewHeadsToggle}
              disabled={disabled || loading === 'newHeads'}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                isSubscribedToNewHeads
                  ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900'
                  : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900'
              }`}
            >
              {loading === 'newHeads'
                ? '...'
                : isSubscribedToNewHeads
                  ? 'Unsubscribe'
                  : 'Subscribe'}
            </button>
          </div>
        </div>

        {/* USDC Transfer Logs Monitor */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {logsMethod?.label || 'Logs (USDC Transfers)'}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Monitor USDC transfer events
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogsToggle}
              disabled={disabled || loading === 'logs'}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                isSubscribedToLogs
                  ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900'
                  : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900'
              }`}
            >
              {loading === 'logs'
                ? '...'
                : isSubscribedToLogs
                  ? 'Unsubscribe'
                  : 'Subscribe'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    )
  }

  // Electrum subscriptions UI (default)
  return (
    <div className="space-y-4">
      {/* Block Height Monitor */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {headersMethod?.label || 'Block Headers'}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Monitor new blocks in real-time
            </p>
          </div>
          <button
            type="button"
            onClick={handleHeadersToggle}
            disabled={disabled || loading === 'headers'}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
              isSubscribedToHeaders
                ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900'
                : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900'
            }`}
          >
            {loading === 'headers'
              ? '...'
              : isSubscribedToHeaders
                ? 'Unsubscribe'
                : 'Subscribe'}
          </button>
        </div>
      </div>

      {/* Address Monitor */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {addressMethod?.label || 'Address Activity'}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Monitor address for transaction activity
          </p>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setError(null)
            }}
            placeholder="bitcoincash:qp..."
            disabled={disabled}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleAddressSubscribe}
            disabled={disabled || loading === 'address' || !address.trim()}
            className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === 'address' ? '...' : 'Add'}
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        {addressSubscriptions.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Active ({addressSubscriptions.length}):
            </span>
            {addressSubscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-xs"
              >
                <code className="text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                  {String(sub.params[0]).slice(0, 16)}...
                </code>
                <button
                  type="button"
                  onClick={() => onUnsubscribe(sub.id)}
                  disabled={disabled}
                  className="text-red-500 hover:text-red-700 dark:hover:text-red-400 ml-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
