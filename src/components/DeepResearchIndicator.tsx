import { CheckCircle, CircleNotch } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface DeepResearchIndicatorProps {
  stage: 'planning' | 'searching' | 'synthesizing' | 'complete'
  currentSearch?: number
  totalSearches?: number
  currentQuery?: string
}

export function DeepResearchIndicator({
  stage,
  currentSearch = 0,
  totalSearches = 0,
  currentQuery,
}: DeepResearchIndicatorProps) {
  const steps = [
    {
      id: 'planning',
      label: 'Planning',
      detail: 'Generating sub-queries',
    },
    {
      id: 'searching',
      label: `Searching${totalSearches > 0 ? ` (${Math.max(currentSearch, 0)}/${totalSearches})` : ''}`,
      detail: currentQuery || 'Collecting sources',
    },
    {
      id: 'synthesizing',
      label: 'Synthesizing',
      detail: 'Writing final answer',
    },
  ] as const

  const getStepState = (stepId: (typeof steps)[number]['id']): 'pending' | 'active' | 'complete' => {
    if (stage === 'complete') {
      return 'complete'
    }

    const order = ['planning', 'searching', 'synthesizing'] as const
    const currentIndex = order.indexOf(stage)
    const stepIndex = order.indexOf(stepId)

    if (stepIndex < currentIndex) return 'complete'
    if (stepIndex === currentIndex) return 'active'
    return 'pending'
  }

  return (
    <div className="space-y-3 px-4 py-3 bg-accent/10 border border-accent/20 rounded-lg">
      <div className="flex items-center gap-2">
        <CheckCircle size={16} weight="fill" className={cn(stage === 'complete' ? 'text-accent' : 'text-muted-foreground')} />
        <p className="text-sm font-medium text-foreground">
          Deep Research {stage === 'complete' ? 'complete' : 'in progress'}
        </p>
      </div>

      <ul className="space-y-2">
        {steps.map((step) => {
          const stepState = getStepState(step.id)
          return (
            <li key={step.id} className="flex items-start gap-2">
              {stepState === 'complete' ? (
                <CheckCircle size={14} weight="fill" className="mt-0.5 text-accent" />
              ) : stepState === 'active' ? (
                <CircleNotch size={14} className="mt-0.5 text-accent animate-spin" />
              ) : (
                <span className="mt-1.5 block w-2 h-2 rounded-full bg-muted-foreground/40" />
              )}

              <div className="min-w-0">
                <p
                  className={cn(
                    'text-xs font-medium',
                    stepState === 'active' && 'text-accent',
                    stepState === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">{step.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
