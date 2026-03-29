import { useMemo, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import type { Source } from '@/lib/types'
import { SourceCard } from './SourceCard'
import { groupSourcesByRegistrableDomain } from '@/lib/source-utils'
import { cn } from '@/lib/utils'

interface GroupedSourcesProps {
  sources: Source[]
  highlightedSource: number | null
}

export function GroupedSources({ sources, highlightedSource }: GroupedSourcesProps) {
  const groups = useMemo(() => groupSourcesByRegistrableDomain(sources), [sources])
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (domain: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [domain]: !current[domain],
    }))
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isSingle = group.entries.length === 1
        const isExpanded = expandedGroups[group.domain] ?? false

        if (isSingle) {
          const onlyEntry = group.entries[0]
          return (
            <div
              key={`${group.domain}-${onlyEntry.citationIndex}`}
              className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
            >
              <SourceCard
                source={onlyEntry.source}
                index={onlyEntry.citationIndex}
                isHighlighted={highlightedSource === onlyEntry.citationIndex}
              />
            </div>
          )
        }

        return (
          <div key={group.domain} className="rounded-lg border border-border bg-muted/20">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left"
              onClick={() => toggleGroup(group.domain)}
            >
              <span className="text-sm font-medium text-foreground">
                {group.domain} ({group.entries.length})
              </span>
              <CaretDown
                size={16}
                className={cn(
                  'text-muted-foreground transition-transform',
                  isExpanded && 'rotate-180'
                )}
              />
            </button>
            {isExpanded && (
              <div className="flex gap-2 overflow-x-auto pb-3 px-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {group.entries.map((entry) => (
                  <SourceCard
                    key={`${group.domain}-${entry.citationIndex}`}
                    source={entry.source}
                    index={entry.citationIndex}
                    isHighlighted={highlightedSource === entry.citationIndex}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
