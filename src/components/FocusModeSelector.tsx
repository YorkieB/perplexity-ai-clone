import { useMemo } from 'react'
import { FocusMode } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GraduationCap, RedditLogo, YoutubeLogo, Newspaper, Code, Globe, ChatCircle, CurrencyDollar } from '@phosphor-icons/react'

interface FocusModeSelectorProps {
  value: FocusMode
  onChange: (mode: FocusMode) => void
  disabled?: boolean
}

const focusModeEntries: { value: FocusMode; label: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'news', label: 'News' },
  { value: 'academic', label: 'Academic' },
  { value: 'code', label: 'Code' },
  { value: 'finance', label: 'Finance' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'chat', label: 'Chat Only' },
]

function FocusIcon({ mode }: { mode: FocusMode }) {
  switch (mode) {
    case 'chat': return <ChatCircle size={16} />
    case 'all': return <Globe size={16} />
    case 'academic': return <GraduationCap size={16} />
    case 'reddit': return <RedditLogo size={16} />
    case 'youtube': return <YoutubeLogo size={16} />
    case 'news': return <Newspaper size={16} />
    case 'code': return <Code size={16} />
    case 'finance': return <CurrencyDollar size={16} />
  }
}

export function FocusModeSelector({ value, onChange, disabled }: FocusModeSelectorProps) {
  const currentEntry = useMemo(() => focusModeEntries.find((m) => m.value === value), [value])

  return (
    <Select value={value} onValueChange={(v) => onChange(v as FocusMode)} disabled={disabled}>
      <SelectTrigger className="h-9 w-[160px] bg-card border-border">
        <div className="flex items-center gap-2">
          <FocusIcon mode={value} />
          <SelectValue>{currentEntry?.label}</SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {focusModeEntries.map((mode) => (
          <SelectItem key={mode.value} value={mode.value}>
            <div className="flex items-center gap-2">
              <FocusIcon mode={mode.value} />
              <span>{mode.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
