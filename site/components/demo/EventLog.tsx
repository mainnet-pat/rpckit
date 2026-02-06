'use client'

import type { SubscriptionEvent } from './types.js'

interface EventLogProps {
  events: SubscriptionEvent[]
  onClear: () => void
  maxEvents?: number
}

export function EventLog({ events, onClear, maxEvents = 20 }: EventLogProps) {
  const displayedEvents = events.slice(0, maxEvents)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Subscription Events ({events.length})
        </span>
        {events.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        {displayedEvents.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No subscription events yet
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {displayedEvents.map((event) => (
              <div key={event.id} className="p-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {event.subscriptionType.split('.').pop()}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {event.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <pre className="text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(event.data, null, 0)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
