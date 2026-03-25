import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { rust } from '@codemirror/lang-rust'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { php } from '@codemirror/lang-php'
import type { Extension } from '@codemirror/state'
import { useCodeEditorRegister, useCodeEditorItems, useCodeEditorRunning, type CodeEditorControl } from '@/contexts/CodeEditorContext'
import { runCode } from '@/lib/code-runner'

interface CodeEditorModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

const LANG_EXTENSIONS: Record<string, () => Extension> = {
  python: () => python(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  html: () => html(),
  css: () => css(),
  json: () => json(),
  markdown: () => markdown(),
  rust: () => rust(),
  cpp: () => cpp(),
  c: () => cpp(),
  java: () => java(),
  sql: () => sql(),
  xml: () => xml(),
  php: () => php(),
}

const RUNNABLE = new Set(['python', 'py', 'javascript', 'js', 'typescript', 'ts'])

function langExt(lang: string): Extension[] {
  const factory = LANG_EXTENSIONS[lang.toLowerCase()]
  return factory ? [factory()] : []
}

export function CodeEditorModal({ open, onOpenChange }: CodeEditorModalProps) {
  const { register, unregister } = useCodeEditorRegister()
  const { items, addItem, activeItemId, setActiveItemId } = useCodeEditorItems()
  const { running, setRunning, runResult, setRunResult } = useCodeEditorRunning()
  const [editedCode, setEditedCode] = useState('')
  const [editedLang, setEditedLang] = useState('python')

  const activeItem = useMemo(() => items.find(i => i.id === activeItemId), [items, activeItemId])

  useEffect(() => {
    if (activeItem) {
      setEditedCode(activeItem.code)
      setEditedLang(activeItem.language)
      setRunResult(null)
    }
  }, [activeItem, setRunResult])

  useEffect(() => {
    const control: CodeEditorControl = {
      showCode(code, language, filename) {
        addItem({
          id: `code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          code,
          language,
          filename,
          createdAt: Date.now(),
        })
        onOpenChange(true)
      },
      isOpen: () => open,
      openEditor: () => onOpenChange(true),
    }
    register(control)
    return () => unregister()
  }, [open, register, unregister, addItem, onOpenChange])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editedCode).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Failed to copy'),
    )
  }, [editedCode])

  const handleDownload = useCallback(() => {
    const ext = editedLang === 'python' ? 'py' : editedLang === 'typescript' ? 'ts' : editedLang === 'javascript' ? 'js' : editedLang
    const filename = activeItem?.filename || `code.${ext}`
    const blob = new Blob([editedCode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${filename}`)
  }, [editedCode, editedLang, activeItem])

  const handleRun = useCallback(async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const result = await runCode(editedCode, editedLang)
      setRunResult(result)
    } catch (err) {
      setRunResult({
        stdout: '',
        stderr: '',
        error: err instanceof Error ? err.message : String(err),
        elapsed: 0,
      })
    } finally {
      setRunning(false)
    }
  }, [editedCode, editedLang, setRunning, setRunResult])

  const canRun = RUNNABLE.has(editedLang.toLowerCase())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-sm">
            <span className="font-semibold">Code Editor</span>
            {activeItem?.filename && (
              <span className="text-muted-foreground font-mono text-xs">{activeItem.filename}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        {items.length > 1 && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border overflow-x-auto flex-shrink-0">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveItemId(item.id)}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors whitespace-nowrap ${
                  item.id === activeItemId
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {item.filename || `${item.language} snippet`}
              </button>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
          <Select value={editedLang} onValueChange={setEditedLang}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(LANG_EXTENSIONS).map(l => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {canRun && (
            <Button size="sm" variant="default" onClick={handleRun} disabled={running} className="h-7 text-xs gap-1.5">
              {running ? 'Running...' : 'Run'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleCopy} className="h-7 text-xs">
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} className="h-7 text-xs">
            Download
          </Button>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 overflow-auto">
          <CodeMirror
            value={editedCode}
            onChange={setEditedCode}
            extensions={langExt(editedLang)}
            theme="dark"
            height="100%"
            minHeight="300px"
            maxHeight="50vh"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
              autocompletion: true,
            }}
          />
        </div>

        {/* Output Panel */}
        {(runResult || running) && (
          <div className="border-t border-border flex-shrink-0 max-h-[30vh] overflow-auto">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/50 border-b border-border">
              <span className="text-xs font-medium">Output</span>
              {runResult && (
                <span className="text-xs text-muted-foreground ml-auto">{runResult.elapsed}ms</span>
              )}
            </div>
            <div className="p-4 font-mono text-xs whitespace-pre-wrap">
              {running && <span className="text-muted-foreground animate-pulse">Executing...</span>}
              {runResult?.error && (
                <span className="text-destructive">{runResult.error}</span>
              )}
              {runResult?.stderr && (
                <span className="text-amber-500">{runResult.stderr}</span>
              )}
              {runResult?.stdout && (
                <span className="text-foreground">{runResult.stdout}</span>
              )}
              {runResult && !runResult.stdout && !runResult.stderr && !runResult.error && (
                <span className="text-muted-foreground">(no output)</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
