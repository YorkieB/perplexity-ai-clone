import { type NextRequest } from 'next/server'

import { telemetry } from '@/lib/observability/telemetryCollector'

const MAX_SNAPSHOT_SESSIONS = 500

/**
 * JSON snapshot: {@link telemetry.getSystemStats} plus the most recently active session summaries.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const raw = request.nextUrl.searchParams.get('limit') ?? '10'
  const parsed = Number.parseInt(raw, 10)
  const limit =
    Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_SNAPSHOT_SESSIONS) : 10

  const stats = telemetry.getSystemStats()
  const summaries = telemetry.getAllSessionSummaries().slice(0, limit)

  return Response.json({
    stats,
    summaries,
    timestamp: new Date().toISOString(),
  })
}
