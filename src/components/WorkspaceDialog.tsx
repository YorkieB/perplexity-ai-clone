import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Workspace } from '@/lib/types'

interface WorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace?: Workspace
  onSave: (workspace: Omit<Workspace, 'id' | 'createdAt'> | Workspace) => void
}

export function WorkspaceDialog({ open, onOpenChange, workspace, onSave }: WorkspaceDialogProps) {
  const [name, setName] = useState(workspace?.name || '')
  const [description, setDescription] = useState(workspace?.description || '')
  const [customSystemPrompt, setCustomSystemPrompt] = useState(workspace?.customSystemPrompt || '')

  useEffect(() => {
    if (!open) return
    if (workspace) {
      setName(workspace.name)
      setDescription(workspace.description || '')
      setCustomSystemPrompt(workspace.customSystemPrompt || '')
    } else {
      setName('')
      setDescription('')
      setCustomSystemPrompt('')
    }
  }, [open, workspace])

  const handleSave = () => {
    if (workspace) {
      onSave({
        ...workspace,
        name: name.trim(),
        description: description.trim(),
        customSystemPrompt: customSystemPrompt.trim(),
      })
    } else {
      onSave({
        name: name.trim(),
        description: description.trim(),
        customSystemPrompt: customSystemPrompt.trim(),
      })
    }

    setName('')
    setDescription('')
    setCustomSystemPrompt('')
    onOpenChange(false)
  }

  const handleClose = () => {
    if (!workspace) {
      setName('')
      setDescription('')
      setCustomSystemPrompt('')
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{workspace ? 'Edit Workspace' : 'New Workspace'}</DialogTitle>
          <DialogDescription>
            {workspace
              ? 'Update your workspace details and custom AI behavior'
              : 'Create a new workspace to organize your research with custom AI settings'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              placeholder="e.g. Research Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-description">Description</Label>
            <Textarea
              id="workspace-description"
              placeholder="Brief description of this workspace"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-prompt">Custom System Prompt</Label>
            <Textarea
              id="workspace-prompt"
              placeholder="e.g. You are an expert in molecular biology. Always cite recent research papers..."
              value={customSystemPrompt}
              onChange={(e) => setCustomSystemPrompt(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Customize how the AI behaves in this workspace
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {workspace ? 'Save Changes' : 'Create Workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
