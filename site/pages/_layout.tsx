'use client'

import { SidebarFooter } from '../components/SidebarFooter.js'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SidebarFooter />
    </>
  )
}
