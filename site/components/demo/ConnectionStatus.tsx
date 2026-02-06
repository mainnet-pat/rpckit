'use client'

import type { ConnectionStatus as Status } from './types.js'

interface ConnectionStatusProps {
  status: Status
  error?: string | null
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  disconnected: {
    label: 'Disconnected',
    className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  connecting: {
    label: 'Connecting...',
    className:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  connected: {
    label: 'Connected',
    className:
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
}

export function ConnectionStatus({ status, error }: ConnectionStatusProps) {
  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
      >
        <span
          className={`w-2 h-2 mr-1.5 rounded-full ${
            status === 'connected'
              ? 'bg-green-500'
              : status === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-gray-400'
          }`}
        />
        {config.label}
      </span>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  )
}
