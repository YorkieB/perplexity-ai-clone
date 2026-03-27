'use client'

import { type ReactNode, useEffect } from 'react'

/**
 * Shell for the Jarvis Reasoning Dashboard (Vite SPA; mirrors Next-style `app/dashboard/layout`).
 */
export function DashboardLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = 'Jarvis Reasoning Dashboard'
  }, [])

  return (
    <div className="min-h-svh bg-gray-950 text-gray-100 antialiased">{children}</div>
  )
}

export default DashboardLayout
