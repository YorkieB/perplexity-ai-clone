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
import { mergeDigitalOceanInferenceCatalog } from '@/lib/digitalocean-inference-models'
import { clientMayUseDigitalOceanInference } from '@/lib/digitalocean-client'

import { ModelBadges } from '@/components/ModelBadges'
import { useReplicateModelCatalog } from '@/hooks/useReplicateModelCatalog'

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
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Capable OpenAI model for complex reasoning tasks' },
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
  const doToken = userSettings?.apiKeys?.digitalOcean?.trim()
  const useDigitalOceanCatalog = clientMayUseDigitalOceanInference(doToken)

  const [remoteModels, setRemoteModels] = useState<
    Awaited<ReturnType<typeof fetchDigitalOceanModels>>
  >([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const { selectorOptions: replicateModelOptions } = useReplicateModelCatalog(2000)

  const [selectedModels, setSelectedModels] = useState<string[]>(defaultSelected)

  const availableModels: ModelOption[] = useMemo(() => {
    const rep: ModelOption[] = replicateModelOptions.map((o) => ({
      id: o.id,
      name: o.label,
      description: o.description || 'Replicate public model (chat uses GPT-4o mini; run models via tools)',
    }))
    if (!useDigitalOceanCatalog) {
      return [...fallbackModels, ...rep]
    }
    const merged = mergeDigitalOceanInferenceCatalog(remoteModels)
    const doOpts: ModelOption[] = merged.map((m) => ({
      id: `do:${m.id}`,
      name: m.name,
      description: m.description || 'DigitalOcean serverless inference',
    }))
    return [...fallbackModels, ...doOpts, ...rep]
  }, [useDigitalOceanCatalog, remoteModels, replicateModelOptions])

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
        if (!cancelled) {
          setRemoteModels(list)
          if (list.length === 0) {
            console.warn('[ModelCouncilSelector] No DigitalOcean models returned, using fallback')
          }
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, useDigitalOceanCatalog, doToken])

  useEffect(() => {
    const ids = new Set(availableModels.map((m) => m.id))
    if (ids.size < 2) return
    setSelectedModels((prev) => {
      const valid = prev.filter((id) => ids.has(id))
      if (valid.length >= 2) return valid
      const a = availableModels[0]?.id
      const b = availableModels[1]?.id
      return a && b ? [a, b] : prev
    })
  }, [availableModels])

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
              ? 'OpenAI models plus DigitalOcean Gradient™ inference (API catalog merged with common fallbacks). Select at least 2.'
              : 'Add a DigitalOcean inference key in Settings (or DIGITALOCEAN_API_KEY in .env) to add DO models alongside the default OpenAI list.'}{' '}
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
