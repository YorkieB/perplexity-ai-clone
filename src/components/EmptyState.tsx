import { NexusLogo } from '@/components/NexusLogo'
import { MagnifyingGlass } from '@phosphor-icons/react'

interface EmptyStateProps {
  onExampleClick: (query: string) => void
}

const exampleQueries = [
  'Explain quantum computing in simple terms',
  'What are the latest developments in AI?',
  'How does photosynthesis work?',
]

export function EmptyState({ onExampleClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-2xl w-full px-6 text-center space-y-8">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="rounded-2xl bg-accent/10 p-4 ring-1 ring-accent/20">
              <NexusLogo size={56} className="rounded-xl" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            What would you like to know?
          </h1>
          <p className="text-muted-foreground text-lg">
            Ask anything and get intelligent answers with verified sources
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground font-medium">Try asking:</p>
          <div className="grid gap-3">
            {exampleQueries.map((query, index) => (
              <button
                key={index}
                onClick={() => onExampleClick(query)}
                className="px-4 py-3 bg-card border border-border rounded-lg hover:border-accent hover:bg-card/80 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <MagnifyingGlass
                    size={16}
                    className="text-muted-foreground group-hover:text-accent transition-colors"
                  />
                  <span className="text-sm">{query}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
