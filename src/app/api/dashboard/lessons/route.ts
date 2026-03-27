import { lessonsAdapter } from '@/lib/persistence/lessonsPersistenceAdapter'

export const dynamic = 'force-dynamic'

/**
 * JSON summary of persisted cross-session lessons for the reasoning dashboard.
 */
export async function GET(): Promise<Response> {
  const lessons = await lessonsAdapter.getAll()
  const avgSuccessRate =
    lessons.length > 0
      ? lessons.reduce((s, l) => s + l.successRate, 0) / lessons.length
      : 0

  return Response.json({
    total: lessons.length,
    avgSuccessRate,
    recent: [...lessons]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((l) => ({
        content: l.content,
        taskType: l.taskType,
        appliedCount: l.appliedCount,
        successRate: l.successRate,
        source: l.source,
      })),
  })
}
