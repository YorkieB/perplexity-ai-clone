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

  /** Keep fields in sync when opening or switching create vs edit (Radix may not remount the dialog). */
  useEffect(() => {
    if (!open) return
    setName(workspace?.name ?? '')
    setDescription(workspace?.description ?? '')
    setCustomSystemPrompt(workspace?.customSystemPrompt ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace?.id])

  /**
   * Radix calls `onOpenChange(true)` when opening and `onOpenChange(false)` when closing.
   * The previous handler ignored the argument and always called `onOpenChange(false)`, so the dialog
   * closed immediately whenever it tried to open — workspaces could not be created.
   */
  const handleDialogOpenChange = (next: boolean) => {
    if (!next) {
      if (!workspace) {
        setName('')
        setDescription('')
        setCustomSystemPrompt('')
      }
    }
    onOpenChange(next)
  }

  const handleSave = () => {
    if (!name.trim()) return

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

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
          <Button type="button" variant="ghost" onClick={() => handleDialogOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!name.trim()}>
            {workspace ? 'Save Changes' : 'Create Workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
