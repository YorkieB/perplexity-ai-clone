'use client'

import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 30_000

export interface LessonsDashboardRecent {
  content: string
  taskType: string
  appliedCount: number
  successRate: number
  source: string
}

export interface LessonsDashboardPayload {
  total: number
  avgSuccessRate: number
  recent: LessonsDashboardRecent[]
}

function isLessonsPayload(value: unknown): value is LessonsDashboardPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const o = value as Record<string, unknown>
  if (typeof o.total !== 'number' || typeof o.avgSuccessRate !== 'number' || !Array.isArray(o.recent)) {
    return false
  }
  return true
}

/**
 * Polls `/api/dashboard/lessons` for persisted lesson stats (initial fetch + every 30s).
 */
export default function useLessonsData(): {
  totalLessons: number
  avgSuccessRate: number
  recentLessons: LessonsDashboardRecent[]
} {
  const [totalLessons, setTotalLessons] = useState(0)
  const [avgSuccessRate, setAvgSuccessRate] = useState(0)
  const [recentLessons, setRecentLessons] = useState<LessonsDashboardRecent[]>([])

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch('/api/dashboard/lessons')
      const body: unknown = await r.json()
      if (!isLessonsPayload(body)) {
        return
      }
      setTotalLessons(body.total)
      setAvgSuccessRate(body.avgSuccessRate)
      setRecentLessons(body.recent)
    } catch {
      /* optional endpoint — ignore */
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      void load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  return { totalLessons, avgSuccessRate, recentLessons }
}
