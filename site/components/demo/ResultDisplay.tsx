'use client'

import type { RequestResult } from './types.js'

interface ResultDisplayProps {
  results: RequestResult[]
  onDismiss?: (id: string) => void
  maxResults?: number
}

function formatError(error: string): string {
  // Try to parse as JSON error object
  try {
    const parsed = JSON.parse(error)
    if (parsed && typeof parsed === 'object') {
      // Handle RPC error format: { code: number, message: string }
      if ('message' in parsed) {
        return parsed.message + (parsed.code ? ` (code: ${parsed.code})` : '')
      }
      // Handle other object formats
      return JSON.stringify(parsed, null, 2)
    }
  } catch {
    // Not JSON, check for [object Object]
    if (error === '[object Object]') {
      return 'Unknown error'
    }
  }
  return error
}

export function ResultDisplay({
  results,
  onDismiss,
  maxResults = 5,
}: ResultDisplayProps) {
  const displayedResults = results.slice(0, maxResults)

  if (displayedResults.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
        Execute a method to see results here
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {displayedResults.map((result) => (
        <div
          key={result.id}
          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(result.id)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Dismiss"
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
              )}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  result.error
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                }`}
              >
                {result.error ? 'Error' : 'Success'}
              </span>
              <code className="text-xs text-gray-600 dark:text-gray-400">
                {result.method}
              </code>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {result.duration !== undefined && (
                <span>{result.duration.toFixed(0)}ms</span>
              )}
              <span>{result.timestamp.toLocaleTimeString()}</span>
            </div>
          </div>
          <pre className="p-3 text-xs overflow-x-auto bg-gray-900 text-gray-100 dark:bg-gray-950 whitespace-pre-wrap break-all">
{result.error
  ? formatError(result.error)
  : JSON.stringify(result.result, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  )
}
