'use client'

import { useState, useCallback, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface CryptoAddress {
  name: string
  symbol: string
  address: string
  uriScheme: string
  color: string
}

const ADDRESSES: CryptoAddress[] = [
  {
    name: 'Bitcoin Cash',
    symbol: 'BCH',
    address: 'bitcoincash:qrcjhgw2v0u8e6nf668qwky2rpq79szr2uxtpu60z8',
    uriScheme: 'bitcoincash',
    color: '#8DC351',
  },
  {
    name: 'Bitcoin',
    symbol: 'BTC',
    address: 'bc1qmwmhfr6atyz4r5vzsycs34fd4sxrxwrlmevfp6',
    uriScheme: 'bitcoin',
    color: '#F7931A',
  },
  {
    name: 'Ethereum and other EVMs',
    symbol: 'ETH',
    address: '0xf2E0DEbda73A7E6901D18d4C3aBCa7419a137940',
    uriScheme: 'ethereum',
    color: '#627EEA',
  },
]

interface DonationModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DonationModal({ isOpen, onClose }: DonationModalProps) {
  const [selectedAddress, setSelectedAddress] = useState<CryptoAddress | null>(
    null
  )

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedAddress) {
          setSelectedAddress(null)
        } else {
          onClose()
        }
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, selectedAddress, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        if (selectedAddress) {
          setSelectedAddress(null)
        } else {
          onClose()
        }
      }
    },
    [selectedAddress, onClose]
  )

  const handleAddressClick = useCallback((crypto: CryptoAddress) => {
    setSelectedAddress(crypto)
  }, [])

  const handleQRClick = useCallback(() => {
    if (selectedAddress) {
      const uri = `${selectedAddress.uriScheme}:${selectedAddress.address}`
      window.location.href = uri
    }
  }, [selectedAddress])

  const handleBack = useCallback(() => {
    setSelectedAddress(null)
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {selectedAddress && (
              <button
                type="button"
                onClick={handleBack}
                className="p-1 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {selectedAddress ? selectedAddress.name : 'Support rpckit'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-500"
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

        {/* Content */}
        <div className="p-6">
          {selectedAddress ? (
            // QR Code View
            <div className="flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={handleQRClick}
                className="p-4 bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
                title={`Open ${selectedAddress.name} wallet`}
              >
                <QRCodeSVG
                  value={`${selectedAddress.uriScheme}:${selectedAddress.address}`}
                  size={200}
                  level="M"
                  marginSize={2}
                  fgColor="#000000"
                  bgColor="#FFFFFF"
                />
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Click QR code to open wallet
              </p>
              <div className="w-full">
                <div
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300 break-all cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedAddress.address)
                  }}
                  title="Click to copy"
                >
                  {selectedAddress.address}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">
                  Click address to copy
                </p>
              </div>
            </div>
          ) : (
            // Address List View
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Your donations help maintain and improve rpckit. Thank you for
                your support!
              </p>
              {ADDRESSES.map((crypto) => (
                <button
                  key={crypto.symbol}
                  type="button"
                  onClick={() => handleAddressClick(crypto)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: crypto.color }}
                  >
                    {crypto.symbol.slice(0, 3)}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {crypto.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[250px]">
                      {crypto.address}
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
