import { useState } from 'react'
import { Message as MessageType, UploadedFile } from '@/lib/types'
import { altTextForGeneratedImage, displaySrcForGeneratedImage } from '@/lib/image'
import { Microphone, Sparkle, User, ImageSquare } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { SourceCard } from './SourceCard'
import { MarkdownRenderer } from './MarkdownRenderer'
import { FileAttachment } from './FileAttachment'
import { FilePreviewModal } from './FilePreviewModal'
import { FollowUpQuestions } from './FollowUpQuestions'
import { ModelCouncilResponse } from './ModelCouncilResponse'

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
        {(message.modality === 'voice' || message.source === 'voice') && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground',
              isUser ? 'self-end' : 'self-start'
            )}
          >
            <Microphone className="h-3.5 w-3.5 shrink-0" weight="fill" aria-hidden />
            <span>Voice</span>
            {message.voiceTurn?.interrupted ? (
              <span className="text-destructive font-medium">(interrupted)</span>
            ) : null}
          </span>
        )}
        {message.modality === 'image' && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground',
              isUser ? 'self-end' : 'self-start'
            )}
          >
            <ImageSquare className="h-3.5 w-3.5 shrink-0" weight="regular" aria-hidden />
            <span>Image prompt</span>
          </span>
        )}
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

        {!isUser && message.generatedImages && message.generatedImages.length > 0 && (
          <div className="space-y-3 max-w-full w-full">
            {message.generatedImages.map((img) => {
              const src = displaySrcForGeneratedImage(img)
              if (!src) return null
              return (
                <figure key={img.id} className="m-0 max-w-full sm:max-w-[min(100%,42rem)]">
                  <img
                    src={src}
                    alt={altTextForGeneratedImage(img.promptSnapshot)}
                    loading="lazy"
                    decoding="async"
                    className="rounded-lg border border-border w-full h-auto object-contain max-h-[70vh]"
                  />
                </figure>
              )
            })}
          </div>
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
          ) : message.content.trim().length > 0 ? (
            <MarkdownRenderer
              content={message.content}
              onCitationHover={setHighlightedSource}
            />
          ) : null}
        </div>

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
