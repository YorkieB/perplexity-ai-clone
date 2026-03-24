import { useState, useEffect, useMemo } from 'react'
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
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { UserSettings } from '@/lib/types'
import { fetchDigitalOceanModels } from '@/lib/digitalocean-api'
import { toast } from 'sonner'
import { ModelBadges } from '@/components/ModelBadges'

interface ModelOption {
  id: string
  name: string
  description: string
}

const defaultUserSettings: UserSettings = {
  apiKeys: {},
  oauthTokens: {},
  oauthClientIds: {},
  oauthClientSecrets: {},
  connectedServices: {
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false,
    spotify: false,
  },
}

const fallbackModels: ModelOption[] = [
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest OpenAI model with strong reasoning and speed' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Efficient and cost-effective with good performance' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: "Anthropic's latest model with excellent reasoning and analysis" },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', description: 'Top-tier Anthropic model for complex tasks' },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', description: 'Fast and efficient Claude model for quick responses' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: "Google's fast multimodal model with broad capabilities" },
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
  defaultSelected = ['gpt-4o', 'claude-3.5-sonnet'],
}: ModelCouncilSelectorProps) {
  const [userSettings] = useLocalStorage<UserSettings>('user-settings', defaultUserSettings)
  const useEnvInference = Boolean(import.meta.env.VITE_USE_DO_INFERENCE)
  const doToken = userSettings?.apiKeys?.digitalOcean?.trim()
  const useDigitalOceanCatalog = Boolean(doToken) || useEnvInference

  const [remoteModels, setRemoteModels] = useState<
    Awaited<ReturnType<typeof fetchDigitalOceanModels>>
  >([])
  const [modelsLoading, setModelsLoading] = useState(false)

  const [selectedModels, setSelectedModels] = useState<string[]>(defaultSelected)

  const availableModels: ModelOption[] = useMemo(() => {
    if (useDigitalOceanCatalog && remoteModels.length > 0) {
      return remoteModels.map((m, i) => ({
        id: m.id,
        name: m.name,
        description: m.description || 'DigitalOcean serverless model',
        badge: i < 3 ? 'DO' : undefined,
        badgeVariant: 'secondary' as const,
      }))
    }
    return fallbackModels
  }, [useDigitalOceanCatalog, remoteModels])

  useEffect(() => {
    setSelectedModels(defaultSelected)
  }, [defaultSelected, open])

  useEffect(() => {
    if (!open || !useDigitalOceanCatalog) {
      if (!useDigitalOceanCatalog) setRemoteModels([])
      return
    }
    let cancelled = false
    setModelsLoading(true)
    fetchDigitalOceanModels(doToken || undefined)
      .then((list) => {
        if (!cancelled) setRemoteModels(list)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load models')
        if (!cancelled) setRemoteModels([])
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, useDigitalOceanCatalog, doToken])

  useEffect(() => {
    if (remoteModels.length < 2) return
    setSelectedModels((prev) => {
      const valid = prev.filter((id) => remoteModels.some((m) => m.id === id))
      if (valid.length >= 2) return valid
      return [remoteModels[0].id, remoteModels[1].id]
    })
  }, [remoteModels])

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
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer size={20} className="text-primary" />
            Configure Model Council
          </DialogTitle>
          <DialogDescription>
            {useDigitalOceanCatalog
              ? 'Models are loaded from your DigitalOcean Gradient™ catalog. Select at least 2.'
              : 'Add a DigitalOcean API token in Settings (or DIGITALOCEAN_API_KEY in .env) to use the full catalog, or pick from the default list.'}{' '}
            Models respond in parallel and answers are analyzed for convergence.
          </DialogDescription>
        </DialogHeader>

        {modelsLoading && (
          <p className="text-sm text-muted-foreground py-1">Loading models from DigitalOcean…</p>
        )}

        <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-3 pr-1">
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
                  disabled={modelsLoading}
                />
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor={model.id} className="font-medium cursor-pointer break-words">
                      {model.name}
                    </Label>
                    <ModelBadges modelId={model.id} />
                    {selectedModels.includes(model.id) && (
                      <CheckCircle size={16} className="text-primary shrink-0" weight="fill" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed break-words">
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
          <Button onClick={handleConfirm} disabled={selectedModels.length < 2 || modelsLoading}>
            Start Council
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
