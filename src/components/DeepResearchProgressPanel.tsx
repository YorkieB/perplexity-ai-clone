import { DeepResearchMeta } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DeepResearchProgressPanelProps {
  readonly meta: DeepResearchMeta
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  error: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
}

export function DeepResearchProgressPanel({ meta }: DeepResearchProgressPanelProps) {
  return (
    <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Deep research progress
      </p>
      <ol className="space-y-2">
        {meta.progress.map((step, index) => (
          <li key={step.key} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                STATUS_STYLE[step.status] ?? STATUS_STYLE.pending,
              )}
            >
              {index + 1}
            </span>
            <div>
              <p className="font-medium">
                {step.label}
                <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">{step.status}</span>
              </p>
              {step.detail ? <p className="text-xs text-muted-foreground">{step.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      {meta.failedSearches.length > 0 ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          Failed sub-searches: {meta.failedSearches.length}
        </p>
      ) : null}
    </div>
  )
}
