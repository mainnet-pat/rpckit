'use client'

import type { TransportConfig, TransportType } from './types.js'

interface TransportCardProps {
  config: TransportConfig
  servers: { label: string; config: TransportConfig }[]
  onChange: (config: TransportConfig) => void
  onRemove?: () => void
  showRemove?: boolean
}

export function TransportCard({
  config,
  servers,
  onChange,
  onRemove,
  showRemove = true,
}: TransportCardProps) {
  const handleTypeChange = (type: TransportType) => {
    onChange({ ...config, type })
  }

  const handleUrlChange = (url: string) => {
    onChange({ ...config, url })
  }

  const handleQuickSelect = (serverConfig: TransportConfig) => {
    onChange({ ...config, type: serverConfig.type, url: serverConfig.url })
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('websocket')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              config.type === 'websocket'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            WebSocket
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('http')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              config.type === 'http'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            HTTP
          </button>
        </div>
        {showRemove && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Remove transport"
          >
            <svg
              className="w-5 h-5"
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
        )}
      </div>

      <div>
        <input
          type="text"
          value={config.url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder={
            config.type === 'websocket'
              ? 'wss://server.example.com'
              : 'https://server.example.com'
          }
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
          Quick:
        </span>
        {servers
          .filter((s) => s.config.type === config.type)
          .map((server) => (
            <button
              key={server.config.id}
              type="button"
              onClick={() => handleQuickSelect(server.config)}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {server.label}
            </button>
          ))}
      </div>
    </div>
  )
}
