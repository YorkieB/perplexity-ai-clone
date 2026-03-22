import { Source } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Link as LinkIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface SourceCardProps {
  source: Source
  index: number
  isHighlighted?: boolean
}

export function SourceCard({ source, index, isHighlighted = false }: SourceCardProps) {
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace('www.', '')
    } catch {
      return url
    }
  }

  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`
    } catch {
      return null
    }
  }

  const domain = getDomain(source.url)
  const faviconUrl = getFaviconUrl(source.url)

  return (
    <Card
      className={cn(
        'p-3 transition-all group shrink-0 w-64 sm:w-72',
        isHighlighted
          ? 'border-accent bg-accent/5 ring-2 ring-accent shadow-lg scale-105'
          : 'hover:border-accent'
      )}
    >
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block space-y-2"
      >
        <div className="flex items-start gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {faviconUrl && (
              <img
                src={faviconUrl}
                alt=""
                className="w-4 h-4 shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div
                className={cn(
                  'flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold shrink-0',
                  isHighlighted
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-accent/20 text-accent'
                )}
              >
                {index}
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {domain}
              </span>
            </div>
          </div>
          <LinkIcon
            size={14}
            className={cn(
              'transition-colors shrink-0',
              isHighlighted
                ? 'text-accent'
                : 'text-muted-foreground group-hover:text-accent'
            )}
          />
        </div>
        <h4
          className={cn(
            'text-sm font-medium line-clamp-2 transition-colors',
            isHighlighted
              ? 'text-accent'
              : 'group-hover:text-accent'
          )}
        >
          {source.title}
        </h4>
      </a>
    </Card>
  )
}
