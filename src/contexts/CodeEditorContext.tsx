import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface CodeItem {
  id: string
  code: string
  language: string
  filename?: string
  createdAt: number
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

  // Full automation API
  createFile: (filename: string, code: string, language: string) => string
  editFile: (fileId: string, newCode: string) => boolean
  deleteFile: (fileId: string) => boolean
  openFile: (fileId: string) => boolean
  renameFile: (fileId: string, newName: string) => boolean
  getFiles: () => Array<{ id: string; filename: string; language: string }>
  getActiveFile: () => { id: string; filename: string; language: string; code: string } | null
  getFileContent: (fileId: string) => string | null
  runActiveFile: () => Promise<CodeRunResult>
  getLastRunResult: () => CodeRunResult | null
  setLanguage: (lang: string) => void
  togglePreview: () => void
  toggleTerminal: () => void
  insertText: (text: string, position?: 'cursor' | 'start' | 'end') => boolean
  replaceText: (search: string, replace: string, all?: boolean) => number
  findInFile: (query: string) => Array<{ line: number; column: number; text: string }>
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

const CodeEditorContext = createContext<CodeEditorContextValue>(noop)

export function CodeEditorProvider({ children }: { readonly children: ReactNode }) {
  const controlRef = useRef<CodeEditorControl | null>(null)
  const [items, setItems] = useState<CodeItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null)

  const register = useCallback((ctrl: CodeEditorControl) => { controlRef.current = ctrl }, [])
  const unregister = useCallback(() => { controlRef.current = null }, [])

  const addItem = useCallback((item: CodeItem) => {
    setItems(prev => [...prev, item])
    setActiveItemId(item.id)
    setRunResult(null)
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const filtered = prev.filter(i => i.id !== id)
      return filtered
    })
    setActiveItemId(prev => {
      if (prev === id) {
        const currentItems = items
        const idx = currentItems.findIndex(i => i.id === id)
        const next = currentItems[idx + 1] || currentItems[idx - 1]
        return next?.id || null
      }
      return prev
    })
  }, [items])

  const updateItem = useCallback((id: string, updates: Partial<Omit<CodeItem, 'id'>>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
  }, [])

  const value = useMemo<CodeEditorContextValue>(() => ({
    get control() { return controlRef.current },
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
  }), [register, unregister, items, addItem, removeItem, updateItem, activeItemId, running, runResult])

  return (
    <CodeEditorContext.Provider value={value}>
      {children}
    </CodeEditorContext.Provider>
  )
}

export function useCodeEditorRegister() {
  const { register, unregister } = useContext(CodeEditorContext)
  return { register, unregister }
}

export function useCodeEditor(): CodeEditorControl | null {
  const { control } = useContext(CodeEditorContext)
  return control
}

export function useCodeEditorItems() {
  const { items, addItem, removeItem, updateItem, activeItemId, setActiveItemId } = useContext(CodeEditorContext)
  return { items, addItem, removeItem, updateItem, activeItemId, setActiveItemId }
}

export function useCodeEditorRunning() {
  const { running, setRunning, runResult, setRunResult } = useContext(CodeEditorContext)
  return { running, setRunning, runResult, setRunResult }
}
