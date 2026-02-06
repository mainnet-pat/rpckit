'use client'

import type { DemoConfig, TransportConfig, TransportMode } from './types.js'
import { DEFAULT_SERVERS, BCHN_SERVERS, generateId } from './constants.js'
import { TransportCard } from './TransportCard.js'

interface TransportBuilderProps {
  config: DemoConfig
  onChange: (config: DemoConfig) => void
  disabled?: boolean
}

const MODES: { value: TransportMode; label: string; description: string }[] = [
  { value: 'single', label: 'Single', description: 'Direct connection' },
  {
    value: 'fallback',
    label: 'Fallback',
    description: 'Failover across N transports',
  },
  {
    value: 'cluster',
    label: 'Cluster',
    description: 'm-of-n quorum consensus',
  },
]

export function TransportBuilder({
  config,
  onChange,
  disabled,
}: TransportBuilderProps) {
  const handleModeChange = (mode: TransportMode) => {
    let transports = config.transports
    if (
      mode !== 'single' &&
      transports.length < 2 &&
      config.mode === 'single'
    ) {
      // Add a second transport when switching to multi-transport mode
      const availableServers = config.protocol === 'bchn' ? BCHN_SERVERS : DEFAULT_SERVERS
      const newTransport: TransportConfig = {
        id: generateId(),
        type: availableServers[1]?.config.type ?? 'http',
        url: availableServers[1]?.config.url ?? '',
      }
      transports = [...transports, newTransport]
    }
    onChange({ ...config, mode, transports })
  }

  const handleTransportChange = (index: number, transport: TransportConfig) => {
    const transports = [...config.transports]
    transports[index] = transport
    onChange({ ...config, transports })
  }

  const handleAddTransport = () => {
    const newTransport: TransportConfig = {
      id: generateId(),
      type: config.protocol === 'bchn' ? 'http' : 'websocket',
      url: '',
    }
    onChange({ ...config, transports: [...config.transports, newTransport] })
  }

  const handleRemoveTransport = (index: number) => {
    const transports = config.transports.filter((_, i) => i !== index)
    // Ensure at least one transport remains
    if (transports.length === 0) {
      const availableServers = config.protocol === 'bchn' ? BCHN_SERVERS : DEFAULT_SERVERS
      transports.push({
        id: generateId(),
        type: availableServers[0].config.type,
        url: availableServers[0].config.url,
      })
    }
    // Reset to single mode if only one transport left
    const mode =
      transports.length === 1 && config.mode !== 'single'
        ? 'single'
        : config.mode
    onChange({ ...config, transports, mode })
  }

  const handleRankToggle = () => {
    onChange({ ...config, fallbackRank: !config.fallbackRank })
  }

  const handleQuorumChange = (quorum: number) => {
    onChange({ ...config, clusterQuorum: quorum })
  }

  const servers = config.protocol === 'bchn' ? BCHN_SERVERS : DEFAULT_SERVERS
  const showMultiTransportUI = config.mode !== 'single'
  const maxQuorum = config.transports.length

  return (
    <div className="space-y-4">
      {/* Mode Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => handleModeChange(mode.value)}
            disabled={disabled}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              config.mode === mode.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={mode.description}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Transport Cards */}
      <div className="space-y-3">
        {config.transports.map((transport, index) => (
          <TransportCard
            key={transport.id}
            config={transport}
            servers={servers}
            onChange={(t) => handleTransportChange(index, t)}
            onRemove={() => handleRemoveTransport(index)}
            showRemove={showMultiTransportUI || config.transports.length > 1}
          />
        ))}
      </div>

      {/* Add Transport Button */}
      {showMultiTransportUI && (
        <button
          type="button"
          onClick={handleAddTransport}
          disabled={disabled}
          className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add Transport
        </button>
      )}

      {/* Mode-specific Options */}
      {config.mode === 'fallback' && (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Health Ranking
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Automatically rank transports by latency and stability
            </p>
          </div>
          <button
            type="button"
            onClick={handleRankToggle}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.fallbackRank ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.fallbackRank ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {config.mode === 'cluster' && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Quorum: {config.clusterQuorum} of {maxQuorum}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={maxQuorum}
            value={config.clusterQuorum}
            onChange={(e) => handleQuorumChange(Number(e.target.value))}
            disabled={disabled}
            className="w-full accent-blue-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Number of transports that must agree on the response
          </p>
        </div>
      )}
    </div>
  )
}
