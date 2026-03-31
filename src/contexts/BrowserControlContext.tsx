import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface TabInfo {
  id: string
  url: string
  title: string
  active: boolean
}

export interface BrowserControl {
  navigate: (url: string) => Promise<{ ok: boolean; url: string; title: string }>
  snapshot: () => Promise<string>
  click: (ref: string) => Promise<{ ok: boolean }>
  type: (ref: string, text: string) => Promise<{ ok: boolean }>
  /** Guide mode: draw a viewport overlay around a snapshot ref; pass `null` to clear. Webview/Electron only. */
  highlightRef?: (ref: string | null, label?: string) => Promise<void>
  extractText: () => Promise<string>
  scroll: (direction: 'up' | 'down') => Promise<{ ok: boolean }>
  goBack: () => Promise<{ ok: boolean }>
  goForward: () => Promise<{ ok: boolean }>
  getCurrentUrl: () => string
  isOpen: () => boolean
  openBrowser: () => void
  newTab: (url?: string) => Promise<{ ok: boolean; tabId: string }>
  switchTab: (tabId: string) => Promise<{ ok: boolean }>
  closeTab: (tabId: string) => Promise<{ ok: boolean }>
  listTabs: () => TabInfo[]
}

export interface AgentStepInfo {
  action: string
  result: string
  timestamp: number
}

interface BrowserControlContextValue {
  control: BrowserControl | null
  register: (control: BrowserControl) => void
  unregister: () => void
  guideMode: boolean
  setGuideMode: (on: boolean) => void
  automating: boolean
  setAutomating: (on: boolean) => void
  agentSteps: AgentStepInfo[]
  addAgentStep: (step: AgentStepInfo) => void
  clearAgentSteps: () => void
}

const noop: BrowserControlContextValue = {
  control: null,
  register: () => {},
  unregister: () => {},
  guideMode: false,
  setGuideMode: () => {},
  automating: false,
  setAutomating: () => {},
  agentSteps: [],
  addAgentStep: () => {},
  clearAgentSteps: () => {},
}

const BrowserControlContext = createContext<BrowserControlContextValue>(noop)

export function BrowserControlProvider({ children }: { readonly children: ReactNode }) {
  const controlRef = useRef<BrowserControl | null>(null)
  const [guideMode, setGuideMode] = useState(false)
  const [automating, setAutomating] = useState(false)
  const [agentSteps, setAgentSteps] = useState<AgentStepInfo[]>([])

  const register = useCallback((ctrl: BrowserControl) => {
    controlRef.current = ctrl
  }, [])

  const unregister = useCallback(() => {
    controlRef.current = null
  }, [])

  const addAgentStep = useCallback((step: AgentStepInfo) => {
    setAgentSteps(prev => [...prev, step])
  }, [])

  const clearAgentSteps = useCallback(() => {
    setAgentSteps([])
  }, [])

  const value = useMemo<BrowserControlContextValue>(() => ({
    get control() { return controlRef.current },
    register,
    unregister,
    guideMode,
    setGuideMode,
    automating,
    setAutomating,
    agentSteps,
    addAgentStep,
    clearAgentSteps,
  }), [register, unregister, guideMode, automating, agentSteps, addAgentStep, clearAgentSteps])

  return (
    <BrowserControlContext.Provider value={value}>
      {children}
    </BrowserControlContext.Provider>
  )
}

export function useBrowserControlRegister() {
  const { register, unregister } = useContext(BrowserControlContext)
  return { register, unregister }
}

export function useBrowserControl(): BrowserControl | null {
  const { control } = useContext(BrowserControlContext)
  return control
}

export function useBrowserGuideMode() {
  const { guideMode, setGuideMode } = useContext(BrowserControlContext)
  return { guideMode, setGuideMode }
}

export function useBrowserAutomating() {
  const { automating, setAutomating } = useContext(BrowserControlContext)
  return { automating, setAutomating }
}

export function useBrowserAgentSteps() {
  const { agentSteps, addAgentStep, clearAgentSteps } = useContext(BrowserControlContext)
  return { agentSteps, addAgentStep, clearAgentSteps }
}
