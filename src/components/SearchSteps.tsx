import { CaretDown } from '@phosphor-icons/react'
import type { SearchTrace } from '@/lib/types'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface SearchStepsProps {
  trace: SearchTrace
}

const FOCUS_MODE_LABELS: Record<SearchTrace['focusMode'], string> = {
  all: 'All',
  academic: 'Academic',
  reddit: 'Reddit',
  youtube: 'YouTube',
  news: 'News',
  code: 'Code',
  finance: 'Finance',
  chat: 'Chat only',
}

export function SearchSteps({ trace }: SearchStepsProps) {
  return (
    <Collapsible className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left data-[state=open]:[&_.search-caret]:rotate-180">
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            How we searched
          </p>
          <p className="text-sm text-foreground">
            Query sent: <span className="font-medium">{trace.query}</span>
          </p>
        </div>
        <CaretDown
          size={16}
          className={cn(
            'search-caret shrink-0 text-muted-foreground transition-transform'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>
            Focus mode: <span className="text-foreground">{FOCUS_MODE_LABELS[trace.focusMode]}</span>
          </li>
          <li>
            Advanced mode: <span className="text-foreground">{trace.advanced ? 'On' : 'Off'}</span>
          </li>
          <li>
            Results returned: <span className="text-foreground">{trace.resultCount}</span>
          </li>
          <li>
            Timestamp:{' '}
            <span className="text-foreground">
              {new Date(trace.executedAt).toLocaleString()}
            </span>
          </li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
