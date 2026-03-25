import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import Editor, { type Monaco } from '@monaco-editor/react'
import type * as monacoNs from 'monaco-editor'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useCodeEditorRegister, useCodeEditorItems, useCodeEditorRunning, type CodeEditorControl, type CodeItem } from '@/contexts/CodeEditorContext'
import { runCode } from '@/lib/code-runner'
import { cn } from '@/lib/utils'

interface CodeEditorModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

// ── Language configuration ──────────────────────────────────────────────────

const MONACO_LANGS = [
  'javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown',
  'cpp', 'c', 'java', 'rust', 'sql', 'xml', 'php', 'go', 'ruby', 'swift',
  'kotlin', 'scala', 'r', 'shell', 'yaml', 'dockerfile', 'graphql',
] as const

const LANG_ICONS: Record<string, string> = {
  python: '🐍', javascript: 'JS', typescript: 'TS', jsx: '⚛', tsx: '⚛',
  html: '🌐', css: '🎨', json: '{}', markdown: 'MD', rust: '🦀',
  cpp: 'C++', c: 'C', java: '☕', sql: '🗄', xml: '📄', php: '🐘',
  go: 'Go', ruby: '💎', swift: '🐦', kotlin: 'K', yaml: '📝',
  shell: '🖥', dockerfile: '🐳', graphql: 'GQL', r: 'R', scala: 'S',
}

const FILE_EXT_MAP: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  html: 'html', htm: 'html', css: 'css', json: 'json', md: 'markdown',
  rs: 'rust', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', java: 'java',
  sql: 'sql', xml: 'xml', php: 'php', go: 'go', rb: 'ruby', swift: 'swift',
  kt: 'kotlin', scala: 'scala', r: 'r', sh: 'shell', bash: 'shell',
  yml: 'yaml', yaml: 'yaml', graphql: 'graphql', gql: 'graphql',
}

const RUNNABLE = new Set(['python', 'py', 'javascript', 'js', 'typescript', 'ts'])
const PREVIEWABLE = new Set(['html', 'htm'])

function detectLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return FILE_EXT_MAP[ext] || 'javascript'
}

function getFileExt(lang: string): string {
  const map: Record<string, string> = {
    python: 'py', javascript: 'js', typescript: 'ts', html: 'html', css: 'css',
    json: 'json', markdown: 'md', rust: 'rs', cpp: 'cpp', c: 'c', java: 'java',
    sql: 'sql', xml: 'xml', php: 'php', go: 'go', ruby: 'rb', swift: 'swift',
    kotlin: 'kt', scala: 'scala', r: 'r', shell: 'sh', yaml: 'yml', graphql: 'graphql',
  }
  return map[lang] || lang
}

function monacoLang(lang: string): string {
  const map: Record<string, string> = {
    python: 'python', javascript: 'javascript', typescript: 'typescript',
    jsx: 'javascript', tsx: 'typescript', html: 'html', css: 'css',
    json: 'json', markdown: 'markdown', rust: 'rust', cpp: 'cpp', c: 'c',
    java: 'java', sql: 'sql', xml: 'xml', php: 'php', go: 'go',
    ruby: 'ruby', swift: 'swift', kotlin: 'kotlin', scala: 'scala',
    r: 'r', shell: 'shell', yaml: 'yaml', dockerfile: 'dockerfile', graphql: 'graphql',
  }
  return map[lang] || lang
}

// ── Main IDE Component ──────────────────────────────────────────────────────

