import { Button } from '@/components/ui/button'
import { ArrowRight } from '@phosphor-icons/react'

interface FollowUpQuestionsProps {
  questions: string[]
  onQuestionClick: (question: string) => void
  isLoading?: boolean
  showEmptyState?: boolean
}

export function FollowUpQuestions({
  questions,
  onQuestionClick,
  isLoading = false,
  showEmptyState = false,
}: FollowUpQuestionsProps) {
  if (questions.length === 0) {
    if (!showEmptyState) {
      return null
    }

    return (
      <div className="space-y-1 mt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Follow-up Questions
        </p>
        <p className="text-sm text-muted-foreground">
          No related follow-up questions generated for this response.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 mt-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Follow-up Questions
      </p>
      <div className="flex flex-col gap-2">
        {questions.map((question, index) => (
          <Button
            key={index}
            variant="outline"
            className="h-auto py-3 px-4 justify-start text-left hover:bg-accent/10 hover:border-accent transition-all group"
            onClick={() => onQuestionClick(question)}
            disabled={isLoading}
          >
            <span className="flex-1 text-sm leading-relaxed">{question}</span>
            <ArrowRight
              size={16}
              className="ml-2 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0"
            />
          </Button>
        ))}
      </div>
    </div>
  )
}
