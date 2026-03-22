import type { ReactElement } from 'react'
import { FocusMode } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GraduationCap, RedditLogo, YoutubeLogo, Newspaper, Code, Globe } from '@phosphor-icons/react'

interface FocusModeSelectorProps {
  value: FocusMode
  onChange: (mode: FocusMode) => void
  disabled?: boolean
  /** When false, focus modes only affect web search — selector is disabled. */
  webSearchEnabled?: boolean
}

const focusModes: { value: FocusMode; label: string; icon: ReactElement }[] = [
  { value: 'all', label: 'All Sources', icon: <Globe size={16} /> },
  { value: 'academic', label: 'Academic', icon: <GraduationCap size={16} /> },
  { value: 'reddit', label: 'Reddit', icon: <RedditLogo size={16} /> },
  { value: 'youtube', label: 'YouTube', icon: <YoutubeLogo size={16} /> },
  { value: 'news', label: 'News', icon: <Newspaper size={16} /> },
  { value: 'code', label: 'Code', icon: <Code size={16} /> },
]

export function FocusModeSelector({
  value,
  onChange,
  disabled,
  webSearchEnabled = true,
}: FocusModeSelectorProps) {
  const currentMode = focusModes.find((m) => m.value === value)
  const isDisabled = Boolean(disabled) || !webSearchEnabled

  const select = (
    <Select value={value} onValueChange={(v) => onChange(v as FocusMode)} disabled={isDisabled}>
      <SelectTrigger className="h-9 w-[160px] bg-card border-border">
        <div className="flex items-center gap-2">
          {currentMode?.icon}
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {focusModes.map((mode) => (
          <SelectItem key={mode.value} value={mode.value}>
            <div className="flex items-center gap-2">
              {mode.icon}
              <span>{mode.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  if (!webSearchEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">{select}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-balance">
          Focus applies to web search only. Turn on Include web to use focus modes.
        </TooltipContent>
      </Tooltip>
    )
  }

  return select
}
