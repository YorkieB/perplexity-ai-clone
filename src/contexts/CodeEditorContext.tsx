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
}

interface CodeEditorContextValue {
  control: CodeEditorControl | null
  register: (control: CodeEditorControl) => void
  unregister: () => void
  items: CodeItem[]
  addItem: (item: CodeItem) => void
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

  const value = useMemo<CodeEditorContextValue>(() => ({
    get control() { return controlRef.current },
    register,
    unregister,
    items,
    addItem,
    activeItemId,
    setActiveItemId,
    running,
    setRunning,
    runResult,
    setRunResult,
  }), [register, unregister, items, addItem, activeItemId, running, runResult])

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
  const { items, addItem, activeItemId, setActiveItemId } = useContext(CodeEditorContext)
  return { items, addItem, activeItemId, setActiveItemId }
}

export function useCodeEditorRunning() {
  const { running, setRunning, runResult, setRunResult } = useContext(CodeEditorContext)
  return { running, setRunning, runResult, setRunResult }
}
