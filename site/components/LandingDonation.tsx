'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DonationModal } from './DonationModal.js'
import { FooterContent } from './SidebarFooter.js'

export function LandingDonation() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  const openModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  useEffect(() => {
    const tryAttach = () => {
      if (container) return
      const existing = document.querySelector('[data-landing-donation]') as HTMLElement | null
      if (existing) {
        setContainer(existing)
        return
      }
      const nav = document.querySelector(
        'nav.vocs\\:flex.vocs\\:max-lg\\:hidden.vocs\\:px-2'
      )
      if (!nav) return
      const el = document.createElement('div')
      el.setAttribute('data-landing-donation', 'true')
      el.className = 'vocs:max-lg:hidden'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      nav.insertAdjacentElement('beforebegin', el)
      setContainer(el)
    }

    tryAttach()
    const interval = setInterval(tryAttach, 500)
    return () => clearInterval(interval)
  }, [container])

  return (
    <>
      {container &&
        createPortal(
          <FooterContent onDonateClick={openModal} compact />,
          container
        )}
      <DonationModal isOpen={isModalOpen} onClose={closeModal} />
    </>
  )
}
