import { useMemo } from 'react'
import { TimeRange } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Clock } from '@phosphor-icons/react'

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
  disabled?: boolean
}

const timeRangeEntries: { value: TimeRange; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'day', label: 'Past day' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' },
]

export function TimeRangeSelector({ value, onChange, disabled }: TimeRangeSelectorProps) {
  const currentEntry = useMemo(() => timeRangeEntries.find((e) => e.value === value), [value])

  return (
    <Select value={value} onValueChange={(v) => onChange(v as TimeRange)} disabled={disabled}>
      <SelectTrigger className="h-9 w-[150px] bg-card border-border">
        <div className="flex items-center gap-2">
          <Clock size={16} />
          <SelectValue>{currentEntry?.label}</SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {timeRangeEntries.map((entry) => (
          <SelectItem key={entry.value} value={entry.value}>
            <div className="flex items-center gap-2">
              <span>{entry.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
