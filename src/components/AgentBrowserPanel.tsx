import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  callAgentBrowserTool,
  fetchAgentBrowserHealth,
  type McpCallResponse,
} from '@/lib/agent-browser-mcp'
import { toast } from 'sonner'

interface AgentBrowserPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AgentBrowserPanel({ open, onOpenChange }: AgentBrowserPanelProps) {
  const [url, setUrl] = useState('https://example.com')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null)

  const refreshHealth = useCallback(async () => {
    try {
      const h = await fetchAgentBrowserHealth()
      setBridgeOk(Boolean(h.ok))
      if (!h.ok) {
        setOutput((prev) => prev + (prev ? '\n\n' : '') + `[bridge] ${h.error ?? 'unavailable'}`)
      }
    } catch {
      setBridgeOk(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void refreshHealth()
  }, [open, refreshHealth])

  const appendResult = (label: string, data: McpCallResponse) => {
    const text =
      data.error != null
        ? `Error: ${data.error}`
        : JSON.stringify(data.result ?? data, null, 2)
    setOutput((prev) => `${prev ? `${prev}\n\n---\n\n` : ''}${label}\n${text}`)
  }

  const runNavigate = async () => {
    const u = url.trim()
    if (!u) {
      toast.error('Enter a URL')
      return
    }
    setBusy(true)
    try {
      const res = await callAgentBrowserTool('browser_navigate', { url: u })
      appendResult(`browser_navigate`, res)
      if (res.error) toast.error(res.error)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendResult('browser_navigate', { error: msg })
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const runSnapshot = async () => {
    setBusy(true)
    try {
      const res = await callAgentBrowserTool('browser_snapshot', {})
      appendResult('browser_snapshot', res)
      if (res.error) toast.error(res.error)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendResult('browser_snapshot', { error: msg })
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-3xl gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Agent browser (Playwright MCP)</DialogTitle>
          <DialogDescription>
            Uses the accessibility tree via Microsoft Playwright MCP — not the Electron in-app webview. Start{' '}
            <code className="rounded bg-muted px-1 text-xs">npm run agent:mcp</code> in another terminal (with{' '}
            <code className="rounded bg-muted px-1 text-xs">npm run dev</code>).
          </DialogDescription>
        </DialogHeader>

        {bridgeOk === false && (
          <Alert variant="destructive">
            <AlertTitle>Bridge offline</AlertTitle>
            <AlertDescription>
              Could not reach the MCP bridge at <code className="text-xs">127.0.0.1:3847</code>. Run{' '}
              <code className="text-xs">npm run agent:mcp</code> or <code className="text-xs">npm run dev:agent</code>{' '}
              (dev + bridge together).
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-muted-foreground text-xs">URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="font-mono text-sm"
              disabled={busy}
            />
          </div>
          <Button type="button" onClick={runNavigate} disabled={busy}>
            Navigate
          </Button>
          <Button type="button" variant="secondary" onClick={runSnapshot} disabled={busy}>
            Snapshot
          </Button>
          <Button type="button" variant="outline" onClick={() => setOutput('')} disabled={busy}>
            Clear log
          </Button>
        </div>

        <ScrollArea className="h-[min(420px,50vh)] rounded-md border border-border bg-muted/30 p-3">
          <pre className="text-muted-foreground whitespace-pre-wrap break-words font-mono text-xs">
            {output || (bridgeOk ? 'Run Navigate or Snapshot to see MCP tool output.' : '')}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
