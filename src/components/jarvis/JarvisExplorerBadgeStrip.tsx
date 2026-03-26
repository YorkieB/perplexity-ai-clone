import { getJarvisExplorerBadgeDef, type JarvisExplorerBadgeId } from '@/lib/jarvis-explorer-badges'

export interface JarvisExplorerBadgeStripProps {
  readonly ids: readonly JarvisExplorerBadgeId[]
  readonly tc: string
  /** When set, show numeric suffix for diagnostics (e.g. error count). */
  readonly diagCounts?: Partial<Record<'errors' | 'warnings' | 'infos' | 'hints', number>>
  readonly coveragePct?: number | null
  readonly className?: string
}

export function JarvisExplorerBadgeStrip({ ids, tc, diagCounts, coveragePct, className }: JarvisExplorerBadgeStripProps) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return null
  return (
    <span className={`inline-flex flex-wrap items-center justify-end gap-0.5 max-w-[min(180px,45%)] ${className ?? ''}`}>
      {unique.map((id) => {
        const def = getJarvisExplorerBadgeDef(id)
        if (!def) return null
        let extra = ''
        if (diagCounts && id === 'diag-error-count' && diagCounts.errors) extra = String(diagCounts.errors)
        else if (diagCounts && id === 'diag-warning-count' && diagCounts.warnings) extra = String(diagCounts.warnings)
        else if (diagCounts && id === 'diag-info-count' && diagCounts.infos) extra = String(diagCounts.infos)
        else if (diagCounts && id === 'diag-hint-count' && diagCounts.hints) extra = String(diagCounts.hints)
        else if (id === 'coverage-percent' && coveragePct != null && !Number.isNaN(coveragePct)) {
          extra = `${Math.round(coveragePct)}%`
        }
        const label = extra ? `${def.label} (${extra})` : def.label
        return (
          <span
            key={id}
            title={label}
            className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-[2px] text-[8px] font-semibold leading-none select-none"
            style={{
              background: `${tc}18`,
              color: `${tc}cc`,
              border: `1px solid ${tc}22`,
            }}
          >
            {def.glyph}
            {extra ? <span className="ml-[1px] opacity-90">{extra}</span> : null}
          </span>
        )
      })}
    </span>
  )
}
