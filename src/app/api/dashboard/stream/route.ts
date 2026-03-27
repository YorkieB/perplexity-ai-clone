import { type NextRequest } from 'next/server'

import { telemetry } from '@/lib/observability/telemetryCollector'

export const dynamic = 'force-dynamic'

/**
 * Server-Sent Events stream of live telemetry (`event: telemetry`) for the dashboard.
 * Query: `sessionId` — omit or `all` for every session; otherwise filter to one session.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder()
  const sessionId = request.nextUrl.searchParams.get('sessionId') ?? 'all'

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ status: 'connected', sessionId })}\n\n`,
        ),
      )

      let subscriberId = ''
      subscriberId = telemetry.subscribe((event) => {
        if (sessionId !== 'all' && event.sessionId !== sessionId) {
          return
        }
        const payload = JSON.stringify({
          type: event.type,
          sessionId: event.sessionId,
          data: event.data,
          timestamp: event.timestamp,
        })
        try {
          controller.enqueue(encoder.encode(`event: telemetry\ndata: ${payload}\n\n`))
        } catch {
          telemetry.unsubscribe(subscriberId)
        }
      })

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`,
            ),
          )
        } catch {
          clearInterval(heartbeat)
          telemetry.unsubscribe(subscriberId)
        }
      }, 15_000)

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        telemetry.unsubscribe(subscriberId)
        try {
          controller.close()
        } catch {
          /* client disconnected — stream may already be closed */
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
