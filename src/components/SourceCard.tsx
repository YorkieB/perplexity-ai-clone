import { Source } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Link as LinkIcon } from '@phosphor-icons/react'

interface SourceCardProps {
  source: Source
  index: number
}

export function SourceCard({ source, index }: SourceCardProps) {
  return (
    <Card className="p-3 hover:border-accent transition-colors group">
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block space-y-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-semibold">
              {index}
            </div>
            <h4 className="text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">
              {source.title}
            </h4>
          </div>
          <LinkIcon
            size={14}
            className="text-muted-foreground group-hover:text-accent transition-colors shrink-0"
          />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {source.snippet}
        </p>
      </a>
    </Card>
  )
}
