import { getModelBadges, type ModelBadge } from '@/lib/model-badges'
import { cn } from '@/lib/utils'

const BADGE_STYLES: Record<ModelBadge['kind'], string> = {
  premium:
    'border-border bg-muted/80 text-muted-foreground',
  budget:
    'border-border bg-muted/60 text-muted-foreground',
  vision:
    'border-border bg-muted/70 text-muted-foreground',
  voice:
    'border-border bg-muted/70 text-muted-foreground',
  creative:
    'border-border bg-muted/70 text-muted-foreground',
}

export function ModelBadges({ modelId, className }: { modelId: string; className?: string }) {
  const badges = getModelBadges(modelId)
  if (badges.length === 0) return null

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {badges.map((b) => (
        <span
          key={b.kind}
          className={cn(
            'rounded border px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide',
            BADGE_STYLES[b.kind]
          )}
        >
          {b.label}
        </span>
      ))}
    </span>
  )
}
