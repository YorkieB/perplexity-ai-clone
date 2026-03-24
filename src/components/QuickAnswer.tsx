import { Lightning } from '@phosphor-icons/react'

interface QuickAnswerProps {
  answer: string
  isGenerating: boolean
}

export function QuickAnswer({ answer, isGenerating }: QuickAnswerProps) {
  if (!answer || !isGenerating) return null

  return (
    <div className="border border-accent/30 bg-accent/5 rounded-lg px-4 py-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Lightning size={14} weight="fill" className="text-accent" />
        <span className="text-xs font-semibold text-accent uppercase tracking-wide">Quick Answer</span>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed">{answer}</p>
    </div>
  )
}
