import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Hammer, CheckCircle } from '@phosphor-icons/react'

interface ModelOption {
  id: string
  name: string
  description: string
  badge?: string
  badgeVariant?: 'default' | 'secondary' | 'outline'
}

const availableModels: ModelOption[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Latest OpenAI model with strong reasoning and speed',
    badge: 'Fast',
    badgeVariant: 'default',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Efficient and cost-effective with good performance',
    badge: 'Efficient',
    badgeVariant: 'secondary',
  },
]

interface ModelCouncilSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (selectedModels: string[]) => void
  defaultSelected?: string[]
}

export function ModelCouncilSelector({
  open,
  onOpenChange,
  onConfirm,
  defaultSelected = ['gpt-4o', 'gpt-4o-mini'],
}: ModelCouncilSelectorProps) {
  const [selectedModels, setSelectedModels] = useState<string[]>(defaultSelected)

  const handleToggleModel = (modelId: string) => {
    setSelectedModels((current) =>
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
    )
  }

  const handleConfirm = () => {
    if (selectedModels.length >= 2) {
      onConfirm(selectedModels)
      onOpenChange(false)
    }
  }

  const handleCancel = () => {
    setSelectedModels(defaultSelected)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer size={20} className="text-primary" />
            Configure Model Council
          </DialogTitle>
          <DialogDescription>
            Select at least 2 models to include in the council. Models will respond in parallel
            and their answers will be analyzed for convergence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            {availableModels.map((model) => (
              <div
                key={model.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  selectedModels.includes(model.id)
                    ? 'bg-primary/5 border-primary/30'
                    : 'bg-card border-border hover:border-primary/20'
                }`}
              >
                <Checkbox
                  id={model.id}
                  checked={selectedModels.includes(model.id)}
                  onCheckedChange={() => handleToggleModel(model.id)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={model.id} className="font-medium cursor-pointer">
                      {model.name}
                    </Label>
                    {model.badge && (
                      <Badge variant={model.badgeVariant} className="text-xs px-1.5 py-0 h-5">
                        {model.badge}
                      </Badge>
                    )}
                    {selectedModels.includes(model.id) && (
                      <CheckCircle size={16} className="text-primary" weight="fill" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {model.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Models selected:</span>
            <Badge variant="outline" className="font-mono">
              {selectedModels.length}
            </Badge>
          </div>

          {selectedModels.length < 2 && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
              Please select at least 2 models to create a council.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedModels.length < 2}>
            Start Council
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
