import { MagnifyingGlass, CheckCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface DeepResearchIndicatorProps {
  isActive: boolean
  isComplete?: boolean
  searchCount?: number
}

export function DeepResearchIndicator({
  isActive,
  isComplete = false,
  searchCount = 0,
}: DeepResearchIndicatorProps) {
  if (!isActive) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/20 rounded-lg">
      {isComplete ? (
        <>
          <CheckCircle size={16} weight="fill" className="text-accent" />
          <span className="text-xs font-medium text-accent">
            Deep Research Complete
          </span>
          {searchCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({searchCount} searches)
            </span>
          )}
        </>
      ) : (
        <>
          <MagnifyingGlass
            size={16}
            className={cn('text-accent', 'animate-pulse')}
          />
          <span className="text-xs font-medium text-accent">
            Deep Research in progress...
          </span>
          {searchCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({searchCount} searches so far)
            </span>
          )}
        </>
      )}
    </div>
  )
}
