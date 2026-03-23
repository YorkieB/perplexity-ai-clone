import { useMemo, useState } from 'react'
import { Message as MessageType, UploadedFile } from '@/lib/types'
import { Sparkle, User } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { getRegistrableDomain } from '@/lib/search-utils'
import { SourceCard } from './SourceCard'
import { MarkdownRenderer } from './MarkdownRenderer'
import { FileAttachment } from './FileAttachment'
import { FilePreviewModal } from './FilePreviewModal'
import { FollowUpQuestions } from './FollowUpQuestions'
import { ModelCouncilResponse } from './ModelCouncilResponse'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'

interface MessageProps {
  message: MessageType
  onFollowUpClick?: (question: string) => void
  isGenerating?: boolean
}

export function Message({ message, onFollowUpClick, isGenerating = false }: MessageProps) {
  const isUser = message.role === 'user'
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null)
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const groupedSources = useMemo(() => {
    if (!message.sources || message.sources.length === 0) {
      return []
    }

    const groups = new Map<string, Array<{ source: NonNullable<MessageType['sources']>[number], index: number }>>()
    for (const [index, source] of message.sources.entries()) {
      const domain = source.domain || getRegistrableDomain(source.url)
      const existing = groups.get(domain) || []
      existing.push({ source, index: index + 1 })
      groups.set(domain, existing)
    }

    return Array.from(groups.entries()).map(([domain, items]) => ({ domain, items }))
  }, [message.sources])

  const singleSourceGroups = groupedSources.filter((group) => group.items.length === 1)
  const groupedDomainClusters = groupedSources.filter((group) => group.items.length > 1)

  const handleFilePreview = (file: UploadedFile) => {
    setPreviewFile(file)
    setPreviewOpen(true)
  }

  return (
    <div
      className={cn(
        'flex gap-4 py-6',
        isUser && 'flex-row-reverse'
      )}
    >
      <div
        className={cn(
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary' : 'bg-accent/20'
        )}
      >
        {isUser ? (
          <User size={18} className="text-primary-foreground" weight="bold" />
        ) : (
          <Sparkle size={18} className="text-accent" weight="fill" />
        )}
      </div>

      <div className={cn('flex-1 space-y-4', isUser && 'flex flex-col items-end')}>
        {isUser && message.files && message.files.length > 0 && (
          <div className="space-y-2 max-w-2xl w-full">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Attached Files
            </p>
            <div className="flex flex-wrap gap-2">
              {message.files.map((file) => (
                <FileAttachment
                  key={file.id}
                  file={file}
                  showRemove={false}
                  onPreview={() => handleFilePreview(file)}
                />
              ))}
            </div>
          </div>
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sources
            </p>
            {singleSourceGroups.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {singleSourceGroups.map((group) => {
                  const { source, index } = group.items[0]
                  return (
                    <SourceCard
                      key={index}
                      source={source}
                      index={index}
                      isHighlighted={highlightedSource === index}
                    />
                  )
                })}
              </div>
            )}

            {groupedDomainClusters.length > 0 && (
              <Accordion
                type="multiple"
                className="rounded-lg border border-border/70 bg-card/30 px-3"
              >
                {groupedDomainClusters.map((group) => (
                  <AccordionItem key={group.domain} value={group.domain}>
                    <AccordionTrigger className="py-2 text-sm hover:no-underline">
                      {group.domain} ({group.items.length})
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                        {group.items.map(({ source, index }) => (
                          <SourceCard
                            key={`${group.domain}-${index}`}
                            source={source}
                            index={index}
                            isHighlighted={highlightedSource === index}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        )}

        {!isUser && message.searchTrace && (
          <Accordion
            type="single"
            collapsible
            className="rounded-lg border border-border/70 bg-muted/20 px-3"
          >
            <AccordionItem value="search-steps">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                Search steps
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <dl className="space-y-2 text-sm">
                  <div className="space-y-1">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Query sent</dt>
                    <dd className="font-mono text-xs bg-background/60 border border-border/60 rounded px-2 py-1 break-all">
                      {message.searchTrace.query}
                    </dd>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Focus mode</dt>
                      <dd>{message.searchTrace.focusModeLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Advanced search</dt>
                      <dd>{message.searchTrace.isAdvancedMode ? 'On' : 'Off'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Results</dt>
                      <dd>{message.searchTrace.resultCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Timestamp</dt>
                      <dd>{new Date(message.searchTrace.executedAt).toLocaleTimeString()}</dd>
                    </div>
                  </div>
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div
          className={cn(
            'max-w-none',
            isUser && 'bg-primary/10 px-4 py-3 rounded-lg max-w-2xl'
          )}
        >
          {isUser ? (
            <p className="text-foreground leading-relaxed whitespace-pre-wrap m-0">
              {message.content}
            </p>
          ) : message.isModelCouncil && message.modelResponses ? (
            <ModelCouncilResponse
              modelResponses={message.modelResponses}
              convergenceScore={
                message.modelResponses[0]?.convergenceScore
              }
              commonThemes={[]}
              divergentPoints={[]}
              onCitationHover={setHighlightedSource}
            />
          ) : (
            <MarkdownRenderer
              content={message.content}
              onCitationHover={setHighlightedSource}
            />
          )}
        </div>

        {!isUser && message.followUpQuestions !== undefined && onFollowUpClick && (
          <FollowUpQuestions
            questions={message.followUpQuestions}
            onQuestionClick={onFollowUpClick}
            isLoading={isGenerating}
            showEmptyState
          />
        )}
      </div>

      <FilePreviewModal file={previewFile} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  )
}
