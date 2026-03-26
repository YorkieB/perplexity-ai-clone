import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react'
import type { JarvisExplorerFileMeta } from '@/lib/jarvis-explorer-badges'
import type { JarvisIdeRunCommandResult } from '@/types/jarvis-ide'

export interface CodeItem {
  id: string
  code: string
  language: string
  filename?: string
  createdAt: number
  /** Absolute path on disk when opened from or saved to the filesystem (Electron). */
  diskPath?: string
  /** Optional AI / Composer / test / missing-logic flags for explorer badges. */
  jarvisExplorer?: JarvisExplorerFileMeta
}

export interface CodeRunResult {
  stdout: string
  stderr: string
  error?: string
  elapsed: number
}

export interface CodeEditorControl {
  showCode: (code: string, language: string, filename?: string) => void
  isOpen: () => boolean
  openEditor: () => void

  // Full automation API — File Management
  createFile: (filename: string, code: string, language: string) => string
  editFile: (fileId: string, newCode: string) => boolean
  deleteFile: (fileId: string) => boolean
  openFile: (fileId: string) => boolean
  renameFile: (fileId: string, newName: string) => boolean
  getFiles: () => Array<{ id: string; filename: string; language: string }>
  getActiveFile: () => { id: string; filename: string; language: string; code: string } | null
  getFileContent: (fileId: string) => string | null

  // Editing
  insertText: (text: string, position?: 'cursor' | 'start' | 'end') => boolean
  replaceText: (search: string, replace: string, all?: boolean) => number
  findInFile: (query: string) => Array<{ line: number; column: number; text: string }>
  setLanguage: (lang: string) => void

  // Execution
  runActiveFile: () => Promise<CodeRunResult>
  getLastRunResult: () => CodeRunResult | null

  // Panels & Layout
  togglePreview: () => void
  toggleTerminal: () => void
  toggleZenMode: () => void
  toggleSplitEditor: (fileId?: string) => void
  toggleDiffEditor: (targetFileId?: string) => void
  toggleExplorer: () => void
  toggleProblemsPanel: () => void
  toggleSearchPanel: () => void
  toggleOutlinePanel: () => void
  toggleSettingsPanel: () => void

  // Theme & Settings
  setTheme: (themeId: string) => void
  getTheme: () => string
  getAvailableThemes: () => Array<{ id: string; label: string }>
  setFontSize: (size: number) => void
  getFontSize: () => number
  setTabSize: (size: number) => void
  setWordWrap: (on: boolean) => void
  setMinimap: (on: boolean) => void
  setAutoSave: (on: boolean) => void
  getSettings: () => Record<string, unknown>

  // Search
  searchAllFiles: (query: string) => Array<{ fileId: string; filename: string; line: number; text: string }>

  // Outline / Symbols
  getOutlineSymbols: () => Array<{ name: string; kind: string; line: number }>

  // Problems
  getProblems: () => Array<{ line: number; column: number; severity: string; message: string; source: string }>

  // Terminal
  getTerminalOutput: () => string
  getWorkspaceRoot: () => string | null
  runTerminalCommand: (command: string) => Promise<JarvisIdeRunCommandResult>

  // Templates
  createFromTemplate: (templateName: string) => string | null
  getAvailableTemplates: () => string[]

  // Navigation
  goToLine: (line: number) => void
  revealLine: (line: number) => void

  // Format
  formatDocument: () => void
}

interface CodeEditorContextValue {
  control: CodeEditorControl | null
  register: (control: CodeEditorControl) => void
  unregister: () => void
  items: CodeItem[]
  addItem: (item: CodeItem) => void
  removeItem: (id: string) => void
  updateItem: (id: string, updates: Partial<Omit<CodeItem, 'id'>>) => void
  activeItemId: string | null
  setActiveItemId: (id: string | null) => void
  running: boolean
  setRunning: (on: boolean) => void
  runResult: CodeRunResult | null
  setRunResult: (result: CodeRunResult | null) => void
}

const noop: CodeEditorContextValue = {
  control: null,
  register: () => {},
  unregister: () => {},
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateItem: () => {},
  activeItemId: null,
  setActiveItemId: () => {},
  running: false,
  setRunning: () => {},
  runResult: null,
  setRunResult: () => {},
}

export const CodeEditorContext = createContext<CodeEditorContextValue>(noop)

export function CodeEditorProvider({ children }: { readonly children: ReactNode }) {
  const [control, setControl] = useState<CodeEditorControl | null>(null)
  const [items, setItems] = useState<CodeItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null)

  const register = useCallback((ctrl: CodeEditorControl) => { setControl(ctrl) }, [])
  const unregister = useCallback(() => { setControl(null) }, [])

  const addItem = useCallback((item: CodeItem) => {
    setItems(prev => [...prev, item])
    setActiveItemId(item.id)
    setRunResult(null)
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const filtered = prev.filter(i => i.id !== id)
      const idx = prev.findIndex(i => i.id === id)
      const next = prev[idx + 1] || prev[idx - 1]
      setActiveItemId(current => current === id ? (next?.id || null) : current)
      return filtered
    })
  }, [])

  const updateItem = useCallback((id: string, updates: Partial<Omit<CodeItem, 'id'>>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
  }, [])

  const value = useMemo<CodeEditorContextValue>(() => ({
    control,
    register,
    unregister,
    items,
    addItem,
    removeItem,
    updateItem,
    activeItemId,
    setActiveItemId,
    running,
    setRunning,
    runResult,
    setRunResult,
  }), [control, register, unregister, items, addItem, removeItem, updateItem, activeItemId, running, runResult])

  return (
    <CodeEditorContext.Provider value={value}>
      {children}
    </CodeEditorContext.Provider>
  )
}
