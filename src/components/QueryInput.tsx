import { useState, KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ArrowRight, Lightning } from '@phosphor-icons/react'

interface QueryInputProps {
  onSubmit: (query: string, advancedMode: boolean) => void
  isLoading?: boolean
  placeholder?: string
  advancedMode: boolean
  onAdvancedModeChange: (enabled: boolean) => void
}

export function QueryInput({
  onSubmit,
  isLoading = false,
  placeholder = 'Ask anything...',
  advancedMode,
  onAdvancedModeChange,
}: QueryInputProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = () => {
    if (query.trim() && !isLoading) {
      onSubmit(query.trim(), advancedMode)
      setQuery('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[120px] resize-none pr-12 text-base"
          disabled={isLoading}
          id="query-input"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!query.trim() || isLoading}
          className="absolute bottom-3 right-3 h-9 w-9"
        >
          <ArrowRight size={18} weight="bold" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="advanced-mode"
          checked={advancedMode}
          onCheckedChange={onAdvancedModeChange}
          disabled={isLoading}
        />
        <Label
          htmlFor="advanced-mode"
          className="flex items-center gap-2 cursor-pointer text-sm"
        >
          <Lightning size={16} weight={advancedMode ? 'fill' : 'regular'} className="text-accent" />
          <span>Enable Advanced Analysis</span>
        </Label>
      </div>
    </div>
  )
}
