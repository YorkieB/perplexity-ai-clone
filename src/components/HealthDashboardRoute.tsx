/**
 * `/health` entry: lazy-loaded {@link HealthDashboard} with access control from {@link canAccessHealthDashboard}.
 */

import { lazy, Suspense, type ReactElement } from 'react'

import { canAccessHealthDashboard, HEALTH_DASHBOARD_403_FLAG } from '@/lib/healthDashboardAccess'

const HealthDashboard = lazy(() => import('@/components/HealthDashboard'))

/**
 * Renders the observability dashboard or redirects to `/` when access is denied.
 */
export function HealthDashboardPage(): ReactElement {
  if (!canAccessHealthDashboard()) {
    try {
      globalThis.sessionStorage?.setItem(HEALTH_DASHBOARD_403_FLAG, '1')
    } catch {
      /* storage unavailable */
    }
    globalThis.location.replace('/')
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Redirecting…
      </div>
    )
  }
  return (
    <div className="min-h-screen overflow-auto bg-zinc-950">
      <Suspense fallback={<div>Loading dashboard...</div>}>
        <HealthDashboard />
      </Suspense>
    </div>
  )
}