export function CodeEditorModal({ open, onOpenChange }: CodeEditorModalProps) {
  const { register, unregister } = useCodeEditorRegister()
  const { items, addItem, removeItem, updateItem, activeItemId, setActiveItemId } = useCodeEditorItems()
  const { running, setRunning, runResult, setRunResult } = useCodeEditorRunning()

  const [editedCode, setEditedCode] = useState('')
  const [editedLang, setEditedLang] = useState('javascript')
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [showExplorer, setShowExplorer] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showMinimap, setShowMinimap] = useState(true)
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('off')
  const [fontSize, setFontSize] = useState(14)
  const [terminalHistory, setTerminalHistory] = useState<Array<{ type: 'stdout' | 'stderr' | 'error' | 'info'; text: string; time: number }>>([])
  const [newFileDialog, setNewFileDialog] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')

  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const activeItem = useMemo(() => items.find(i => i.id === activeItemId), [items, activeItemId])

  // Sync editor when active item changes
  useEffect(() => {
    if (activeItem) {
      setEditedCode(activeItem.code)
      setEditedLang(activeItem.language)
      setRunResult(null)
    }
  }, [activeItem, setRunResult])

  // Refs for automation callbacks
  const itemsRef = useRef(items)
  itemsRef.current = items
  const activeItemIdRef = useRef(activeItemId)
  activeItemIdRef.current = activeItemId
  const editedCodeRef = useRef(editedCode)
  editedCodeRef.current = editedCode
  const editedLangRef = useRef(editedLang)
  editedLangRef.current = editedLang
  const runResultRef = useRef(runResult)
  runResultRef.current = runResult

  // Register full automation control for Jarvis
  useEffect(() => {
    const mkId = () => `code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const control: CodeEditorControl = {
      showCode(code, language, filename) {
        addItem({ id: mkId(), code, language, filename, createdAt: Date.now() })
        onOpenChange(true)
      },
      isOpen: () => open,
      openEditor: () => onOpenChange(true),

      createFile(filename, code, language) {
        const id = mkId()
        addItem({ id, code, language, filename, createdAt: Date.now() })
        onOpenChange(true)
        return id
      },
      editFile(fileId, newCode) {
        const file = itemsRef.current.find(i => i.id === fileId)
        if (!file) return false
        updateItem(fileId, { code: newCode })
        if (activeItemIdRef.current === fileId) setEditedCode(newCode)
        return true
      },
      deleteFile(fileId) {
        if (!itemsRef.current.find(i => i.id === fileId)) return false
        removeItem(fileId)
        return true
      },
      openFile(fileId) {
        if (!itemsRef.current.find(i => i.id === fileId)) return false
        setActiveItemId(fileId)
        onOpenChange(true)
        return true
      },
      renameFile(fileId, newName) {
        if (!itemsRef.current.find(i => i.id === fileId)) return false
        updateItem(fileId, { filename: newName, language: detectLang(newName) })
        return true
      },
      getFiles() {
        return itemsRef.current.map(i => ({
          id: i.id, filename: i.filename || `untitled.${getFileExt(i.language)}`, language: i.language,
        }))
      },
      getActiveFile() {
        const id = activeItemIdRef.current
        if (!id) return null
        const item = itemsRef.current.find(i => i.id === id)
        if (!item) return null
        return { id: item.id, filename: item.filename || `untitled.${getFileExt(item.language)}`, language: item.language, code: editedCodeRef.current || item.code }
      },
      getFileContent(fileId) {
        if (activeItemIdRef.current === fileId) return editedCodeRef.current
        const item = itemsRef.current.find(i => i.id === fileId)
        return item?.code ?? null
      },
      async runActiveFile() {
        const code = editedCodeRef.current
        const lang = editedLangRef.current
        setRunning(true)
        setRunResult(null)
        setShowTerminal(true)
        try {
          const result = await runCode(code, lang)
          setRunResult(result)
          return result
        } finally {
          setRunning(false)
        }
      },
      getLastRunResult() { return runResultRef.current },
      setLanguage(lang) {
        setEditedLang(lang)
        const id = activeItemIdRef.current
        if (id) updateItem(id, { language: lang })
      },
      togglePreview() { setShowPreview(p => !p) },
      toggleTerminal() { setShowTerminal(p => !p) },
      insertText(text, position = 'end') {
        const editor = editorRef.current
        if (!editor) return false
        const model = editor.getModel()
        if (!model) return false
        let pos: monacoNs.IPosition
        if (position === 'start') pos = { lineNumber: 1, column: 1 }
        else if (position === 'cursor') pos = editor.getPosition() || { lineNumber: 1, column: 1 }
        else { const lastLine = model.getLineCount(); pos = { lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) } }
        editor.executeEdits('jarvis', [{ range: new (monacoRef.current!.Range)(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text }])
        setEditedCode(model.getValue())
        return true
      },
      replaceText(searchStr, replaceStr, all = false) {
        const editor = editorRef.current
        const model = editor?.getModel()
        if (!model) return 0
        const content = model.getValue()
        let count = 0; let newContent: string
        if (all) {
          newContent = content.split(searchStr).join(replaceStr)
          count = content !== newContent ? content.split(searchStr).length - 1 : 0
        } else {
          const idx = content.indexOf(searchStr)
          if (idx === -1) return 0
          newContent = content.slice(0, idx) + replaceStr + content.slice(idx + searchStr.length)
          count = 1
        }
        model.setValue(newContent)
        setEditedCode(newContent)
        return count
      },
      findInFile(query) {
        const code = editedCodeRef.current
        const results: Array<{ line: number; column: number; text: string }> = []
        const lines = code.split('\n')
        const lowerQuery = query.toLowerCase()
        for (let i = 0; i < lines.length; i++) {
          const lowerLine = lines[i].toLowerCase()
          let col = lowerLine.indexOf(lowerQuery)
          while (col !== -1) {
            results.push({ line: i + 1, column: col + 1, text: lines[i].trim() })
            col = lowerLine.indexOf(lowerQuery, col + 1)
          }
        }
        return results
      },
    }
    register(control)
    return () => unregister()
  }, [open, register, unregister, addItem, removeItem, updateItem, onOpenChange, setActiveItemId, setRunning, setRunResult])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !commandPaletteOpen) { onOpenChange(false); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); setShowExplorer(p => !p) }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); setShowTerminal(p => !p) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey) { e.preventDefault(); setNewFileDialog(true) }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveActiveFile(); toast.success('Saved') }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); setCommandPaletteOpen(true); setCommandFilter('') }
      if ((e.ctrlKey || e.metaKey) && e.key === '+') { e.preventDefault(); setFontSize(s => Math.min(s + 1, 30)) }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setFontSize(s => Math.max(s - 1, 10)) }
    }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [open, onOpenChange, commandPaletteOpen])

  // Auto-scroll terminal
  useEffect(() => { terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [terminalHistory])

  // Live preview
  useEffect(() => {
    if (!showPreview || !previewRef.current) return
    if (!PREVIEWABLE.has(editedLang)) return
    const doc = previewRef.current.contentDocument
    if (!doc) return
    doc.open() // NOSONAR — required for iframe preview
    doc.write(editedCode) // NOSONAR — sandboxed iframe
    doc.close()
  }, [editedCode, editedLang, showPreview])

  const logToTerminal = useCallback((type: 'stdout' | 'stderr' | 'error' | 'info', text: string) => {
    setTerminalHistory(prev => [...prev, { type, text, time: Date.now() }])
  }, [])

  const handleSaveActiveFile = useCallback(() => {
    if (activeItemId) updateItem(activeItemId, { code: editedCode })
  }, [activeItemId, editedCode, updateItem])

  const handleRun = useCallback(async () => {
    setShowTerminal(true)
    setRunning(true)
    setRunResult(null)
    logToTerminal('info', `▶ Running ${editedLang}...`)
    try {
      const result = await runCode(editedCode, editedLang)
      setRunResult(result)
      if (result.stdout) logToTerminal('stdout', result.stdout)
      if (result.stderr) logToTerminal('stderr', result.stderr)
      if (result.error) logToTerminal('error', result.error)
      if (!result.stdout && !result.stderr && !result.error) logToTerminal('info', '(no output)')
      logToTerminal('info', `✓ Finished in ${result.elapsed}ms`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logToTerminal('error', msg)
      setRunResult({ stdout: '', stderr: '', error: msg, elapsed: 0 })
    } finally {
      setRunning(false)
    }
  }, [editedCode, editedLang, setRunning, setRunResult, logToTerminal])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editedCode).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Failed to copy'),
    )
  }, [editedCode])

  const handleDownload = useCallback(() => {
    const ext = getFileExt(editedLang)
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

  const handleNewFile = useCallback(() => {
    if (!newFileName.trim()) return
    const lang = detectLang(newFileName)
    addItem({ id: `code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, code: '', language: lang, filename: newFileName.trim(), createdAt: Date.now() })
    setNewFileName('')
    setNewFileDialog(false)
  }, [newFileName, addItem])

  const handleCloseTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = items.findIndex(i => i.id === id)
    if (id === activeItemId) {
      const next = items[idx + 1] || items[idx - 1]
      setActiveItemId(next?.id || null)
    }
    removeItem(id)
  }, [items, activeItemId, setActiveItemId, removeItem])

  const handleFormat = useCallback(() => {
    const editor = editorRef.current
    if (editor) {
      editor.getAction('editor.action.formatDocument')?.run()
      toast.success('Formatted')
    }
  }, [])

  const handleEditorMount = useCallback((editor: monacoNs.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column })
    })

    // Add keyboard shortcuts within Monaco
    editor.addAction({
      id: 'run-code', label: 'Run Code', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => { handleRun() },
    })

    // VS Code dark theme with slight customization
    monaco.editor.defineTheme('jarvis-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1e1e',
        'editorGutter.background': '#1e1e1e',
        'editor.lineHighlightBackground': '#2a2d2e',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
      },
    })
    monaco.editor.setTheme('jarvis-dark')
  }, [handleRun])

  const handlePreviewToggle = useCallback(() => {
    if (!showPreview && !PREVIEWABLE.has(editedLang) && editedLang !== 'javascript' && editedLang !== 'css') {
      toast.info('Preview is available for HTML, CSS, and JavaScript files.')
      return
    }
    setShowPreview(p => !p)
  }, [showPreview, editedLang])

  const canRun = RUNNABLE.has(editedLang.toLowerCase())
  const canPreview = PREVIEWABLE.has(editedLang) || editedLang === 'javascript' || editedLang === 'css'

  // Command palette commands
  const commands = useMemo(() => {
    const cmds = [
      { id: 'new-file', label: 'New File', shortcut: 'Ctrl+N', action: () => setNewFileDialog(true) },
      { id: 'run', label: 'Run Code', shortcut: 'Ctrl+Enter', action: handleRun, disabled: !canRun },
      { id: 'format', label: 'Format Document', shortcut: 'Shift+Alt+F', action: handleFormat },
      { id: 'copy', label: 'Copy All', shortcut: '', action: handleCopy },
      { id: 'download', label: 'Download File', shortcut: '', action: handleDownload },
      { id: 'toggle-explorer', label: 'Toggle Explorer', shortcut: 'Ctrl+B', action: () => setShowExplorer(p => !p) },
      { id: 'toggle-terminal', label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: () => setShowTerminal(p => !p) },
      { id: 'toggle-preview', label: 'Toggle Preview', shortcut: '', action: handlePreviewToggle },
      { id: 'toggle-minimap', label: 'Toggle Minimap', shortcut: '', action: () => setShowMinimap(p => !p) },
      { id: 'toggle-wordwrap', label: 'Toggle Word Wrap', shortcut: 'Alt+Z', action: () => setWordWrap(w => w === 'on' ? 'off' : 'on') },
      { id: 'increase-font', label: 'Increase Font Size', shortcut: 'Ctrl++', action: () => setFontSize(s => Math.min(s + 1, 30)) },
      { id: 'decrease-font', label: 'Decrease Font Size', shortcut: 'Ctrl+-', action: () => setFontSize(s => Math.max(s - 1, 10)) },
      { id: 'find', label: 'Find', shortcut: 'Ctrl+F', action: () => editorRef.current?.getAction('actions.find')?.run() },
      { id: 'replace', label: 'Find and Replace', shortcut: 'Ctrl+H', action: () => editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run() },
      { id: 'go-to-line', label: 'Go to Line', shortcut: 'Ctrl+G', action: () => editorRef.current?.getAction('editor.action.gotoLine')?.run() },
      { id: 'command-palette', label: 'Command Palette', shortcut: 'F1', action: () => editorRef.current?.getAction('editor.action.quickCommand')?.run() },
      ...items.map(item => ({
        id: `open-${item.id}`, label: `Open: ${item.filename || item.language}`, shortcut: '',
        action: () => setActiveItemId(item.id),
      })),
    ]
    if (!commandFilter) return cmds
    const f = commandFilter.toLowerCase()
    return cmds.filter(c => c.label.toLowerCase().includes(f))
  }, [commandFilter, items, canRun, handleRun, handleFormat, handleCopy, handleDownload, handlePreviewToggle, setActiveItemId])

  if (!open) return null

  if (items.length === 0) {
    addItem({ id: 'welcome', code: '// Welcome to Jarvis IDE\n// Create a new file or let Jarvis write code for you\n\nconsole.log("Hello, World!");\n', language: 'javascript', filename: 'index.js', createdAt: Date.now() })
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#1e1e1e] flex flex-col text-[#cccccc] select-none">
      {/* ── Title bar ── */}
      <div className="h-9 bg-[#323233] flex items-center px-3 gap-2 text-xs flex-shrink-0 border-b border-[#252526]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#569cd6] font-bold text-sm">⟨/⟩</span>
          <span className="text-[#cccccc]/80 font-medium">Jarvis IDE</span>
          <span className="text-[#cccccc]/30 text-[10px] ml-1">powered by Monaco</span>
        </div>
        <div className="flex items-center gap-0.5 ml-4">
          {['File', 'Edit', 'View', 'Run'].map(m => (
            <button key={m}
              className="px-2 py-0.5 rounded text-[#cccccc]/70 hover:text-[#cccccc] hover:bg-[#505050]/50 text-xs"
              onClick={() => {
                if (m === 'File') setNewFileDialog(true)
                if (m === 'Edit') editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run()
                if (m === 'View') { setCommandPaletteOpen(true); setCommandFilter('toggle') }
                if (m === 'Run' && canRun) handleRun()
              }}
            >{m}</button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => onOpenChange(false)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#c42b1c] text-[#cccccc]/60 hover:text-white transition-colors"
                aria-label="Close IDE">✕</button>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex min-h-0">
        {/* Activity bar */}
        <div className="w-12 bg-[#333333] flex flex-col items-center py-2 gap-1 flex-shrink-0 border-r border-[#252526]">
          <ActivityBarButton icon="📁" label="Explorer (Ctrl+B)" active={showExplorer} onClick={() => setShowExplorer(p => !p)} />
          <ActivityBarButton icon="🔍" label="Search (Ctrl+F)" active={false} onClick={() => editorRef.current?.getAction('actions.find')?.run()} />
          <ActivityBarButton icon="🖥" label="Terminal (Ctrl+`)" active={showTerminal} onClick={() => setShowTerminal(p => !p)} />
          <ActivityBarButton icon="👁" label="Preview" active={showPreview} onClick={handlePreviewToggle} />
          <div className="flex-1" />
          <ActivityBarButton icon="⌨" label="Command Palette" active={false} onClick={() => { setCommandPaletteOpen(true); setCommandFilter('') }} />
          <ActivityBarButton icon="⚙" label="Settings" active={false} onClick={() => { setCommandPaletteOpen(true); setCommandFilter('toggle') }} />
        </div>

        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* ── File Explorer ── */}
          {showExplorer && (
            <>
              <ResizablePanel defaultSize={18} minSize={12} maxSize={35}>
                <div className="h-full bg-[#252526] flex flex-col">
                  <div className="h-9 px-4 flex items-center justify-between text-[11px] uppercase tracking-wider text-[#bbbbbb]/60 font-semibold flex-shrink-0">
                    <span>Explorer</span>
                    <button onClick={() => setNewFileDialog(true)} className="text-[#cccccc]/50 hover:text-[#cccccc] text-base leading-none" title="New File (Ctrl+N)">+</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-1">
                    <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-[#bbbbbb]/40 font-semibold">Open Files</div>
                    {items.map(item => (
                      <FileExplorerItem key={item.id} item={item} active={item.id === activeItemId} onClick={() => setActiveItemId(item.id)} />
                    ))}
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* ── Editor + Preview area ── */}
          <ResizablePanel defaultSize={showExplorer ? 82 : 100}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={showTerminal ? 65 : 100}>
                <ResizablePanelGroup direction="horizontal">
                  {/* Editor */}
                  <ResizablePanel defaultSize={showPreview ? 55 : 100}>
                    <div className="h-full flex flex-col bg-[#1e1e1e]">
                      {/* Tabs */}
                      <div className="h-9 bg-[#252526] flex items-center overflow-x-auto flex-shrink-0 border-b border-[#1e1e1e]">
                        {items.map(item => (
                          <EditorTab key={item.id} item={item} active={item.id === activeItemId}
                                     onClick={() => setActiveItemId(item.id)} onClose={(e) => handleCloseTab(item.id, e)} />
                        ))}
                      </div>

                      {/* Breadcrumbs */}
                      {activeItem && (
                        <div className="h-6 px-4 flex items-center gap-1 text-[11px] text-[#cccccc]/50 bg-[#1e1e1e] border-b border-[#252526] flex-shrink-0">
                          <span>workspace</span><span className="text-[#cccccc]/30">›</span>
                          <span>{activeItem.filename || 'untitled'}</span>
                        </div>
                      )}

                      {/* Toolbar */}
                      <div className="h-8 px-2 flex items-center gap-1 bg-[#252526] border-b border-[#1e1e1e] flex-shrink-0">
                        <ToolbarButton icon="▶" label="Run (Ctrl+Enter)" onClick={handleRun} disabled={!canRun || running} highlight />
                        <ToolbarDivider />
                        <ToolbarButton icon="📋" label="Copy" onClick={handleCopy} />
                        <ToolbarButton icon="💾" label="Download" onClick={handleDownload} />
                        <ToolbarButton icon="🎨" label="Format (Shift+Alt+F)" onClick={handleFormat} />
                        <ToolbarDivider />
                        <ToolbarButton icon="👁" label="Preview" onClick={handlePreviewToggle} active={showPreview} disabled={!canPreview} />
                        <ToolbarButton icon="🖥" label="Terminal" onClick={() => setShowTerminal(p => !p)} active={showTerminal} />
                        <div className="flex-1" />
                        <select value={editedLang} onChange={e => { setEditedLang(e.target.value); if (activeItemId) updateItem(activeItemId, { language: e.target.value }) }}
                                className="h-6 px-2 text-[11px] bg-[#3c3c3c] border border-[#3c3c3c] rounded text-[#cccccc] outline-none cursor-pointer hover:border-[#505050]">
                          {MONACO_LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>

                      {/* Monaco Editor */}
                      <div className="flex-1 min-h-0">
                        <Editor
                          language={monacoLang(editedLang)}
                          value={editedCode}
                          onChange={(val) => setEditedCode(val || '')}
                          onMount={handleEditorMount}
                          theme="jarvis-dark"
                          options={{
                            fontSize,
                            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
                            fontLigatures: true,
                            minimap: { enabled: showMinimap },
                            wordWrap,
                            smoothScrolling: true,
                            cursorBlinking: 'smooth',
                            cursorSmoothCaretAnimation: 'on',
                            bracketPairColorization: { enabled: true },
                            guides: { bracketPairs: true, indentation: true },
                            renderLineHighlight: 'all',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            suggestOnTriggerCharacters: true,
                            quickSuggestions: true,
                            parameterHints: { enabled: true },
                            formatOnPaste: true,
                            formatOnType: true,
                            tabSize: 2,
                            insertSpaces: true,
                            renderWhitespace: 'selection',
                            folding: true,
                            foldingHighlight: true,
                            showFoldingControls: 'always',
                            matchBrackets: 'always',
                            occurrencesHighlight: 'singleFile',
                            selectionHighlight: true,
                            links: true,
                            colorDecorators: true,
                            mouseWheelZoom: true,
                            multiCursorModifier: 'ctrlCmd',
                            dragAndDrop: true,
                            accessibilitySupport: 'off',
                            lineNumbers: 'on',
                            glyphMargin: true,
                            rulers: [80, 120],
                            stickyScroll: { enabled: true },
                            inlineSuggest: { enabled: true },
                          }}
                        />
                      </div>
                    </div>
                  </ResizablePanel>

                  {/* Preview panel */}
                  {showPreview && (
                    <>
                      <ResizableHandle withHandle />
                      <ResizablePanel defaultSize={45} minSize={20}>
                        <div className="h-full flex flex-col bg-[#1e1e1e]">
                          <div className="h-9 bg-[#252526] flex items-center px-4 gap-2 text-xs flex-shrink-0 border-b border-[#1e1e1e]">
                            <span className="text-[#cccccc]/60">Preview</span>
                            <div className="flex-1" />
                            <button onClick={() => {
                              if (previewRef.current?.contentDocument) {
                                previewRef.current.contentDocument.open() // NOSONAR
                                previewRef.current.contentDocument.write(editedCode) // NOSONAR
                                previewRef.current.contentDocument.close()
                              }
                            }} className="text-[10px] px-2 py-0.5 rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc]/70">↻ Refresh</button>
                          </div>
                          <div className="flex-1 bg-white">
                            {PREVIEWABLE.has(editedLang) ? (
                              <iframe ref={previewRef} className="w-full h-full border-none" title="Preview" sandbox="allow-scripts allow-same-origin" />
                            ) : (
                              <PreviewFromJS code={editedCode} lang={editedLang} />
                            )}
                          </div>
                        </div>
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
              </ResizablePanel>

              {/* Terminal panel */}
              {showTerminal && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={35} minSize={15} maxSize={60}>
                    <div className="h-full flex flex-col bg-[#1e1e1e]">
                      <div className="h-9 bg-[#252526] flex items-center px-4 gap-3 text-xs flex-shrink-0 border-t border-[#1e1e1e]">
                        <button className="text-[#cccccc] border-b-2 border-[#569cd6] pb-0.5 px-1">Terminal</button>
                        <button className="text-[#cccccc]/50 hover:text-[#cccccc] pb-0.5 px-1">Output</button>
                        <div className="flex-1" />
                        <button onClick={() => setTerminalHistory([])} className="text-[10px] px-2 py-0.5 rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc]/70" title="Clear">Clear</button>
                        <button onClick={() => setShowTerminal(false)} className="text-[#cccccc]/40 hover:text-[#cccccc] text-sm" title="Close">✕</button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5">
                        {terminalHistory.length === 0 && <span className="text-[#cccccc]/30">Terminal ready. Press ▶ Run or Ctrl+Enter to execute code.</span>}
                        {terminalHistory.map((entry, i) => (
                          <div key={`${entry.time}-${i}`} className={cn(
                            'whitespace-pre-wrap',
                            entry.type === 'stdout' && 'text-[#cccccc]',
                            entry.type === 'stderr' && 'text-[#ce9178]',
                            entry.type === 'error' && 'text-[#f44747]',
                            entry.type === 'info' && 'text-[#569cd6]',
                          )}>{entry.text}</div>
                        ))}
                        {running && <div className="text-[#569cd6] animate-pulse">Executing...</div>}
                        <div ref={terminalEndRef} />
                      </div>
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* ── Status bar ── */}
      <div className="h-6 bg-[#007acc] flex items-center px-3 text-[11px] text-white/90 flex-shrink-0 gap-4">
        <span className="flex items-center gap-1">{LANG_ICONS[editedLang] || '📄'} {editedLang}</span>
        <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span className="cursor-pointer hover:text-white" onClick={() => setShowMinimap(p => !p)}>Minimap: {showMinimap ? 'On' : 'Off'}</span>
        <span className="cursor-pointer hover:text-white" onClick={() => setWordWrap(w => w === 'on' ? 'off' : 'on')}>Wrap: {wordWrap === 'on' ? 'On' : 'Off'}</span>
        <span className="cursor-pointer hover:text-white" onClick={() => setFontSize(s => Math.min(s + 1, 30))}>Font: {fontSize}px</span>
        <div className="flex-1" />
        {running && <span className="animate-pulse">● Running...</span>}
        <span className="text-white/60">{items.length} file{items.length !== 1 ? 's' : ''}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-300" />Jarvis IDE</span>
      </div>

      {/* ── New file dialog ── */}
      {newFileDialog && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-[20vh]" onClick={() => setNewFileDialog(false)}>
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl w-[400px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 text-xs text-[#cccccc]/60">New File</div>
            <div className="px-4 pb-4">
              <input autoFocus value={newFileName} onChange={e => setNewFileName(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') handleNewFile(); if (e.key === 'Escape') setNewFileDialog(false) }}
                     placeholder="Enter filename (e.g. index.html, app.py)"
                     className="w-full h-8 px-3 bg-[#3c3c3c] border border-[#007acc] rounded text-sm text-[#cccccc] outline-none placeholder:text-[#cccccc]/30" />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setNewFileDialog(false)} className="px-3 py-1 text-xs rounded bg-[#3c3c3c] hover:bg-[#505050] text-[#cccccc]/70">Cancel</button>
                <button onClick={handleNewFile} className="px-3 py-1 text-xs rounded bg-[#007acc] hover:bg-[#0069b3] text-white">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Command Palette ── */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-start justify-center pt-[12vh]" onClick={() => setCommandPaletteOpen(false)}>
          <div className="bg-[#252526] border border-[#007acc] rounded-lg shadow-2xl w-[520px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <input autoFocus value={commandFilter} onChange={e => setCommandFilter(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Escape') setCommandPaletteOpen(false) }}
                   placeholder="Type a command..."
                   className="w-full h-9 px-4 bg-[#3c3c3c] border-b border-[#252526] text-sm text-[#cccccc] outline-none placeholder:text-[#cccccc]/30" />
            <div className="max-h-[300px] overflow-y-auto">
              {commands.map(cmd => (
                <button key={cmd.id} disabled={cmd.disabled}
                        onClick={() => { cmd.action(); setCommandPaletteOpen(false) }}
                        className={cn('w-full px-4 py-2 text-left text-[13px] flex items-center justify-between', cmd.disabled ? 'text-[#cccccc]/30 cursor-not-allowed' : 'text-[#cccccc]/80 hover:bg-[#04395e]')}>
                  <span>{cmd.label}</span>
                  {cmd.shortcut && <span className="text-[10px] text-[#cccccc]/40 font-mono">{cmd.shortcut}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ActivityBarButton({ icon, label, active, onClick }: Readonly<{
  icon: string; label: string; active: boolean; onClick: () => void
}>) {
  return (
    <button onClick={onClick} title={label}
      className={cn('w-10 h-10 flex items-center justify-center rounded text-base transition-colors',
        active ? 'text-white bg-[#505050]/60 border-l-2 border-white' : 'text-[#cccccc]/40 hover:text-[#cccccc]')}>
      {icon}
    </button>
  )
}

function FileExplorerItem({ item, active, onClick }: Readonly<{
  item: CodeItem; active: boolean; onClick: () => void
}>) {
  return (
    <button onClick={onClick}
      className={cn('w-full flex items-center gap-2 px-3 py-1 text-[12px] rounded-sm transition-colors text-left',
        active ? 'bg-[#37373d] text-[#cccccc]' : 'text-[#cccccc]/70 hover:bg-[#2a2d2e]')}>
      <span className="text-[10px] flex-shrink-0">{LANG_ICONS[item.language] || '📄'}</span>
      <span className="truncate">{item.filename || `${item.language} snippet`}</span>
    </button>
  )
}

function EditorTab({ item, active, onClick, onClose }: Readonly<{
  item: CodeItem; active: boolean; onClick: () => void; onClose: (e: React.MouseEvent) => void
}>) {
  return (
    <button onClick={onClick}
      className={cn('group flex items-center gap-1.5 px-3 h-full text-[12px] border-r border-[#1e1e1e] min-w-0 flex-shrink-0',
        active ? 'bg-[#1e1e1e] text-[#cccccc] border-t-2 border-t-[#007acc]' : 'bg-[#2d2d2d] text-[#cccccc]/60 hover:bg-[#2d2d2d]/80 border-t-2 border-t-transparent')}>
      <span className="text-[9px] flex-shrink-0">{LANG_ICONS[item.language] || '📄'}</span>
      <span className="truncate max-w-[120px]">{item.filename || `${item.language} snippet`}</span>
      <span onClick={onClose} className="ml-1 w-4 h-4 flex items-center justify-center rounded text-[10px] opacity-0 group-hover:opacity-100 hover:bg-[#505050] flex-shrink-0">✕</span>
    </button>
  )
}

function ToolbarButton({ icon, label, onClick, disabled, active, highlight }: Readonly<{
  icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean; highlight?: boolean
}>) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={cn('h-6 px-2 flex items-center gap-1 rounded text-[11px] transition-colors',
        disabled && 'opacity-30 cursor-not-allowed',
        active && 'bg-[#505050]/60 text-[#cccccc]',
        highlight && !disabled ? 'bg-[#388a34] hover:bg-[#369432] text-white' : 'text-[#cccccc]/70 hover:text-[#cccccc] hover:bg-[#505050]/40')}>
      <span className="text-[10px]">{icon}</span><span>{label}</span>
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-[#505050]/50 mx-0.5" />
}

function PreviewFromJS({ code, lang }: Readonly<{ code: string; lang: string }>) {
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const doc = ref.current.contentDocument
    if (!doc) return
    if (lang === 'css') {
      doc.open() // NOSONAR
      doc.write(`<!DOCTYPE html><html><head><style>${code}</style></head><body><div class="preview"><h1>CSS Preview</h1><p>Your styles are applied to this page.</p><button>Button</button><a href="#">Link</a><ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul></div></body></html>`) // NOSONAR
      doc.close()
    } else if (lang === 'javascript') {
      doc.open() // NOSONAR
      doc.write(`<!DOCTYPE html><html><head><style>body{font-family:system-ui;padding:20px;background:#1e1e1e;color:#ccc}pre{background:#252526;padding:12px;border-radius:6px;white-space:pre-wrap}</style></head><body><pre id="output"></pre><script>
const _out=document.getElementById('output');
const _log=console.log;
console.log=function(){_out.textContent+=Array.from(arguments).join(' ')+'\\n';_log.apply(console,arguments)};
console.error=function(){const s=document.createElement('span');s.style.color='#f44747';s.textContent=Array.from(arguments).join(' ')+'\\n';_out.appendChild(s)};
try{${code}}catch(e){console.error(e.message)}
</` + `script></body></html>`) // NOSONAR
      doc.close()
    }
  }, [code, lang])
  return <iframe ref={ref} className="w-full h-full border-none" title="Preview" sandbox="allow-scripts" />
}
