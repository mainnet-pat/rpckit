'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DonationModal } from './DonationModal.js'

export function FooterContent({
  onDonateClick,
  compact = false,
}: {
  onDonateClick: () => void
  compact?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 ${
        compact ? 'pb-2' : 'py-2 border-t border-gray-200 dark:border-gray-700/50'
      }`}
    >
      <span>
        made with ❤️ by{' '}
        <a
          href="https://x.com/mainnet_pat"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
        >
          mainnet_pat
        </a>
      </span>
      <span className="text-gray-300 dark:text-gray-600">|</span>
      <button
        type="button"
        onClick={onDonateClick}
        className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-green-500 dark:hover:text-green-400 transition-colors"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        donate
      </button>
    </div>
  )
}

export function SidebarFooter() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [sidebarContainer, setSidebarContainer] = useState<HTMLElement | null>(null)
  const [mobileContainer, setMobileContainer] = useState<HTMLElement | null>(null)

  const openModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  useEffect(() => {
    const getOrCreateContainer = (
      siblingSelector: string,
      attrName: string
    ): HTMLElement | null => {
      // Check if already exists
      let container = document.querySelector(`[${attrName}]`) as HTMLElement | null
      if (container) return container

      const sibling = document.querySelector(siblingSelector)
      if (!sibling) return null

      container = document.createElement('div')
      container.setAttribute(attrName, 'true')
      container.className = 'vocs:bg-primary'

      // Insert before the sibling element (above the social links)
      sibling.insertAdjacentElement('beforebegin', container)
      return container
    }

    // Poll for both desktop sidebar and mobile nav containers
    const tryAttach = () => {
      if (!sidebarContainer) {
        const container = getOrCreateContainer(
          '[data-v-sidebar-footer-content]',
          'data-custom-footer'
        )
        if (container) setSidebarContainer(container)
      }
      if (!mobileContainer) {
        const container = getOrCreateContainer(
          '[data-v-mobile-nav-footer]',
          'data-custom-footer-mobile'
        )
        if (container) setMobileContainer(container)
      }
    }

    tryAttach()
    const interval = setInterval(tryAttach, 500)

    return () => clearInterval(interval)
  }, [sidebarContainer, mobileContainer])

  return (
    <>
      {sidebarContainer &&
        createPortal(<FooterContent onDonateClick={openModal} />, sidebarContainer)}
      {mobileContainer &&
        createPortal(<FooterContent onDonateClick={openModal} compact />, mobileContainer)}
      <DonationModal isOpen={isModalOpen} onClose={closeModal} />
    </>
  )
}
