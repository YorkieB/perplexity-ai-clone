'use client'

import { Badge } from '@/components/ui/badge'

export interface LessonsPanelProps {
  totalLessons: number
  avgSuccessRate: number
  recentLessons: Array<{
    content: string
    taskType: string
    appliedCount: number
    successRate: number
    source: string
  }>
}

function sourceIcon(source: string): string {
  if (source === 'reflexion') return '🔄'
  if (source === 'uar') return '⚠'
  if (source === 'manual') return '✍'
  return '•'
}

function sourceLabel(source: string): string {
  if (source === 'reflexion') return 'reflexion'
  if (source === 'uar') return 'uar'
  if (source === 'manual') return 'manual'
  return source
}

/**
 * Cross-session persisted lessons summary for the Jarvis reasoning dashboard.
 */
export default function LessonsPanel({
  totalLessons,
  avgSuccessRate,
  recentLessons,
}: LessonsPanelProps) {
  const pct = Math.round(Math.min(100, Math.max(0, avgSuccessRate * 100)))

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-gray-700/50 bg-gray-900 p-4 text-gray-100 shadow-sm"
      aria-label="Cross-session memory"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-100">Cross-Session Memory</h2>
          <p className="text-sm text-gray-400">
            {totalLessons} lessons persisted across all sessions
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit shrink-0 border-blue-500/40 bg-blue-950/40 text-sm font-medium text-blue-200"
        >
          {pct}% avg improvement
        </Badge>
      </div>

      {recentLessons.length === 0 ? (
        <p className="border-t border-gray-700/50 pt-3 text-center text-sm text-gray-500">
          No persisted lessons yet — lessons appear after Reflexion and UAR cycles complete
        </p>
      ) : (
        <ul className="flex flex-col gap-3 border-t border-gray-700/50 pt-3">
          {recentLessons.map((l, i) => (
            <li
              key={`${l.taskType}-${String(i)}-${l.content.slice(0, 24)}`}
              className="flex gap-3 rounded-md border border-gray-700/40 bg-gray-950/50 p-3"
            >
              <span className="pt-0.5 text-base leading-none" title={sourceLabel(l.source)} aria-hidden>
                {sourceIcon(l.source)}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="line-clamp-2 text-sm leading-snug text-gray-200">{l.content}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="border-gray-600 bg-gray-800/80 text-xs font-normal capitalize text-gray-200"
                  >
                    {l.taskType}
                  </Badge>
                  <span className="text-xs tabular-nums text-gray-500">
                    Applied {l.appliedCount}× | {(l.successRate * 100).toFixed(0)}% improved
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
