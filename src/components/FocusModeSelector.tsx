import type { ReactElement } from 'react'
import { FocusMode } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GraduationCap, RedditLogo, YoutubeLogo, Newspaper, Code, Globe } from '@phosphor-icons/react'

interface FocusModeSelectorProps {
  value: FocusMode
  onChange: (mode: FocusMode) => void
  disabled?: boolean
}

const focusModes: { value: FocusMode; label: string; icon: ReactElement }[] = [
  { value: 'all', label: 'All Sources', icon: <Globe size={16} /> },
  { value: 'academic', label: 'Academic', icon: <GraduationCap size={16} /> },
  { value: 'reddit', label: 'Reddit', icon: <RedditLogo size={16} /> },
  { value: 'youtube', label: 'YouTube', icon: <YoutubeLogo size={16} /> },
  { value: 'news', label: 'News', icon: <Newspaper size={16} /> },
  { value: 'code', label: 'Code', icon: <Code size={16} /> },
]

export function FocusModeSelector({ value, onChange, disabled }: FocusModeSelectorProps) {
  const currentMode = focusModes.find((m) => m.value === value)

  return (
    <Select value={value} onValueChange={(v) => onChange(v as FocusMode)} disabled={disabled}>
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
}
