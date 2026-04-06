import { useState, type ReactNode } from 'react'
import { Message as MessageType, UploadedFile } from '@/lib/types'
import { Question, Sparkle, User } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { SourceCard } from './SourceCard'
import { MarkdownRenderer } from './MarkdownRenderer'
import { FileAttachment } from './FileAttachment'
import { FilePreviewModal } from './FilePreviewModal'
import { FollowUpQuestions } from './FollowUpQuestions'
import { ModelCouncilResponse } from './ModelCouncilResponse'
import { QuickAnswer } from './QuickAnswer'
import { ImageGallery } from './ImageGallery'
import { VideoRow } from './VideoCard'
import { A2EMediaResult } from './A2EMediaResult'
import { MessageActionToolbar } from './MessageActionToolbar'
import { ThinkingProcessPanel, type ThinkingPhase } from '@/components/ThinkingProcessPanel'

interface MessageProps {
  message: MessageType
  onFollowUpClick?: (question: string) => void
  onRegenerateAssistant?: (assistantMessageId: string) => void
  isGenerating?: boolean
}

export function Message({
  message,
  onFollowUpClick,
  onRegenerateAssistant,
  isGenerating = false,
}: MessageProps) {
  const isUser = message.role === 'user'
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null)
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleFilePreview = (file: UploadedFile) => {
    setPreviewFile(file)
    setPreviewOpen(true)
  }

  const hasAnswerPreview = message.content.trim().length > 0
  let thinkingPhase: ThinkingPhase = 'done'
  if (message.isStreaming) {
    thinkingPhase = hasAnswerPreview ? 'answering' : 'thinking'
  }

  let mainContent: ReactNode
  if (isUser) {
    mainContent = (
      <p className="text-foreground leading-relaxed whitespace-pre-wrap m-0">
        {message.content}
      </p>
    )
  } else if (message.metadata?.type === 'clarification_required') {
    mainContent = (
      <div
        className="rounded-lg border border-amber-500/45 bg-amber-500/[0.07] px-4 py-3 shadow-sm"
        role="note"
        aria-label="Clarification requested"
      >
        <div className="flex gap-3">
          <Question
            size={22}
            className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
            weight="bold"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700/90 dark:text-amber-400/90 mb-2">
              More detail needed
            </p>
            <MarkdownRenderer
              content={message.content}
              onCitationHover={setHighlightedSource}
            />
          </div>
        </div>
      </div>
    )
  } else if (message.isModelCouncil && message.modelResponses) {
    mainContent = (
      <ModelCouncilResponse
        modelResponses={message.modelResponses}
        convergenceScore={message.modelResponses[0]?.convergenceScore}
        commonThemes={[]}
        divergentPoints={[]}
        onCitationHover={setHighlightedSource}
      />
    )
  } else {
    mainContent = (
      <>
        {!isUser && message.reasoning && (
          <ThinkingProcessPanel
            thinking={message.reasoning}
            phase={thinkingPhase}
            showThinkingCursor={Boolean(message.isStreaming && thinkingPhase === 'thinking')}
          />
        )}
        <MarkdownRenderer
          content={message.content}
          onCitationHover={setHighlightedSource}
        />
        {message.isStreaming && (
          <span
            className="inline-block w-1.5 h-4 ml-0.5 align-baseline bg-accent animate-pulse rounded-sm"
            aria-hidden
          />
        )}
      </>
    )
  }

  const deepResearchMeta = !isUser && message.isDeepResearch ? message.deepResearchMeta : undefined
  const renderDeepResearchStatus = () => {
    if (!deepResearchMeta) return null

    const stage = deepResearchMeta.stage
    const planningState = stage === 'planning' ? 'in_progress' : 'done'
    const searchingState =
      stage === 'planning' ? 'pending' : stage === 'searching' ? 'in_progress' : stage === 'failed' ? 'failed' : 'done'
    const synthesizingState =
      stage === 'planning' || stage === 'searching'
        ? 'pending'
        : stage === 'synthesizing'
        ? 'in_progress'
        : stage === 'failed'
        ? 'failed'
        : 'done'

    const stepGlyph = (status: 'pending' | 'in_progress' | 'done' | 'failed') => {
      if (status === 'done') return '✓'
      if (status === 'in_progress') return '●'
      if (status === 'failed') return '!'
      return '○'
    }

    return (
      <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs space-y-1">
        <p className="font-medium text-accent">Deep Research</p>
        <ul className="space-y-0.5 text-muted-foreground">
          <li>{stepGlyph(planningState)} Planning</li>
          <li>
            {stepGlyph(searchingState)} Searching ({deepResearchMeta.completedSubQueries}/{deepResearchMeta.totalSubQueries})
          </li>
          <li>{stepGlyph(synthesizingState)} Synthesizing</li>
        </ul>
        {deepResearchMeta.failedSubQueries && deepResearchMeta.failedSubQueries.length > 0 && (
          <p className="text-amber-600 dark:text-amber-400">
            {deepResearchMeta.failedSubQueries.length} sub-search
            {deepResearchMeta.failedSubQueries.length > 1 ? 'es' : ''} failed and were skipped.
          </p>
        )}
      </div>
    )
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

      <div className={cn('flex-1 space-y-4', isUser && 'flex flex-col items-end')} style={{ minWidth: 0, overflow: 'hidden' }}>
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

        {!isUser && message.tavilyAnswer && (
          <QuickAnswer answer={message.tavilyAnswer} isGenerating={isGenerating} />
        )}

        {!isUser && message.a2eTask && <A2EMediaResult task={message.a2eTask} />}

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sources
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {message.sources.map((source, index) => (
                <SourceCard
                  key={index}
                  source={source}
                  index={index + 1}
                  isHighlighted={highlightedSource === index + 1}
                />
              ))}
            </div>
          </div>
        )}

        {!isUser && message.images && message.images.length > 0 && (
          <ImageGallery images={message.images} />
        )}

        {!isUser && message.videos && message.videos.length > 0 && (
          <VideoRow videos={message.videos} />
        )}

        <div
          className={cn(
            'max-w-none',
            isUser && 'bg-primary/10 px-4 py-3 rounded-lg max-w-2xl'
          )}
          style={{ overflowWrap: 'break-word', wordBreak: 'break-word', overflow: 'hidden' }}
        >
          <div className={!isUser && message.isDeepResearch ? 'mb-3' : undefined}>
            {renderDeepResearchStatus()}
          </div>
          {mainContent}
        </div>

        {!isUser &&
          !message.isModelCouncil &&
          message.content &&
          !message.isStreaming && (
            <MessageActionToolbar
              markdownContent={message.content}
              disabled={Boolean(isGenerating)}
              onRegenerate={
                onRegenerateAssistant ? () => onRegenerateAssistant(message.id) : undefined
              }
            />
          )}

        {!isUser && message.followUpQuestions && message.followUpQuestions.length > 0 && onFollowUpClick && (
          <FollowUpQuestions
            questions={message.followUpQuestions}
            onQuestionClick={onFollowUpClick}
            isLoading={isGenerating}
          />
        )}
      </div>

      <FilePreviewModal file={previewFile} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  )
}
