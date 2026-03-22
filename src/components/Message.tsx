import { Message as MessageType } from '@/lib/types'
import { Sparkle, User } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { SourceCard } from './SourceCard'

interface MessageProps {
  message: MessageType
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user'

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
        <div
          className={cn(
            'prose prose-invert max-w-none',
            isUser && 'bg-primary/10 px-4 py-3 rounded-lg max-w-2xl'
          )}
        >
          <p className="text-foreground leading-relaxed whitespace-pre-wrap m-0">
            {message.content}
          </p>
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sources
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {message.sources.map((source, index) => (
                <SourceCard key={index} source={source} index={index + 1} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
