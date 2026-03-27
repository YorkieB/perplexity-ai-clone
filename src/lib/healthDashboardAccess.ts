/**
 * Client-side gate for `/health` — mirrors production rollback policy (admin key required outside dev).
 */

/** SessionStorage key: set before redirect so the shell can toast 403 after returning to `/`. */
export const HEALTH_DASHBOARD_403_FLAG = 'jarvis-health-dashboard-403'

/**
 * Development: always allowed. Production: `VITE_JARVIS_ADMIN_KEY` must be set (same value as server `JARVIS_ADMIN_KEY`).
 */
export function canAccessHealthDashboard(): boolean {
  return import.meta.env.DEV || Boolean(import.meta.env.VITE_JARVIS_ADMIN_KEY?.trim())
}
