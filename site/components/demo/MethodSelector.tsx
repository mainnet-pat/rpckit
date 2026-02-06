'use client'

import { useState, useCallback, useEffect } from 'react'
import type { RpcMethod } from './types.js'

interface MethodSelectorProps {
  methods: RpcMethod[]
  onExecute: (method: string, params: unknown[]) => Promise<void>
  disabled?: boolean
  loading?: boolean
}

export function MethodSelector({
  methods,
  onExecute,
  disabled,
  loading,
}: MethodSelectorProps) {
  const [selectedMethod, setSelectedMethod] = useState<RpcMethod>(methods[0])
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  // Reset when methods list changes (protocol switch)
  useEffect(() => {
    setSelectedMethod(methods[0])
    const defaults: Record<string, string> = {}
    for (const param of methods[0].params) {
      defaults[param.name] = param.defaultValue ?? ''
    }
    setParamValues(defaults)
    setError(null)
  }, [methods])

  const handleMethodChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const method = methods.find((m) => m.name === e.target.value)
      if (method) {
        setSelectedMethod(method)
        setError(null)
        // Reset param values and set defaults
        const defaults: Record<string, string> = {}
        for (const param of method.params) {
          defaults[param.name] = param.defaultValue ?? ''
        }
        setParamValues(defaults)
      }
    },
    [methods]
  )

  const handleParamChange = useCallback((name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }, [])

  const handleExecute = useCallback(async () => {
    setError(null)
    try {
      const params: unknown[] = await Promise.all(
        selectedMethod.params.map(async (param) => {
          const value = paramValues[param.name] ?? param.defaultValue ?? ''

          if (
            param.name === 'address'
          ) {
            if (!value) {
              throw new Error('Address is required')
            }
            return value
          }

          // Try to parse as JSON for boolean/number values
          if (value === 'true') return true
          if (value === 'false') return false
          if (value !== '' && !isNaN(Number(value))) return Number(value)
          return value
        })
      )
      await onExecute(selectedMethod.name, params)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute')
    }
  }, [selectedMethod, paramValues, onExecute])

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          RPC Method
        </label>
        <select
          value={selectedMethod.name}
          onChange={handleMethodChange}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        >
          {methods.map((method) => (
            <option key={method.name} value={method.name}>
              {method.label}
            </option>
          ))}
        </select>
      </div>

      {selectedMethod.params.length > 0 && (
        <div className="space-y-3">
          {selectedMethod.params.map((param) => (
            <div key={param.name}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {param.label}
              </label>
              <input
                type="text"
                value={paramValues[param.name] ?? param.defaultValue ?? ''}
                onChange={(e) => handleParamChange(param.name, e.target.value)}
                placeholder={param.placeholder}
                disabled={disabled}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={handleExecute}
        disabled={disabled || loading}
        className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Executing...
          </>
        ) : (
          'Execute'
        )}
      </button>
    </div>
  )
}
