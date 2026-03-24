import { Brain, CaretDown } from '@phosphor-icons/react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type ThinkingPhase = 'thinking' | 'answering' | 'done'

interface ThinkingProcessPanelProps {
  readonly thinking: string
  readonly phase: ThinkingPhase
  /** When true, show a pulsing cursor at end of trace (streaming thinking). */
  readonly showThinkingCursor?: boolean
}

function phaseLabel(phase: ThinkingPhase): string {
  if (phase === 'thinking') return 'Thinking…'
  if (phase === 'answering') return 'Drafting answer…'
  return 'Reasoning trace'
}

function oneLineSummary(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= 96) return t
  return `${t.slice(0, 96)}…`
}

/**
 * Collapsible model reasoning / chain-of-thought, separate from the main answer (SSE or `think` tags).
 */
export function ThinkingProcessPanel({ thinking, phase, showThinkingCursor }: ThinkingProcessPanelProps) {
  const summary = oneLineSummary(thinking)

  return (
    <Collapsible className="mb-3" defaultOpen={false}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors',
          'hover:bg-muted/50 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'data-[state=open]:[&_.caret-icon]:rotate-180'
        )}
      >
        <Brain size={16} weight="duotone" className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-foreground/90">{phaseLabel(phase)}</span>
          {summary ? (
            <span className="mt-0.5 block font-normal text-[11px] leading-snug text-muted-foreground line-clamp-2">
              {summary}
            </span>
          ) : null}
        </span>
        <CaretDown size={14} weight="bold" className="caret-icon shrink-0 transition-transform duration-200" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <section
          className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border/50 bg-muted/40 p-3 font-mono text-[13px] leading-relaxed text-muted-foreground"
          aria-label="Model reasoning trace"
        >
          <span className="whitespace-pre-wrap">{thinking}</span>
          {showThinkingCursor ? (
            <span
              className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-accent align-[-0.15em]"
              aria-hidden
            />
          ) : null}
        </section>
      </CollapsibleContent>
    </Collapsible>
  )
}
